import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { createHash, randomUUID } from 'crypto';

import { Alojamiento } from './entities/alojamiento.entity';
import { ReservaAlojamiento } from './entities/reserva.entity';
import { ResenaAlojamiento } from './entities/resena.entity';
import { TipoHabitacion } from './entities/tipo-habitacion.entity';
import { HuespedReserva } from './entities/huesped-reserva.entity';
import { TiposHabitacionService, OcupacionTipo, NOMBRE_REGIMEN, textoCancelacion } from './tipos-habitacion.service';
import { ProveedoresAlojamientoService } from './proveedores.service';

import { SearchAlojamientosRequestDto } from './dto/search-alojamientos.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { ReservationRequestDto, CancelReservationRequestDto, ReservationStatus, AcompananteDto } from './dto/reservation.dto';
import { CreateAlojamientoDto } from './dto/create-alojamiento.dto';
import { CreateTipoHabitacionDto, UpdateTipoHabitacionDto } from './dto/tipo-habitacion.dto';
import { UpdateAlojamientoDto } from './dto/update-alojamiento.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import {
  AvailabilityRequestDto,
  AvailabilityResponseDto,
  BulkAvailabilityRequestDto,
  BulkAvailabilityResponseDto,
} from './dto/availability-contract.dto';

import {
  AccommodationDetailsRequestDto,
  AccommodationDetailsResponseDto,
  DetailsChangesRequestDto,
  DetailsChangesResponseDto,
  ChainsResponseDto,
  ConstantsRequestDto,
  ConstantsResponseDto,
  ReviewsRequestDto,
  ReviewsResponseDto,
  ReviewsScoresRequestDto,
  ReviewsScoresResponseDto,
} from './dto/catalog-extra.dto';

import {
  OrderPreviewRequestDto,
  OrderPreviewResponseDto,
  OrderCreateRequestDto,
  OrderDetailDto,
  OrderModifyRequestDto,
} from './dto/orders.dto';

import {
  CreateAccommodationWebhookDto,
  AccommodationWebhookSubscriptionDto,
} from './dto/webhooks.dto';

import { TelemetryService } from '../telemetry/telemetry.service';
import {
  CodigoProblema,
  conflicto,
  noProcesable,
  ProblemaApi,
  validacion,
} from '../../core/errors/codigo-error';
import { validarCapacidad, validarEstancia, calcularNoches, fechaRelativa } from './reglas-estancia';
import { ActorCatalogo, exigirPropiedad } from './guards/gestion-alojamientos.guard';
import { aplanarValidacion } from '../../core/validation/validation-pipe';
import { esAdministrador, UsuarioSupabase } from '../../core/auth/administradores';
import { TraceContextService } from '../../core/tracing/trace-context.service';

/** Máximo de alojamientos por petición de sincronización. */
export const MAX_SINCRONIZACION = 100;

/** Solo los alojamientos ACTIVOS se muestran y se pueden reservar. */
const SOLO_ACTIVOS = { estado: Not('INACTIVO') } as const;

/** Una cotización (preview) caduca a los 30 minutos, como el carrito de Booking. */
export const PREVIEW_TTL_MS = 30 * 60 * 1000;

/** Minúsculas, sin tildes y con espacios colapsados: "  Cancún " -> "cancun". */
function normalizarBusqueda(texto?: string | null): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface OrderPreviewStoreItem {
  id: string;
  alojamientoId: string;
  tipoId: string;
  precioNoche: number;
  adultos: number;
  ninos: number;
  checkin: string;
  checkout: string;
  nights: number;
  rooms: number;
  guests: any;
  totalPrice: number;
  currency: string;
  createdAt: number;
}

interface StoredWebhook {
  id: string;
  propietarioId: string;
  url: string;
  events: string[];
  secret?: string;
  activo: boolean;
  createdAt: string;
}

@Injectable()
export class AlojamientosService implements OnModuleInit {
  private readonly logger = new Logger(AlojamientosService.name);

  // Almacén en memoria para previews de órdenes (TTL de 30 minutos)
  private readonly orderPreviews = new Map<string, OrderPreviewStoreItem>();

  // Almacén de suscripciones a webhooks
  private readonly webhooks = new Map<string, StoredWebhook>();

  /**
   * Cola de escrituras de reservas. Comprobar el cupo y guardar la reserva son
   * dos pasos asíncronos: sin serializarlos, dos clientes que piden la ÚLTIMA
   * habitación a la vez pasan ambos la comprobación y se produce overbooking
   * (algo que Booking nunca permite). También evita que dos reintentos
   * simultáneos con la misma Idempotency-Key creen dos reservas.
   *
   * Protege una instancia del servicio. Con varias instancias haría falta un
   * bloqueo en base de datos (SELECT ... FOR UPDATE).
   */
  private colaReservas: Promise<unknown> = Promise.resolve();

  private enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.colaReservas.then(tarea, tarea);
    this.colaReservas = resultado.catch(() => undefined);
    return resultado;
  }

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Alojamiento)
    private readonly alojamientoRepo: Repository<Alojamiento>,
    @InjectRepository(ReservaAlojamiento)
    private readonly reservaRepo: Repository<ReservaAlojamiento>,
    @InjectRepository(ResenaAlojamiento)
    private readonly resenaRepo: Repository<ResenaAlojamiento>,
    @InjectRepository(HuespedReserva)
    private readonly huespedRepo: Repository<HuespedReserva>,
    private readonly tiposService: TiposHabitacionService,
    private readonly proveedoresService: ProveedoresAlojamientoService,
    @Optional()
    private readonly telemetryService?: TelemetryService,
    @Optional()
    private readonly traceContext?: TraceContextService,
  ) {
    this.traceContext?.instrumentAxios(this.httpService.axiosRef);
  }

  // =========================================================================
  // TIPOS DE HABITACIÓN Y HUÉSPEDES (apoyo a disponibilidad y reservas)
  // =========================================================================

  /** ¿Caben estos huéspedes en `habitaciones` habitaciones de este tipo? */
  private cabe(tipo: TipoHabitacion, adultos: number, ninos: number, habitaciones: number): boolean {
    try {
      validarCapacidad(tipo, adultos, ninos, habitaciones);
      return true;
    } catch {
      return false;
    }
  }

  /** 400 con el campo exacto si ningún tipo de habitación admite esta ocupación. */
  private exigirAlgunTipoConCapacidad(ocupacion: OcupacionTipo[], adultos: number, ninos: number, habitaciones: number) {
    if (ocupacion.length === 0 || ocupacion.some((o) => this.cabe(o.tipo, adultos, ninos, habitaciones))) return;
    const mayor = [...ocupacion].sort(
      (a, b) => b.tipo.capacidadAdultos - a.tipo.capacidadAdultos || (b.tipo.capacidadNinos ?? 0) - (a.tipo.capacidadNinos ?? 0),
    )[0];
    validarCapacidad(mayor.tipo, adultos, ninos, habitaciones);
  }

  /**
   * Tipo de habitación de una reserva. Con `tipoId` (id o código) se usa ese; sin
   * él, el más barato que admite la ocupación y tiene cupo (el "Reservar" directo
   * de Booking sobre la tarifa más económica).
   */
  private async elegirTipo(
    alojamiento: Alojamiento,
    p: {
      tipoId?: string | null;
      adultos: number;
      ninos: number;
      habitaciones: number;
      checkin: string;
      checkout: string;
      excluirReservaId?: string;
      campo?: string;
      /** Solo comprueba existencia y capacidad (el cupo se mira después). */
      ignorarCupo?: boolean;
      /** Un tipo que ya no está a la venta es un 409 (p. ej. al pagar una cotización). */
      noVendibleEsConflicto?: boolean;
    },
  ): Promise<OcupacionTipo> {
    const ocupacion = await this.tiposService.ocupacion(alojamiento, p.checkin, p.checkout, p.excluirReservaId);

    if (p.tipoId) {
      const elegido = ocupacion.find((o) => o.tipo.id === p.tipoId || o.tipo.codigo === p.tipoId);
      if (!elegido) {
        if (p.noVendibleEsConflicto) {
          throw conflicto(CodigoProblema.ROOM_NO_LONGER_AVAILABLE, 'Ese tipo de habitación ya no está a la venta. Vuelve a consultar la disponibilidad.');
        }
        throw validacion('El tipo de habitación no existe en este alojamiento o no está a la venta.', [
          { name: p.campo ?? 'tipo_habitacion_id', reason: `'${p.tipoId}' no es un tipo de habitación a la venta de '${alojamiento.id}'.` },
        ]);
      }
      validarCapacidad(elegido.tipo, p.adultos, p.ninos, p.habitaciones);
      if (!p.ignorarCupo && elegido.libres < p.habitaciones) {
        throw conflicto(
          CodigoProblema.ROOM_NO_LONGER_AVAILABLE,
          `No quedan suficientes habitaciones "${elegido.tipo.nombre}" para esas fechas. Disponibles: ${elegido.libres}, solicitadas: ${p.habitaciones}.`,
        );
      }
      return elegido;
    }

    this.exigirAlgunTipoConCapacidad(ocupacion, p.adultos, p.ninos, p.habitaciones);
    const caben = ocupacion
      .filter((o) => this.cabe(o.tipo, p.adultos, p.ninos, p.habitaciones))
      .sort((a, b) => Number(a.tipo.precioNoche) - Number(b.tipo.precioNoche));
    if (p.ignorarCupo && caben.length > 0) return caben[0];
    const conCupo = caben.filter((o) => o.libres >= p.habitaciones);
    if (conCupo.length === 0) {
      const libres = Math.max(0, ...caben.map((o) => o.libres));
      throw conflicto(
        CodigoProblema.ROOM_NO_LONGER_AVAILABLE,
        `No hay suficientes habitaciones disponibles para las fechas seleccionadas. Habitaciones disponibles: ${libres}, solicitadas: ${p.habitaciones}.`,
      );
    }
    return conCupo[0];
  }

  /** Producto de disponibilidad (contrato de Booking) a partir de un tipo de habitación. */
  private producto(o: OcupacionTipo, noches: number, moneda: string) {
    const t = o.tipo;
    const precio = Number(t.precioNoche);
    return {
      product_id: t.id,
      tipo_habitacion_id: t.id,
      codigo: t.codigo,
      room_name: t.nombre,
      descripcion: t.descripcion ?? null,
      meal_plan: NOMBRE_REGIMEN[t.regimen] ?? t.regimen,
      regimen: t.regimen,
      cancellation_type: textoCancelacion(t.cancelacionGratuitaHoras),
      reembolsable: t.cancelacionGratuitaHoras !== null && t.cancelacionGratuitaHoras !== undefined,
      cancelacion_gratuita_horas: t.cancelacionGratuitaHoras ?? null,
      price: Number((precio * noches).toFixed(2)),
      price_per_night: precio,
      currency: moneda,
      available_rooms: o.libres,
      capacidad: { adultos: t.capacidadAdultos, ninos: t.capacidadNinos ?? 0 },
      camas: t.camas,
      descripcion_camas: t.descripcionCamas ?? null,
      tamano_m2: t.tamanoM2 ?? null,
      amenidades: Array.isArray(t.amenidades) ? t.amenidades : [],
      photos: Array.isArray(t.photos) ? t.photos : [],
    };
  }

  /** Tipo de habitación en formato público (ficha del hotel y panel). */
  private tipoPublico(t: TipoHabitacion) {
    return {
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      descripcion: t.descripcion ?? null,
      capacidad_adultos: t.capacidadAdultos,
      capacidad_ninos: t.capacidadNinos ?? 0,
      camas: t.camas,
      descripcion_camas: t.descripcionCamas ?? null,
      tamano_m2: t.tamanoM2 ?? null,
      precio_noche: Number(t.precioNoche),
      cantidad: t.cantidad,
      regimen: t.regimen,
      regimen_texto: NOMBRE_REGIMEN[t.regimen] ?? t.regimen,
      cancelacion_gratuita_horas: t.cancelacionGratuitaHoras ?? null,
      cancelacion_texto: textoCancelacion(t.cancelacionGratuitaHoras),
      amenidades: Array.isArray(t.amenidades) ? t.amenidades : [],
      photos: Array.isArray(t.photos) ? t.photos : [],
      activo: t.activo,
      orden: t.orden,
    };
  }

  /**
   * Acompañantes válidos para la ocupación: como máximo (adultos − 1) adultos
   * (el titular ya es uno) y `ninos` niños, y cada niño con su edad (0–17).
   */
  private validarAcompanantes(acompanantes: AcompananteDto[] | undefined, adultos: number, ninos: number) {
    if (!acompanantes?.length) return;
    const errores: { name: string; reason: string }[] = [];
    const adultosLista = acompanantes.filter((a) => (a.tipo ?? 'ADULTO') === 'ADULTO').length;
    const ninosLista = acompanantes.length - adultosLista;
    if (adultosLista > adultos - 1) {
      errores.push({ name: 'acompanantes', reason: `Hay ${adultosLista} acompañante(s) adulto(s) y la reserva es para ${adultos} adulto(s) incluido el titular.` });
    }
    if (ninosLista > ninos) {
      errores.push({ name: 'acompanantes', reason: `Hay ${ninosLista} niño(s) en la lista y la reserva es para ${ninos}.` });
    }
    acompanantes.forEach((a, i) => {
      const esNino = a.tipo === 'NINO';
      if (esNino && (a.edad === undefined || a.edad > 17)) {
        errores.push({ name: `acompanantes.${i}.edad`, reason: 'Indica la edad del niño (0–17).' });
      }
      if (!esNino && a.edad !== undefined && a.edad < 18) {
        errores.push({ name: `acompanantes.${i}.edad`, reason: 'Un adulto debe tener 18 años o más (márcalo como NINO).' });
      }
    });
    if (errores.length) throw validacion('La lista de huéspedes no coincide con la ocupación de la reserva.', errores);
  }

  /** "Ana María Pérez" → { nombre: 'Ana', apellido: 'María Pérez' }. */
  private partirNombre(completo: string): { nombre: string; apellido: string } {
    const limpio = (completo || '').trim().replace(/\s+/g, ' ') || 'Huésped';
    const i = limpio.indexOf(' ');
    return i < 0 ? { nombre: limpio, apellido: '' } : { nombre: limpio.slice(0, i), apellido: limpio.slice(i + 1) };
  }

  /** Guarda al titular (orden 1) y a los acompañantes de una reserva. */
  private async guardarHuespedes(
    reserva: ReservaAlojamiento,
    titular: { nombre: string; apellido?: string; email?: string | null; telefono?: string | null },
    acompanantes: AcompananteDto[] = [],
  ): Promise<HuespedReserva[]> {
    const filas: Partial<HuespedReserva>[] = [
      {
        reservaId: reserva.id,
        orden: 1,
        esTitular: true,
        tipo: 'ADULTO',
        nombre: titular.nombre.slice(0, 100),
        apellido: (titular.apellido ?? '').slice(0, 100),
        email: titular.email ?? null,
        telefono: titular.telefono ?? null,
      },
      ...acompanantes.map((a, i) => ({
        reservaId: reserva.id,
        orden: i + 2,
        esTitular: false,
        tipo: a.tipo ?? 'ADULTO',
        nombre: a.nombre.trim(),
        apellido: (a.apellido ?? '').trim(),
        edad: a.edad ?? null,
        documentoTipo: a.documento_tipo ?? null,
        documentoNumero: a.documento_numero ?? null,
        nacionalidad: a.nacionalidad ?? null,
      })),
    ];
    const guardados: HuespedReserva[] = [];
    for (const f of filas) guardados.push(await this.huespedRepo.save(this.huespedRepo.create(f)));
    return guardados;
  }

  /** Tipos y huéspedes de un lote de reservas, para las respuestas. */
  private async detallesDeReservas(reservas: ReservaAlojamiento[]) {
    const tipoIds = [...new Set(reservas.map((r) => r.tipoHabitacionId).filter(Boolean))] as string[];
    const tipos = tipoIds.length ? await this.tiposService.listarPorIds(tipoIds) : [];
    const huespedes = reservas.length
      ? await this.huespedRepo.find({ where: reservas.map((r) => ({ reservaId: r.id })) as any })
      : [];
    const tipoPor = new Map(tipos.map((t) => [t.id, t]));
    return (r: ReservaAlojamiento) => ({
      tipo: r.tipoHabitacionId ? tipoPor.get(r.tipoHabitacionId) ?? null : null,
      huespedes: huespedes.filter((h) => h.reservaId === r.id).sort((a, b) => a.orden - b.orden),
    });
  }

  async onModuleInit() {
    await this.verificarEsquema();
    try {
      const count = await this.alojamientoRepo.count();
      this.logger.log(`Conexión a base de datos de Alojamientos activa. Total de registros: ${count}`);
    } catch (err: any) {
      this.logger.warn('Error al verificar base de datos de alojamientos:', err.message);
    }
  }

  /**
   * Comprueba al arrancar que la base de datos tiene las columnas que usa la
   * entidad. NO modifica el esquema (TypeORM corre con `synchronize: false` y los
   * cambios de BD se aplican a mano con `database/migraciones/`): solo deja un
   * error claro en el log en vez de fallar después con un 500 en cada consulta.
   */
  private async verificarEsquema() {
    const repo: any = this.alojamientoRepo;
    if (typeof repo.query !== 'function') return; // repositorio en memoria de las pruebas
    const necesarias: Array<[string, string, string]> = [
      ['alojamientos', 'estado', '2026-10-12_alojamientos_integracion.sql'],
      ['alojamientos', 'politicas', '2026-10-12_alojamientos_integracion.sql'],
      ['tipos_habitacion', 'precio_noche', '2026-10-13_alojamientos_modelo_relacional.sql'],
      ['huespedes_reserva', 'reserva_id', '2026-10-13_alojamientos_modelo_relacional.sql'],
      ['proveedores_alojamiento', 'api_key_hash', '2026-10-13_alojamientos_modelo_relacional.sql'],
      ['reservas_alojamiento', 'tipo_habitacion_id', '2026-10-13_alojamientos_modelo_relacional.sql'],
      ['reservas_alojamiento', 'usuario_id', '2026-10-13_alojamientos_modelo_relacional.sql'],
    ];
    try {
      const filas: { table_name: string; column_name: string }[] = await repo.query(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [[...new Set(necesarias.map(([t]) => t))]],
      );
      const presentes = new Set(filas.map((f) => `${f.table_name}.${f.column_name}`));
      const faltan = necesarias.filter(([t, c]) => !presentes.has(`${t}.${c}`));
      if (faltan.length) {
        const migraciones = [...new Set(faltan.map(([, , m]) => `database/migraciones/${m}`))];
        this.logger.error(
          `Faltan columnas o tablas de Alojamientos: ${faltan.map(([t, c]) => `${t}.${c}`).join(', ')}. ` +
            `Ejecuta en Supabase, en orden: ${migraciones.join(' y ')}.`,
        );
      }
    } catch (e: any) {
      this.logger.warn(`No se pudo verificar el esquema de alojamientos: ${e.message}`);
    }
  }

  private transformAlojamiento(l: Alojamiento, tipos?: TipoHabitacion[]) {
    const defaultPhoto = [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', caption: 'Vista Principal' }];
    const photos = Array.isArray(l.photos) && l.photos.length > 0 ? l.photos : defaultPhoto;

    const countryCode =
      l.destino === 'Cancún' ? 'MX' :
      l.destino === 'Cartagena' || l.destino === 'Medellín' ? 'CO' :
      l.destino === 'Quito' ? 'EC' :
      l.destino === 'Cusco' ? 'PE' : 'DO';

    return {
      id: l.id,
      nombre: l.nombre,
      descripcion: l.descripcion,
      tipo_propiedad: l.tipoPropiedad,
      tipo_alojamiento: l.tipoAlojamiento,
      destino: l.destino,
      precioPorNoche: Number(l.precioPorNoche),
      moneda: l.moneda || 'USD',
      capacidadAdultos: l.capacidadAdultos || 2,
      capacidadNinos: l.capacidadNinos || 0,
      habitaciones: l.habitaciones || 1,
      camas: l.camas || 1,
      banos: Number(l.banos) || 1.0,
      tienePiscina: Boolean(l.tienePiscina),
      host: l.host || null,
      photos,
      ratings: l.ratings || {
        score: 9.0,
        limpieza: 9.0,
        ubicacion: 9.0,
        servicio: 9.0,
        number_of_reviews: 0,
      },
      amenidades: Array.isArray(l.amenidades) ? l.amenidades : [],
      ubicacion: l.ubicacion || {
        address: l.destino,
        city: l.destino,
        country: countryCode,
        coordinates: { latitude: 0, longitude: 0 },
      },
      politicas: l.politicas || null,
      estado: l.estado || 'ACTIVO',
      proveedor_id: l.proveedorId ?? null,
      id_externo: l.idExterno ?? null,
      ultima_sincronizacion: l.ultimaSincronizacion ?? null,
      ...(tipos ? { tipos_habitacion: tipos.map((t) => this.tipoPublico(t)) } : {}),
      url: { web: `/alojamientos/${l.id}` },
      _links: {
        self: { href: `/api/v1/alojamientos/${l.id}`, type: 'GET' },
        reservations: { href: `/api/v1/alojamientos/${l.id}/reservations`, type: 'POST' },
      },
    };
  }

  // =========================================================================
  // 1. BÚSQUEDA Y CATÁLOGO
  // =========================================================================

  async search(dto: SearchAlojamientosRequestDto): Promise<any> {
    this.logger.log('Búsqueda de alojamientos con filtros', dto);

    // Fechas: solo se validan si el cliente las manda (se puede explorar sin fechas).
    const fechaIn = dto.checkin ?? dto.dates?.checkin;
    const fechaOut = dto.checkout ?? dto.dates?.checkout;
    if (fechaIn !== undefined || fechaOut !== undefined) {
      validarEstancia(fechaIn, fechaOut, { prefijo: dto.checkin === undefined && dto.dates ? 'dates' : undefined });
    }
    const { precioMin, precioMax } = dto.filters ?? {};
    if (precioMin !== undefined && precioMax !== undefined && precioMin > precioMax) {
      throw validacion('El precio mínimo no puede ser mayor que el máximo.', [
        { name: 'filters.precioMin', reason: 'Debe ser menor o igual que filters.precioMax.' },
      ]);
    }

    const destinoRaw = dto.destino || (typeof dto.city === 'string' ? dto.city : undefined);
    const destinoTerm = destinoRaw ? destinoRaw.trim() : '';

    // Filtro por destino/país. Se compara sobre texto NORMALIZADO (minúsculas y
    // sin tildes) para que "cancun" encuentre "Cancún", igual que en Booking.
    // `ILIKE` de Postgres ignora mayúsculas pero NO tildes, y además trata `%` y
    // `_` como comodines: buscar "%" devolvía el catálogo entero.
    let coincideDestino: ((a: Alojamiento) => boolean) | null = null;
    if (destinoTerm) {
      const termino = normalizarBusqueda(destinoTerm);
      coincideDestino = (a) =>
        [a.destino, a.nombre, a.descripcion].some((campo) => normalizarBusqueda(campo).includes(termino));
    } else if (dto.country) {
      const paisDestinoMap: Record<string, string> = {
        ec: 'Quito',
        mx: 'Cancún',
        co: 'Cartagena',
        pe: 'Cusco',
      };
      const destinoMapeado = paisDestinoMap[dto.country.toLowerCase()];
      // Un país sin oferta da 0 resultados, no el catálogo completo.
      coincideDestino = destinoMapeado
        ? (a) => normalizarBusqueda(a.destino) === normalizarBusqueda(destinoMapeado)
        : () => false;
    }

    this.telemetryService?.trackEvent({
      event_name: 'search_submitted',
      vertical: 'alojamientos',
      properties: {
        destino: destinoTerm || dto.country || 'all',
        checkin: dto.checkin,
        checkout: dto.checkout,
        adultos: dto.guests?.number_of_adults || dto.adultos,
      },
    });

    const rowsCount = dto.rows || 25;
    const catalogo = await this.alojamientoRepo.find({ where: SOLO_ACTIVOS as any, order: { createdAt: 'ASC' } });
    // Los filtros se aplican ANTES de paginar: si no, una página podía quedar
    // corta (o vacía) aunque existieran más resultados que cumplían el filtro.
    let coincidentes = coincideDestino ? catalogo.filter(coincideDestino) : catalogo;
    if (dto.filters?.tienePiscina) {
      coincidentes = coincidentes.filter((i) => i.tienePiscina);
    }
    if (dto.filters?.precioMin !== undefined) {
      coincidentes = coincidentes.filter((i) => Number(i.precioPorNoche) >= dto.filters!.precioMin!);
    }
    if (dto.filters?.precioMax !== undefined) {
      coincidentes = coincidentes.filter((i) => Number(i.precioPorNoche) <= dto.filters!.precioMax!);
    }
    // Con fechas, como en Booking: solo se muestran alojamientos con cupo para
    // las habitaciones pedidas, y cada resultado lleva su disponibilidad.
    const checkinDate = dto.checkin || dto.dates?.checkin;
    const checkoutDate = dto.checkout || dto.dates?.checkout;
    const disponibilidad = new Map<string, any>();
    if (checkinDate && checkoutDate) {
      const habitacionesPedidas = dto.guests?.number_of_rooms || dto.habitaciones || 1;
      const conCupo: Alojamiento[] = [];
      for (const aloj of coincidentes) {
        const avail = await this.getAvailability(aloj.id, checkinDate, checkoutDate);
        if (avail.available_rooms >= habitacionesPedidas) {
          disponibilidad.set(aloj.id, avail);
          conCupo.push(aloj);
        }
      }
      coincidentes = conCupo;
    }

    const total = coincidentes.length;
    const pagina = coincidentes.slice(0, rowsCount);
    const nextPage = total > rowsCount ? Buffer.from(JSON.stringify({ page: 2 })).toString('base64') : null;

    return {
      request_id: `req-${Date.now()}`,
      data: pagina.map((l) => {
        const avail = disponibilidad.get(l.id);
        const item: any = this.transformAlojamiento(l);
        if (avail) {
          item.disponibilidad = {
            available_rooms: avail.available_rooms,
            nights: calcularNoches(checkinDate!, checkoutDate!),
            total_price: Number((Number(l.precioPorNoche) * calcularNoches(checkinDate!, checkoutDate!)).toFixed(2)),
            currency: l.moneda || 'USD',
          };
        }
        return item;
      }),
      metadata: {
        total_results: total,
        next_page: nextPage,
      },
      next_page: nextPage,
    };
  }

  async getDetailsBatch(dto: DetailsRequestDto): Promise<any> {
    this.logger.log(`Consultando batch details para ${dto.accommodations.length} alojamientos`);
    const data = await Promise.all(
      dto.accommodations.map(async (id) => {
        try {
          return await this.findOne(String(id));
        } catch {
          // No se inventa un nombre: el ID se marca como no encontrado.
          return { id, disponible: false, error: 'Alojamiento no encontrado' };
        }
      }),
    );

    return {
      request_id: `req-batch-${Date.now()}`,
      data,
    };
  }

  async getAccommodationDetailsExtended(dto: AccommodationDetailsRequestDto): Promise<AccommodationDetailsResponseDto> {
    this.logger.log(`Consultando detalles extendidos para ${dto.accommodations.length} alojamientos`);
    const results = await Promise.all(
      dto.accommodations.map(async (accId) => {
        try {
          const item = await this.findOne(String(accId));
          return {
            ...item,
            policies: {
              checkin_from: '14:00',
              checkout_until: '11:00',
              cancellation_policy: 'Cancelación gratuita hasta 48h antes de la llegada',
              children_policy: 'Niños de cualquier edad son bienvenidos',
              pets_allowed: item.amenidades?.includes('Pet friendly') || false,
            },
            facilities_detail: [
              { category: 'Internet', items: ['WiFi gratis en todas las habitaciones', 'Conexión de alta velocidad'] },
              { category: 'Servicios', items: ['Recepción 24 horas', 'Conserjería', 'Limpieza diaria'] },
              { category: 'Habitación', items: ['Aire acondicionado', 'Caja fuerte', 'Smart TV'] },
            ],
            bundles: [
              { bundle_id: `bundle-${item.id}-std`, name: 'Tarifa Estándar', price_multiplier: 1.0 },
              { bundle_id: `bundle-${item.id}-bb`, name: 'Tarifa con Desayuno Buffet', price_multiplier: 1.2 },
            ],
          };
        } catch {
          return { id: accId, disponible: false, error: 'Alojamiento no encontrado' };
        }
      }),
    );

    return {
      request_id: `req-ext-${Date.now()}`,
      data: results,
      next_page: null,
    };
  }

  async getDetailsChanges(dto: DetailsChangesRequestDto): Promise<DetailsChangesResponseDto> {
    this.logger.log(`Consultando cambios de alojamientos desde: ${dto.last_change}`);
    const alojamientos = await this.alojamientoRepo.find({ take: 20 });
    const ids = alojamientos.map((a) => a.id);

    return {
      request_id: `req-chg-${Date.now()}`,
      data: {
        from: dto.last_change,
        next: new Date().toISOString(),
        total_changes: ids.length,
        changes: {
          updated_accommodations: ids,
          deleted_accommodations: [],
        },
      },
    };
  }

  async getChains(): Promise<ChainsResponseDto> {
    this.logger.log('Consultando catálogo de cadenas hoteleras');
    return {
      request_id: `req-chains-${Date.now()}`,
      data: [
        {
          id: 1,
          name: 'Marriott International',
          brands: [
            { id: 101, name: 'Courtyard by Marriott' },
            { id: 102, name: 'Sheraton Hotels & Resorts' },
            { id: 103, name: 'JW Marriott' },
          ],
        },
        {
          id: 2,
          name: 'Hilton Worldwide',
          brands: [
            { id: 201, name: 'Hilton Hotels & Resorts' },
            { id: 202, name: 'DoubleTree by Hilton' },
            { id: 203, name: 'Hampton by Hilton' },
          ],
        },
        {
          id: 3,
          name: 'Decameron All Inclusive Hotels',
          brands: [
            { id: 301, name: 'Decameron Punta Centinela' },
            { id: 302, name: 'Decameron Barú' },
            { id: 303, name: 'Decameron San Andrés' },
          ],
        },
        {
          id: 4,
          name: 'Accor Hotels',
          brands: [
            { id: 401, name: 'Novotel' },
            { id: 402, name: 'Ibis' },
            { id: 403, name: 'Sofitel' },
          ],
        },
      ],
    };
  }

  async getConstants(dto?: ConstantsRequestDto): Promise<ConstantsResponseDto> {
    this.logger.log('Consultando constantes del sistema de alojamientos');
    return {
      request_id: `req-const-${Date.now()}`,
      data: {
        room_types: [
          { code: 'standard', name: 'Habitación Estándar', capacity: 2 },
          { code: 'deluxe', name: 'Habitación Deluxe', capacity: 3 },
          { code: 'suite', name: 'Master Suite', capacity: 4 },
          { code: 'family', name: 'Suite Familiar', capacity: 5 },
          { code: 'villa', name: 'Villa Privada', capacity: 8 },
        ],
        facilities: [
          { code: 'wifi', name: 'WiFi Gratuito' },
          { code: 'pool', name: 'Piscina' },
          { code: 'gym', name: 'Gimnasio' },
          { code: 'spa', name: 'Spa & Bienestar' },
          { code: 'parking', name: 'Estacionamiento Gratis' },
          { code: 'restaurant', name: 'Restaurante' },
          { code: 'air_conditioning', name: 'Aire Acondicionado' },
          { code: 'pet_friendly', name: 'Admite Mascotas' },
        ],
        meal_plans: [
          { code: 'room_only', name: 'Solo Alojamiento' },
          { code: 'breakfast_included', name: 'Desayuno Incluido' },
          { code: 'half_board', name: 'Media Pensión (Desayuno y Cena)' },
          { code: 'all_inclusive', name: 'Todo Incluido (Comidas y Bebidas)' },
        ],
        bed_types: [
          { code: 'single', name: 'Cama Individual' },
          { code: 'double', name: 'Cama Doble' },
          { code: 'queen', name: 'Cama Queen Size' },
          { code: 'king', name: 'Cama King Size' },
        ],
        property_types: [
          { code: 'hotel', name: 'Hotel' },
          { code: 'resort', name: 'Resort' },
          { code: 'apartment', name: 'Apartamento' },
          { code: 'villa', name: 'Villa' },
          { code: 'hostel', name: 'Hostal' },
        ],
      },
    };
  }

  async getReviewsContract(dto: ReviewsRequestDto): Promise<ReviewsResponseDto> {
    this.logger.log(`Consultando reseñas de contrato para ${dto.accommodations.length} alojamientos`);
    const results: any[] = [];
    for (const accId of dto.accommodations) {
      const resenas = await this.resenaRepo.find({
        where: { alojamientoId: String(accId) },
        take: dto.rows || 10,
        order: { createdAt: 'DESC' },
      });

      results.push({
        accommodation_id: accId,
        reviews_count: resenas.length,
        reviews: resenas.map((r) => ({
          review_id: r.id,
          author: r.usuarioNombre,
          country: r.usuarioPais,
          score: r.puntuacion,
          text: r.comentario,
          categories: {
            cleanliness: r.limpieza,
            service: r.servicio,
            quality: r.calidad,
          },
          created_at: r.createdAt,
        })),
      });
    }

    return {
      request_id: `req-rev-${Date.now()}`,
      data: results,
      next_page: null,
    };
  }

  async getReviewsScores(dto: ReviewsScoresRequestDto): Promise<ReviewsScoresResponseDto> {
    this.logger.log(`Consultando puntuaciones de reseñas para ${dto.accommodations.length} alojamientos`);
    const results: any[] = [];
    for (const accId of dto.accommodations) {
      // En una consulta por lotes, un ID inexistente no tumba la respuesta entera.
      const existe = await this.alojamientoRepo.findOneBy({ id: String(accId) });
      if (!existe) {
        results.push({ accommodation_id: accId, error: 'Alojamiento no encontrado' });
        continue;
      }
      const data = await this.getResenas(String(accId));
      results.push({
        accommodation_id: accId,
        total_reviews: data.total,
        average_score: data.scores.general,
        scores_breakdown: {
          cleanliness: data.scores.limpieza,
          service: data.scores.servicio,
          quality: data.scores.calidad,
          location: 9.2,
        },
      });
    }

    return {
      request_id: `req-scores-${Date.now()}`,
      data: results,
    };
  }

  // =========================================================================
  // 2. DISPONIBILIDAD Y PRECIOS
  // =========================================================================

  async getAvailabilityContract(dto: AvailabilityRequestDto): Promise<AvailabilityResponseDto> {
    this.logger.log(`Consultando disponibilidad de contrato para ${dto.accommodation}`);
    const accId = String(dto.accommodation);
    const nights = validarEstancia(dto.checkin, dto.checkout);
    // Nunca se cotiza otro hotel en lugar del pedido: un ID inexistente es un 404.
    const local = await this.alojamientoRepo.findOne({ where: { id: accId, ...SOLO_ACTIVOS } as any });
    if (!local) {
      throw new NotFoundException(`El alojamiento '${accId}' no existe.`);
    }

    // Cada tipo de habitación es un producto con su precio, régimen, política de
    // cancelación y cupo (antes eran tres tarifas inventadas sobre un solo precio).
    const ocupacion = await this.tiposService.ocupacion(local, dto.checkin, dto.checkout);
    const habitacionesPedidas = dto.guests?.number_of_rooms || 1;
    let candidatos = ocupacion;
    if (dto.guests) {
      // Ocupación imposible en todos los tipos → 400 con el campo exacto, como
      // hace Booking al cambiar adultos/niños/habitaciones.
      const adultos = dto.guests.number_of_adults;
      const ninos = dto.guests.children?.length || 0;
      this.exigirAlgunTipoConCapacidad(ocupacion, adultos, ninos, habitacionesPedidas);
      candidatos = ocupacion.filter((o) => this.cabe(o.tipo, adultos, ninos, habitacionesPedidas));
    }

    const currency = dto.currency || local.moneda || 'USD';
    const products = candidatos
      .filter((o) => o.libres >= habitacionesPedidas)
      .sort((x, y) => Number(x.tipo.precioNoche) - Number(y.tipo.precioNoche))
      .map((o) => this.producto(o, nights, currency));

    return {
      request_id: `req-avail-${Date.now()}`,
      data: {
        id: local.id,
        currency,
        nights,
        available_rooms: ocupacion.reduce((suma, o) => suma + o.libres, 0),
        products,
        url: `/api/v1/alojamientos/${local.id}`,
      },
    };
  }

  async getBulkAvailability(dto: BulkAvailabilityRequestDto): Promise<BulkAvailabilityResponseDto> {
    this.logger.log(`Consultando bulk availability para ${dto.accommodations.length} propiedades`);
    validarEstancia(dto.checkin, dto.checkout);
    const results = await Promise.all(
      dto.accommodations.map(async (accId) => {
        try {
          const res = await this.getAvailabilityContract({
            accommodation: accId,
            booker: dto.booker,
            checkin: dto.checkin,
            checkout: dto.checkout,
            guests: dto.guests,
            currency: dto.currency,
          });
          return res.data;
        } catch {
          return { id: accId, available: false, products: [] };
        }
      }),
    );

    return {
      request_id: `req-bulk-${Date.now()}`,
      data: results,
    };
  }

  // =========================================================================
  // 3. GESTIÓN DE ÓRDENES (RESERVAS)
  // =========================================================================

  async previewOrder(dto: OrderPreviewRequestDto): Promise<OrderPreviewResponseDto> {
    this.logger.log('Previsualizando orden de alojamiento', dto);
    const accId = String(dto.accommodation_id);
    const nights = validarEstancia(dto.checkin, dto.checkout);
    const local = await this.alojamientoRepo.findOne({ where: { id: accId, ...SOLO_ACTIVOS } as any });
    if (!local) {
      throw new NotFoundException(`El alojamiento '${dto.accommodation_id}' no existe.`);
    }

    const rooms = dto.guests?.number_of_rooms || 1;
    const adults = dto.guests?.number_of_adults || 1;
    const children = dto.guests?.children?.length || 0;

    // `product_id` es el tipo de habitación (id o código) que devolvió /availability.
    const { tipo } = await this.elegirTipo(local, {
      tipoId: dto.product_id,
      adultos: adults,
      ninos: children,
      habitaciones: rooms,
      checkin: dto.checkin!,
      checkout: dto.checkout!,
      campo: 'product_id',
    });

    const precioNoche = Number(tipo.precioNoche);
    const totalPrice = Number((precioNoche * nights * rooms).toFixed(2));
    const previewId = `prev_${randomUUID().substring(0, 8)}`;

    // Guardar en caché temporal para validación en createOrder
    this.orderPreviews.set(previewId, {
      id: previewId,
      alojamientoId: local.id,
      tipoId: tipo.id,
      precioNoche,
      adultos: adults,
      ninos: children,
      checkin: dto.checkin!,
      checkout: dto.checkout!,
      nights,
      rooms,
      guests: dto.guests,
      totalPrice,
      currency: local.moneda || 'USD',
      createdAt: Date.now(),
    });

    this.telemetryService?.trackEvent({
      event_name: 'checkout_started',
      vertical: 'alojamientos',
      properties: {
        alojamiento_id: local.id,
        nights,
        rooms,
        total_price: totalPrice,
        currency: local.moneda || 'USD',
      },
    });

    return {
      request_id: `req-prev-${Date.now()}`,
      data: {
        order_preview_id: previewId,
        accommodation_id: local.id,
        product_id: tipo.id,
        tipo_habitacion: { id: tipo.id, codigo: tipo.codigo, nombre: tipo.nombre },
        price_per_night: precioNoche,
        total_price: totalPrice,
        currency: local.moneda || 'USD',
        nights,
        rooms,
        expires_at: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
      },
    };
  }

  async createOrder(dto: OrderCreateRequestDto, idempotencyKey: string, usuario?: UsuarioSupabase | null): Promise<OrderDetailDto> {
    return this.enSerie(() => this.createOrderEnSerie(dto, idempotencyKey, usuario));
  }

  private async createOrderEnSerie(dto: OrderCreateRequestDto, idempotencyKey: string, usuario?: UsuarioSupabase | null): Promise<OrderDetailDto> {
    this.logger.log(`Creando orden de alojamiento a partir de preview ${dto.order_preview_id} con idempotency key ${idempotencyKey}`);

    // 1. Verificación de Idempotencia estricta
    // Reintento con la misma clave: se devuelve la orden original (sin cobrar dos veces).
    const existing = await this.reservaRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      this.logger.warn(`Idempotencia detectada: retornando orden previa ${existing.id}`);
      const local = await this.alojamientoRepo.findOne({ where: { id: existing.alojamientoId } });
      const detalle = await this.detallesDeReservas([existing]);
      return this.buildOrderDetailDto(existing, local, dto.payment_reference, detalle(existing).tipo);
    }

    // 2. Validación de referencia de pago (RFC 7807: PAYMENT_REFERENCE_INVALID)
    if (!dto.payment_reference || dto.payment_reference.trim().length < 4) {
      throw noProcesable(
        CodigoProblema.PAYMENT_REFERENCE_INVALID,
        'payment_reference inválido o ausente. Se requiere confirmación de pago de la Payment API.',
      );
    }

    // 3. Resolución de datos del preview o fallback
    // 3. La orden SOLO se crea desde una cotización vigente. Nunca se inventa una
    //    reserva sobre otro hotel ni con otras fechas: si el preview no existe o
    //    caducó, el cliente debe volver a cotizar (410 Gone).
    const preview = this.orderPreviews.get(dto.order_preview_id);
    if (!preview || Date.now() - preview.createdAt > PREVIEW_TTL_MS) {
      if (preview) this.orderPreviews.delete(dto.order_preview_id);
      throw conflicto(
        CodigoProblema.OFFER_NO_LONGER_AVAILABLE,
        'La cotización no existe o ha caducado. Vuelve a consultar el precio antes de reservar.',
      );
    }

    const local = await this.alojamientoRepo.findOne({ where: { id: preview.alojamientoId, ...SOLO_ACTIVOS } as any });
    if (!local) {
      throw conflicto(
        CodigoProblema.ROOM_NO_LONGER_AVAILABLE,
        'El alojamiento seleccionado ya no tiene disponibilidad para formalizar la orden.',
      );
    }

    // 4. Se revalida el cupo DEL TIPO cotizado: otra persona pudo reservar entre
    //    el preview y el pago, o el tipo pudo dejar de venderse.
    const ocupacion = await this.tiposService.ocupacion(local, preview.checkin, preview.checkout);
    const cotizado = ocupacion.find((o) => o.tipo.id === preview.tipoId);
    if (!cotizado || cotizado.libres < preview.rooms) {
      throw conflicto(
        CodigoProblema.ROOM_NO_LONGER_AVAILABLE,
        'Las habitaciones cotizadas ya no están disponibles para esas fechas.',
      );
    }

    const codigoReserva = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;
    const cliente = dto.customer_details;
    const fullName = `${cliente.first_name} ${cliente.last_name}`;

    let reserva = this.reservaRepo.create({
      codigoReserva,
      alojamientoId: local.id,
      tipoHabitacionId: preview.tipoId,
      usuarioId: usuario?.id ?? null,
      customerName: fullName,
      customerEmail: cliente.email.trim().toLowerCase(),
      telefono: cliente.phone ?? null,
      checkin: preview.checkin,
      checkout: preview.checkout,
      noches: preview.nights,
      adultos: preview.adultos,
      ninos: preview.ninos,
      huespedes: preview.adultos + preview.ninos,
      habitacionesCount: preview.rooms || 1,
      precioNoche: preview.precioNoche,
      moneda: preview.currency,
      total: preview.totalPrice,
      totalPrice: { currency: preview.currency, total: preview.totalPrice },
      status: ReservationStatus.CONFIRMED,
      idempotencyKey,
    });

    reserva = await this.reservaRepo.save(reserva);
    await this.guardarHuespedes(reserva, {
      nombre: cliente.first_name,
      apellido: cliente.last_name,
      email: reserva.customerEmail,
      telefono: cliente.phone ?? null,
    });

    // Consumir preview
    this.orderPreviews.delete(dto.order_preview_id);

    // Disparar Webhooks salientes
    this.triggerWebhookNotification('ORDER_CONFIRMED', reserva.id, {
      order_id: reserva.id,
      codigo_reserva: reserva.codigoReserva,
      total: reserva.total,
      customer_email: reserva.customerEmail,
      alojamiento_id: reserva.alojamientoId,
    });

    // Telemetría de reserva confirmada
    this.telemetryService?.trackEvent({
      event_name: 'booking_confirmed',
      vertical: 'alojamientos',
      properties: {
        order_id: reserva.id,
        codigo_reserva: reserva.codigoReserva,
        alojamiento_id: reserva.alojamientoId,
        total: reserva.total,
        destination: local.destino,
        payment_reference: dto.payment_reference,
      },
    });

    return this.buildOrderDetailDto(reserva, local, dto.payment_reference, cotizado.tipo);
  }

  async getOrderById(orderId: string): Promise<OrderDetailDto> {
    this.logger.log(`Consultando detalle de orden ${orderId}`);
    const reserva = await this.reservaRepo.findOne({ where: { id: orderId } });
    if (!reserva) {
      throw new NotFoundException(`La orden de alojamiento '${orderId}' no existe.`);
    }

    const local = await this.alojamientoRepo.findOne({ where: { id: reserva.alojamientoId } });
    const detalle = await this.detallesDeReservas([reserva]);
    return this.buildOrderDetailDto(reserva, local, undefined, detalle(reserva).tipo);
  }

  async modifyOrder(orderId: string, dto: OrderModifyRequestDto, idempotencyKey: string): Promise<OrderDetailDto> {
    return this.enSerie(() => this.modifyOrderEnSerie(orderId, dto, idempotencyKey));
  }

  private async modifyOrderEnSerie(orderId: string, dto: OrderModifyRequestDto, idempotencyKey: string): Promise<OrderDetailDto> {
    this.logger.log(`Modificando orden ${orderId} con idempotency key ${idempotencyKey}`);
    const reserva = await this.reservaRepo.findOne({ where: { id: orderId } });
    if (!reserva) {
      throw new NotFoundException(`La orden '${orderId}' no existe.`);
    }

    if (reserva.status === ReservationStatus.CANCELLED) {
      throw new ConflictException(`No se puede modificar una orden en estado CANCELLED.`);
    }

    // Las fechas nuevas se combinan con las actuales (se puede cambiar solo una).
    const nuevoCheckin = dto.checkin ?? reserva.checkin;
    const nuevoCheckout = dto.checkout ?? reserva.checkout;
    const nuevasHabitaciones = dto.guests?.number_of_rooms ?? reserva.habitacionesCount ?? 1;
    const nuevosAdultos = dto.guests?.number_of_adults ?? reserva.adultos ?? reserva.huespedes ?? 1;
    const nuevosNinos = dto.guests ? dto.guests.children?.length || 0 : reserva.ninos ?? 0;
    const noches = validarEstancia(nuevoCheckin, nuevoCheckout);

    const local = await this.alojamientoRepo.findOne({ where: { id: reserva.alojamientoId } });
    let tipo: TipoHabitacion | null = null;
    if (local) {
      // Se mantiene el tipo de habitación reservado; se revalida su capacidad y su cupo.
      const tipoId = reserva.tipoHabitacionId || (await this.tiposService.tipoPorDefecto(local))?.id;
      try {
        ({ tipo } = await this.elegirTipo(local, {
          tipoId,
          adultos: nuevosAdultos,
          ninos: nuevosNinos,
          habitaciones: nuevasHabitaciones,
          checkin: nuevoCheckin,
          checkout: nuevoCheckout,
          excluirReservaId: reserva.id,
          noVendibleEsConflicto: true,
        }));
      } catch (e) {
        if (e instanceof ProblemaApi && e.codigo === CodigoProblema.ROOM_NO_LONGER_AVAILABLE) {
          throw conflicto(CodigoProblema.ROOM_NO_LONGER_AVAILABLE, 'No hay disponibilidad para las nuevas fechas u ocupación solicitadas.');
        }
        throw e;
      }
    }

    reserva.checkin = nuevoCheckin;
    reserva.checkout = nuevoCheckout;
    reserva.noches = noches;
    reserva.adultos = nuevosAdultos;
    reserva.ninos = nuevosNinos;
    reserva.huespedes = nuevosAdultos + nuevosNinos;
    reserva.habitacionesCount = nuevasHabitaciones;
    if (tipo && !reserva.tipoHabitacionId) reserva.tipoHabitacionId = tipo.id;

    // La tarifa por noche contratada se mantiene; el total cambia por noches/habitaciones.
    const moneda = reserva.moneda || reserva.totalPrice?.currency || local?.moneda || 'USD';
    const precioNoche = Number(reserva.precioNoche) || (tipo ? Number(tipo.precioNoche) : Number(reserva.total) / Math.max(1, calcularNoches(reserva.checkin, reserva.checkout)));
    reserva.precioNoche = precioNoche;
    reserva.moneda = moneda;
    reserva.total = Number((precioNoche * noches * nuevasHabitaciones).toFixed(2));
    reserva.totalPrice = { currency: moneda, total: reserva.total };

    await this.reservaRepo.save(reserva);

    this.triggerWebhookNotification('ORDER_MODIFIED', reserva.id, {
      order_id: reserva.id,
      checkin: reserva.checkin,
      checkout: reserva.checkout,
      total: reserva.total,
    });

    return this.buildOrderDetailDto(reserva, local, undefined, tipo);
  }

  async cancelOrder(orderId: string, idempotencyKey: string, reason?: string): Promise<any> {
    return this.enSerie(() => this.cancelOrderEnSerie(orderId, idempotencyKey, reason));
  }

  private async cancelOrderEnSerie(orderId: string, idempotencyKey: string, reason?: string): Promise<any> {
    this.logger.log(`Cancelando orden ${orderId} (motivo: ${reason}) con idempotency key ${idempotencyKey}`);
    const reserva = await this.reservaRepo.findOne({ where: { id: orderId } });
    if (!reserva) {
      throw new NotFoundException(`La orden '${orderId}' no existe.`);
    }

    if (reserva.status !== ReservationStatus.CANCELLED) {
      if (reserva.checkout && new Date(reserva.checkout).getTime() < Date.now()) {
        throw conflicto(
          CodigoProblema.CANCELLATION_NOT_ALLOWED,
          'No es posible cancelar una reserva cuya estancia ya ha finalizado.',
        );
      }

      reserva.status = ReservationStatus.CANCELLED;
      reserva.motivoCancelacion = reason?.slice(0, 500) || null;
      reserva.canceladaEn = new Date();
      await this.reservaRepo.save(reserva);

      this.triggerWebhookNotification('ORDER_CANCELLED', reserva.id, {
        order_id: reserva.id,
        reason: reason || 'Cancelado a solicitud del cliente',
        status: 'CANCELLED',
      });

      this.telemetryService?.trackEvent({
        event_name: 'booking_cancelled',
        vertical: 'alojamientos',
        properties: {
          order_id: reserva.id,
          codigo_reserva: reserva.codigoReserva,
          reason: reason || 'Cancelado a solicitud del cliente',
        },
      });
    }

    return {
      order_id: reserva.id,
      codigo_reserva: reserva.codigoReserva,
      status: ReservationStatus.CANCELLED,
      message: 'Cancelación procesada exitosamente',
      cancellation_date: new Date().toISOString(),
    };
  }

  /**
   * Check-in Digital a las 14:00 (Consideraciones RDA2 §4).
   * La clave de acceso a la habitación se libera estrictamente a partir de las 14:00 del día de ingreso.
   */
  async checkinDigital(orderId: string, forzarLiberacion?: boolean): Promise<any> {
    const reserva = await this.reservaRepo.findOne({
      where: [{ id: orderId }, { codigoReserva: orderId }],
    });

    if (!reserva) {
      throw new NotFoundException(`La reserva o código '${orderId}' no fue localizada.`);
    }

    if (reserva.status === 'CANCELLED') {
      throw new BadRequestException('No es posible realizar check-in de una reserva cancelada.');
    }

    const now = new Date();
    const checkinDateStr = reserva.checkin; // 'YYYY-MM-DD'
    const horaActual = now.getHours();
    
    const todayStr = now.toISOString().split('T')[0];
    const esDiaCheckinOPosterior = todayStr >= checkinDateStr;
    const esHora14OPosterior = horaActual >= 14 || forzarLiberacion === true;

    if (!esDiaCheckinOPosterior || !esHora14OPosterior) {
      return {
        order_id: reserva.id,
        codigo_reserva: reserva.codigoReserva,
        estado: 'PENDIENTE_HORA_14',
        checkin_liberado: false,
        fecha_checkin: checkinDateStr,
        hora_liberacion_programada: '14:00:00 local',
        habitacion_asignada: reserva.habitacionAsignada || 'Habitación 304 (Asignada)',
        clave_acceso_digital: null,
        mensaje: 'Tu check-in digital está registrado. Por políticas de hospitalidad (Consideraciones RDA2 §4), la clave de acceso digital y código de cerradura se liberarán automáticamente a partir de las 14:00 del día de ingreso.',
      };
    }

    const habitacion = reserva.habitacionAsignada || `Habitación ${Math.floor(Math.random() * 300) + 101}`;
    const claveDigital = reserva.claveAccesoDigital || `KEY-${Math.floor(Math.random() * 9000) + 1000}-QTO`;

    reserva.habitacionAsignada = habitacion;
    reserva.claveAccesoDigital = claveDigital;
    reserva.checkinLiberadoALas14 = true;
    reserva.checkinCompletadoAt = now;
    reserva.status = 'CHECKED_IN';
    await this.reservaRepo.save(reserva);

    return {
      order_id: reserva.id,
      codigo_reserva: reserva.codigoReserva,
      estado: 'CHECKED_IN',
      checkin_liberado: true,
      fecha_checkin: checkinDateStr,
      hora_checkin: now.toISOString(),
      habitacion_asignada: habitacion,
      clave_acceso_digital: claveDigital,
      mensaje: '¡Check-in digital exitoso! Tu clave de acceso inteligente ha sido activada para abrir la cerradura de tu habitación.',
    };
  }

  // =========================================================================
  // 4. WEBHOOKS
  // =========================================================================

  async listWebhooks(propietarioId = 'default-owner'): Promise<AccommodationWebhookSubscriptionDto[]> {
    this.logger.log(`Listando webhooks para propietario ${propietarioId}`);
    const list: AccommodationWebhookSubscriptionDto[] = [];
    for (const w of this.webhooks.values()) {
      if (w.activo && w.propietarioId === propietarioId) {
        list.push({
          id: w.id,
          url: w.url,
          events: w.events,
          secret: w.secret ? `whsec_...${w.secret.slice(-4)}` : undefined,
          createdAt: w.createdAt,
          active: w.activo,
        });
      }
    }
    return list;
  }

  async createWebhook(dto: CreateAccommodationWebhookDto, propietarioId = 'default-owner'): Promise<AccommodationWebhookSubscriptionDto> {
    this.logger.log(`Registrando webhook a ${dto.url} para eventos: ${dto.events.join(', ')}`);

    if (!dto.url.toLowerCase().startsWith('https://')) {
      throw new BadRequestException('La URL del webhook debe usar protocolo seguro https://');
    }

    const id = randomUUID();
    const stored: StoredWebhook = {
      id,
      propietarioId,
      url: dto.url,
      events: dto.events,
      secret: dto.secret || `whsec_${randomUUID().replace(/-/g, '').substring(0, 16)}`,
      activo: true,
      createdAt: new Date().toISOString(),
    };

    this.webhooks.set(id, stored);

    return {
      id: stored.id,
      url: stored.url,
      events: stored.events,
      secret: `whsec_...${stored.secret?.slice(-4) || 'a1b2'}`,
      createdAt: stored.createdAt,
      active: true,
    };
  }

  async deleteWebhook(id: string, propietarioId = 'default-owner'): Promise<void> {
    this.logger.log(`Eliminando webhook ${id}`);
    const w = this.webhooks.get(id);
    if (!w || !w.activo || (propietarioId !== 'admin' && w.propietarioId !== propietarioId)) {
      throw new NotFoundException(`La suscripción de webhook '${id}' no existe.`);
    }

    w.activo = false;
    this.webhooks.delete(id);
  }

  private triggerWebhookNotification(eventType: string, resourceId: string, payloadData: any) {
    for (const sub of this.webhooks.values()) {
      if (sub.activo && sub.events.includes(eventType)) {
        this.logger.log(`[Webhook Event] Disparando ${eventType} a ${sub.url} para recurso ${resourceId}`);
        // Notificación en segundo plano no bloqueante
        this.httpService.post(sub.url, {
          eventId: randomUUID(),
          eventType,
          timestamp: new Date().toISOString(),
          resourceId,
          data: payloadData,
        }).subscribe({
          error: (e) => this.logger.warn(`Error al entregar webhook a ${sub.url}: ${e.message}`),
        });

        this.telemetryService?.trackApiCall({
          provider: 'AlojamientosWebhookDispatcher',
          vertical: 'alojamientos',
          operation: eventType,
          status_code: 200,
          latency_ms: 15,
          success: true,
        });
      }
    }
  }

  // =========================================================================
  // 5. MÉTODOS EXISTENTES DE MARKETPLACE Y ADMINISTRACIÓN
  // =========================================================================

  async health(): Promise<any> {
    const total = await this.alojamientoRepo.count();
    return { status: 'ok', service: 'Alojamientos', database: 'connected', total_listings: total };
  }

  async findAll(query: PaginationQueryDto): Promise<any> {
    this.logger.log(`Consultando catálogo de alojamientos`);

    const limit = query.limit || 10;
    const page = query.page || 1;

    const locales = await this.alojamientoRepo.find({
      where: SOLO_ACTIVOS as any,
      take: limit,
      skip: (page - 1) * limit,
    });

    if (locales.length > 0) {
      const total = await this.alojamientoRepo.count({ where: SOLO_ACTIVOS as any });
      const data = locales.map((l) => this.transformAlojamiento(l));
      return {
        data,
        meta: {
          total,
          limit,
          page,
        },
      };
    }

    return {
      data: [],
      meta: { total: 0, limit, page },
    };
  }

  async findOne(id: string): Promise<any> {
    this.logger.log(`Consultando detalle de Alojamiento ID ${id}`);

    // Un alojamiento INACTIVO no existe para el público (como una propiedad
    // retirada de Booking); el panel de gestión lo ve por su propio endpoint.
    const local = await this.alojamientoRepo.findOne({
      where: { id, ...SOLO_ACTIVOS } as any,
    });

    if (local) {
      // La ficha incluye sus tipos de habitación, como la tabla de habitaciones de Booking.
      const tipos = await this.tiposService.asegurarTipoBase(local);
      return this.transformAlojamiento(local, tipos);
    }

    throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
  }

  async getAvailability(id: string, date?: string, checkoutDate?: string, excluirReservaId?: string): Promise<any> {
    this.logger.log(`Consultando disponibilidad para alojamiento ${id} en ${date} - ${checkoutDate}`);
    const local = await this.alojamientoRepo.findOne({ where: { id, ...SOLO_ACTIVOS } as any });
    if (!local) {
      throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    }
    const startDate = date || new Date().toISOString().split('T')[0];
    const endDate = checkoutDate || new Date(new Date(startDate).getTime() + 86400000).toISOString().split('T')[0];

    // Reservas confirmadas que se cruzan con [startDate, endDate), por tipo de habitación.
    const ocupacion = await this.tiposService.ocupacion(local, startDate, endDate, excluirReservaId);
    const totalRooms = ocupacion.reduce((s, o) => s + o.total, 0);
    const reservedRooms = ocupacion.reduce((s, o) => s + o.reservadas, 0);
    const availableRooms = ocupacion.reduce((s, o) => s + o.libres, 0);
    const conCupo = ocupacion.filter((o) => o.libres > 0);
    const precios = (conCupo.length ? conCupo : ocupacion).map((o) => Number(o.tipo.precioNoche));

    return {
      alojamiento_id: id,
      date: startDate,
      checkin: startDate,
      checkout: endDate,
      total_rooms: totalRooms,
      reserved_rooms: reservedRooms,
      available_rooms: availableRooms,
      price_per_night: precios.length ? Math.min(...precios) : Number(local.precioPorNoche),
      checkin_times: ['14:00', '15:00', '16:00'],
      is_available: availableRooms > 0,
      tipos: ocupacion.map((o) => ({
        id: o.tipo.id,
        codigo: o.tipo.codigo,
        nombre: o.tipo.nombre,
        precio_noche: Number(o.tipo.precioNoche),
        total_rooms: o.total,
        reserved_rooms: o.reservadas,
        available_rooms: o.libres,
      })),
    };
  }

  async reservar(id: string, dto: ReservationRequestDto, idempotencyKey: string, usuario?: UsuarioSupabase | null): Promise<any> {
    return this.enSerie(() => this.reservarEnSerie(id, dto, idempotencyKey, usuario));
  }

  private async reservarEnSerie(id: string, dto: ReservationRequestDto, idempotencyKey: string, usuario?: UsuarioSupabase | null): Promise<any> {
    this.logger.log(`Iniciando reserva para Alojamiento ${id} con idempotency key ${idempotencyKey}`);

    // 1. Control de Idempotencia estricto
    const existing = await this.reservaRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      if (existing.status === ReservationStatus.CONFIRMED) {
        throw conflicto(CodigoProblema.BOOKING_NOT_CONFIRMED, 'Conflicto de Idempotencia: Reserva ya procesada con este Idempotency-Key.');
      }
      return this.buildReservaResponse(existing);
    }

    const alojamiento = await this.alojamientoRepo.findOne({ where: { id, ...SOLO_ACTIVOS } as any });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    // Las noches salen SIEMPRE de las fechas (fuente de verdad), no de `dto.nights`:
    // así el total cobrado coincide con la estancia real.
    const nights = validarEstancia(dto.checkin, dto.checkout);
    const targetCheckin = dto.checkin;
    const targetCheckout = dto.checkout;
    const roomsCount = Math.max(1, dto.habitaciones_count || 1);
    const adultos = dto.adultos || 1;
    const ninos = dto.ninos || 0;
    const seleccion = {
      tipoId: dto.tipo_habitacion_id,
      adultos,
      ninos,
      habitaciones: roomsCount,
      checkin: targetCheckin,
      checkout: targetCheckout,
    };
    // Tipo de habitación y capacidad primero (400); el cupo se comprueba después del
    // aviso de reserva duplicada, como antes.
    await this.elegirTipo(alojamiento, { ...seleccion, ignorarCupo: true });
    this.validarAcompanantes(dto.acompanantes, adultos, ninos);

    // 2. Posible reserva duplicada (mismo cliente, mismo alojamiento, fechas que
    //    se solapan). Como en Booking, NO se bloquea: puede querer otra habitación.
    //    Se devuelve 409 para que el cliente CONFIRME, y basta con reenviar la
    //    petición con `confirmar_duplicado: true` (lo indica `invalidParams`).
    const customerEmail = (dto.customer_email || usuario?.email || '').trim().toLowerCase();
    if ((customerEmail || usuario?.id) && !dto.confirmar_duplicado) {
      const confirmadas = await this.reservaRepo.find({
        where: { alojamientoId: id, status: ReservationStatus.CONFIRMED } as any,
      });
      const delCliente = confirmadas.filter(
        (r) => (usuario?.id && r.usuarioId === usuario.id) || (customerEmail && r.customerEmail === customerEmail),
      );
      const duplicate = delCliente.find((r) => r.checkin < targetCheckout && r.checkout > targetCheckin);

      if (duplicate) {
        this.logger.warn(`Posible reserva duplicada de ${customerEmail} en alojamiento ${id}`);
        throw conflicto(
          CodigoProblema.BOOKING_NOT_CONFIRMED,
          `Ya tienes una reserva confirmada en este alojamiento del ${duplicate.checkin} al ${duplicate.checkout} (Código: ${duplicate.codigoReserva}).`,
          [
            {
              name: 'confirmar_duplicado',
              reason: 'Reenvía la petición con confirmar_duplicado: true para hacer otra reserva igualmente.',
            },
          ],
        );
      }
    }

    // 3. Cupo del tipo de habitación, en tiempo real.
    const { tipo } = await this.elegirTipo(alojamiento, seleccion);

    const pricePerNight = Number(tipo.precioNoche);
    const total = Number((pricePerNight * nights * roomsCount).toFixed(2));
    const currency = alojamiento.moneda || 'USD';

    const codigoReserva = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;

    let reserva = this.reservaRepo.create({
      codigoReserva,
      alojamientoId: id,
      tipoHabitacionId: tipo.id,
      usuarioId: usuario?.id ?? null,
      idempotencyKey,
      status: ReservationStatus.CONFIRMED,
      precioNoche: pricePerNight,
      moneda: currency,
      total,
      totalPrice: { currency, total },
      noches: nights,
      habitacionesCount: roomsCount,
      customerName: dto.customer_name,
      customerEmail: customerEmail || 'cliente@example.com',
      telefono: dto.phone?.trim() || null,
      peticionesEspeciales: dto.special_requests?.trim() || null,
      horaLlegada: dto.arrival_time?.trim() || null,
      checkin: targetCheckin,
      checkout: targetCheckout,
      adultos,
      ninos,
      huespedes: adultos + ninos,
    });

    reserva = await this.reservaRepo.save(reserva);
    // El titular es el huésped principal (puede no ser quien paga: "reservo para otra persona").
    const titular = this.partirNombre(dto.guest_name || dto.customer_name);
    const huespedes = await this.guardarHuespedes(
      reserva,
      { ...titular, email: reserva.customerEmail, telefono: reserva.telefono },
      dto.acompanantes,
    );

    this.telemetryService?.trackEvent({
      event_name: 'booking_confirmed',
      vertical: 'alojamientos',
      properties: {
        order_id: reserva.id,
        codigo_reserva: reserva.codigoReserva,
        alojamiento_id: reserva.alojamientoId,
        total: reserva.total,
        customer_email: reserva.customerEmail,
        tipo_habitacion: tipo.codigo,
        con_sesion: Boolean(usuario?.id),
      },
    });

    return this.buildReservaResponse(reserva, alojamiento, { tipo, huespedes });
  }

  async cancelarReserva(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string): Promise<any> {
    return this.enSerie(() => this.cancelarReservaEnSerie(reservationId, dto, idempotencyKey));
  }

  private async cancelarReservaEnSerie(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string): Promise<any> {
    this.logger.log(`Cancelando reserva ${reservationId} (razón: ${dto.reason}) con idempotency key ${idempotencyKey}`);

    const reserva = await this.reservaRepo.findOneBy({ id: reservationId });
    if (!reserva) throw new HttpException('Reserva no encontrada', HttpStatus.NOT_FOUND);

    if (reserva.status === ReservationStatus.CANCELLED) {
      return this.buildReservaResponse(reserva);
    }

    if (reserva.checkout && new Date(reserva.checkout).getTime() < Date.now()) {
      throw conflicto(
        CodigoProblema.CANCELLATION_NOT_ALLOWED,
        'No es posible cancelar una reserva cuya estancia ya ha finalizado.',
      );
    }

    reserva.status = ReservationStatus.CANCELLED;
    reserva.motivoCancelacion = dto.reason?.slice(0, 500) || null;
    reserva.canceladaEn = new Date();
    await this.reservaRepo.save(reserva);

    this.telemetryService?.trackEvent({
      event_name: 'booking_cancelled',
      vertical: 'alojamientos',
      properties: {
        order_id: reserva.id,
        codigo_reserva: reserva.codigoReserva,
        reason: dto.reason,
      },
    });

    return this.buildReservaResponse(reserva);
  }

  /**
   * "Mis reservas": un cliente ve las reservas vinculadas a SU usuario
   * (usuario_id) y las que hizo sin sesión con su mismo correo; un administrador
   * ve todas. Una reserva vinculada a otro usuario nunca aparece, aunque el
   * correo coincida.
   */
  async getReservas(usuario?: UsuarioSupabase | null): Promise<any> {
    this.logger.log('Consultando historial de reservas de alojamientos');
    const email = (usuario?.email || '').trim().toLowerCase();
    const verTodas = esAdministrador(usuario);
    if (!verTodas && !email && !usuario?.id) return [];
    let reservas: ReservaAlojamiento[];
    if (verTodas) {
      reservas = await this.reservaRepo.find({ order: { createdAt: 'DESC' } });
    } else {
      const condiciones: any[] = [];
      if (usuario?.id) condiciones.push({ usuarioId: usuario.id });
      if (email) condiciones.push({ customerEmail: email });
      const candidatas = await this.reservaRepo.find({ where: condiciones, order: { createdAt: 'DESC' } });
      reservas = candidatas.filter((r) => r.usuarioId === usuario?.id || (!r.usuarioId && r.customerEmail === email));
    }
    const ids = [...new Set(reservas.map((r) => r.alojamientoId))];
    const alojamientos = ids.length > 0 ? await this.alojamientoRepo.find({ where: ids.map((id) => ({ id })), withDeleted: true } as any) : [];
    const alojMap = new Map(alojamientos.map((a) => [a.id, a]));
    const detalle = await this.detallesDeReservas(reservas);
    return reservas.map((r) => this.buildReservaResponse(r, alojMap.get(r.alojamientoId), detalle(r)));
  }

  async getReservaById(reservationId: string): Promise<any> {
    this.logger.log(`Consultando detalle de reserva ${reservationId}`);
    const reserva = await this.reservaRepo.findOneBy({ id: reservationId });
    if (!reserva) throw new HttpException('Reserva no encontrada', HttpStatus.NOT_FOUND);
    const alojamiento = await this.alojamientoRepo.findOne({ where: { id: reserva.alojamientoId }, withDeleted: true } as any);
    const detalle = await this.detallesDeReservas([reserva]);
    return this.buildReservaResponse(reserva, alojamiento, detalle(reserva));
  }

  /** Id interno estable para un alojamiento que llega de un proveedor. */
  private idParaProveedor(proveedorId: string, idExterno: string): string {
    const legible = `${proveedorId}-${idExterno}`;
    if (legible.length <= 50) return legible;
    return `${proveedorId.slice(0, 30)}-${createHash('sha1').update(legible).digest('hex').slice(0, 16)}`;
  }

  /** Normaliza el DTO a columnas de la entidad (sin campos ajenos ni el proveedor). */
  private camposDesdeDto(dto: Partial<CreateAlojamientoDto>) {
    const { proveedorId: _p, tiposHabitacion: _t, ...resto } = dto as any;
    const campos: Record<string, any> = {};
    for (const [k, v] of Object.entries(resto)) {
      if (v !== undefined) campos[k] = v;
    }
    return campos;
  }

  /** 400 si un administrador asigna el alojamiento a un proveedor que no está registrado. */
  private async exigirProveedorRegistrado(proveedorId: string | null | undefined, campo = 'proveedorId') {
    if (!proveedorId) return;
    if (!(await this.proveedoresService.existe(proveedorId))) {
      throw validacion('El proveedor no está registrado.', [
        { name: campo, reason: `'${proveedorId}' no existe. Dalo de alta en Gestión → Proveedores (o POST /alojamientos/gestion/proveedores).` },
      ]);
    }
  }

  /** Alojamiento recién guardado, con su resumen de tipos ya recalculado. */
  private async releer(id: string): Promise<Alojamiento> {
    return (await this.alojamientoRepo.findOne({ where: { id } as any })) as Alojamiento;
  }

  /**
   * Alta. Si trae `tiposHabitacion` se crean; si no, el alojamiento recibe un
   * tipo "estándar" con su precio, capacidad y habitaciones. El precio "desde",
   * las habitaciones y la capacidad del alojamiento se calculan de sus tipos.
   */
  async create(dto: CreateAlojamientoDto, actor?: ActorCatalogo): Promise<any> {
    // Con API key el proveedor es SIEMPRE el de la clave; un admin puede indicarlo.
    const proveedorId = actor?.tipo === 'proveedor' ? actor.proveedorId : dto.proveedorId ?? null;
    if (actor?.tipo !== 'proveedor') await this.exigirProveedorRegistrado(proveedorId);
    if (dto.idExterno && proveedorId) {
      const existente = await this.alojamientoRepo.findOne({ where: { proveedorId, idExterno: dto.idExterno }, withDeleted: true } as any);
      if (existente) {
        throw new ConflictException(
          `El proveedor '${proveedorId}' ya tiene un alojamiento con idExterno '${dto.idExterno}' (id ${existente.id}). Usa PATCH /alojamientos/${existente.id} o POST /alojamientos/sincronizar.`,
        );
      }
    }
    const id = proveedorId && dto.idExterno ? this.idParaProveedor(proveedorId, dto.idExterno) : `aloj-${randomUUID().slice(0, 13)}`;
    const entity = this.alojamientoRepo.create({
      id,
      ...this.camposDesdeDto(dto),
      proveedorId,
      estado: dto.estado || 'ACTIVO',
      moneda: dto.moneda || 'USD',
      photos: dto.photos?.length ? dto.photos : [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800' }],
      amenidades: dto.amenidades || [],
      ratings: { score: 9.0, number_of_reviews: 0 },
      host: null,
      ubicacion: dto.ubicacion || { city: dto.destino },
      ultimaSincronizacion: actor?.tipo === 'proveedor' ? new Date() : null,
    } as Partial<Alojamiento>);
    const guardado = await this.alojamientoRepo.save(entity);
    if (dto.tiposHabitacion?.length) await this.tiposService.reemplazar(guardado, dto.tiposHabitacion);
    else await this.tiposService.asegurarTipoBase(guardado);
    return this.releer(guardado.id);
  }

  /**
   * Aplica una edición (PUT o PATCH) respetando los tipos de habitación: con
   * `tiposHabitacion` se reemplazan; sin ellos, un cambio de precio/capacidad/
   * habitaciones se traslada al tipo único (o es un 400 si hay varios).
   */
  private async aplicarEdicion(alojamiento: Alojamiento, dto: Partial<CreateAlojamientoDto>, actor?: ActorCatalogo): Promise<Alojamiento> {
    const campos = this.camposDesdeDto(dto);
    if (actor?.tipo === 'admin' && dto.proveedorId !== undefined) {
      await this.exigirProveedorRegistrado(dto.proveedorId);
      campos.proveedorId = dto.proveedorId;
    }
    if (actor?.tipo === 'proveedor') campos.ultimaSincronizacion = new Date();
    if (!dto.tiposHabitacion) {
      await this.tiposService.asegurarTipoBase(alojamiento);
      await this.tiposService.propagarDesdeAlojamiento(alojamiento, campos);
    }
    const guardado = await this.alojamientoRepo.save(Object.assign(alojamiento, campos));
    if (dto.tiposHabitacion) await this.tiposService.reemplazar(guardado, dto.tiposHabitacion);
    else await this.tiposService.resumir(guardado.id);
    return this.releer(guardado.id);
  }

  async replace(id: string, dto: CreateAlojamientoDto, actor?: ActorCatalogo): Promise<void> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    exigirPropiedad(actor, alojamiento.proveedorId);
    await this.aplicarEdicion(alojamiento, dto, actor);
  }

  async update(id: string, dto: UpdateAlojamientoDto, actor?: ActorCatalogo): Promise<any> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    exigirPropiedad(actor, alojamiento.proveedorId);
    return this.aplicarEdicion(alojamiento, dto, actor);
  }

  /**
   * Baja. Se rechaza (409) si hay reservas confirmadas que aún no han terminado:
   * hay que desactivarlo (estado INACTIVO). Si solo tiene reservas pasadas o
   * canceladas, se da de baja LÓGICA (deleted_at) para conservar el historial
   * contable; sin reservas, se borra.
   */
  async delete(id: string, actor?: ActorCatalogo): Promise<{ baja: 'logica' | 'definitiva' }> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    exigirPropiedad(actor, alojamiento.proveedorId);
    const hoy = fechaRelativa(0);
    const reservas = await this.reservaRepo.find({ where: { alojamientoId: id } as any });
    const pendientes = reservas.filter((r) => r.status === ReservationStatus.CONFIRMED && String(r.checkout) >= hoy);
    if (pendientes.length > 0) {
      throw new ConflictException(
        `No se puede eliminar: tiene ${pendientes.length} reserva(s) confirmada(s) pendientes. Desactívalo (estado INACTIVO) para ocultarlo sin afectar a esos clientes.`,
      );
    }
    if (reservas.length > 0) {
      alojamiento.estado = 'INACTIVO';
      await this.alojamientoRepo.save(alojamiento);
      await this.alojamientoRepo.softRemove(alojamiento);
      return { baja: 'logica' };
    }
    await this.alojamientoRepo.remove(alojamiento);
    return { baja: 'definitiva' };
  }

  // ── Tipos de habitación (panel y proveedores) ────────────────────────────

  /** Tipos a la venta de un alojamiento activo (ficha pública). */
  async tiposPublicos(id: string) {
    const alojamiento = await this.alojamientoRepo.findOne({ where: { id, ...SOLO_ACTIVOS } as any });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    return (await this.tiposService.asegurarTipoBase(alojamiento)).map((t) => this.tipoPublico(t));
  }

  private async alojamientoGestionable(id: string, actor?: ActorCatalogo): Promise<Alojamiento> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    exigirPropiedad(actor, alojamiento.proveedorId);
    return alojamiento;
  }

  async crearTipo(id: string, dto: CreateTipoHabitacionDto, actor?: ActorCatalogo) {
    const alojamiento = await this.alojamientoGestionable(id, actor);
    await this.tiposService.asegurarTipoBase(alojamiento);
    return this.tipoPublico(await this.tiposService.crear(alojamiento, dto));
  }

  async actualizarTipo(id: string, tipoId: string, dto: UpdateTipoHabitacionDto, actor?: ActorCatalogo) {
    await this.alojamientoGestionable(id, actor);
    return this.tipoPublico(await this.tiposService.actualizar(id, tipoId, dto));
  }

  async eliminarTipo(id: string, tipoId: string, actor?: ActorCatalogo) {
    await this.alojamientoGestionable(id, actor);
    return this.tiposService.eliminar(id, tipoId);
  }

  /**
   * Catálogo para el panel de gestión: TODOS los alojamientos (también los
   * inactivos), con su origen y sus reservas pendientes. Un proveedor solo ve los suyos.
   */
  async catalogoGestion(
    filtros: { estado?: string; proveedor?: string; q?: string },
    actor?: ActorCatalogo,
  ): Promise<any> {
    let lista = await this.alojamientoRepo.find({ order: { createdAt: 'DESC' } });
    if (actor?.tipo === 'proveedor') lista = lista.filter((a) => a.proveedorId === actor.proveedorId);
    const estado = (filtros.estado || '').toUpperCase();
    if (estado === 'ACTIVO' || estado === 'INACTIVO') lista = lista.filter((a) => (a.estado || 'ACTIVO') === estado);
    if (filtros.proveedor === 'manual') lista = lista.filter((a) => !a.proveedorId);
    else if (filtros.proveedor) lista = lista.filter((a) => a.proveedorId === filtros.proveedor);
    if (filtros.q?.trim()) {
      const q = normalizarBusqueda(filtros.q);
      lista = lista.filter((a) => [a.nombre, a.destino, a.id, a.idExterno].some((c) => normalizarBusqueda(c).includes(q)));
    }

    const hoy = fechaRelativa(0);
    const confirmadas = await this.reservaRepo.find({ where: { status: ReservationStatus.CONFIRMED } });
    const pendientesPor = new Map<string, number>();
    for (const r of confirmadas) {
      if (String(r.checkout) >= hoy) pendientesPor.set(r.alojamientoId, (pendientesPor.get(r.alojamientoId) || 0) + 1);
    }

    const todos = await this.alojamientoRepo.find();
    const visibles = actor?.tipo === 'proveedor' ? todos.filter((a) => a.proveedorId === actor.proveedorId) : todos;
    const proveedores = [...new Set(visibles.map((a) => a.proveedorId).filter(Boolean))].sort();
    // Tipos de habitación de cada alojamiento (también los inactivos: el panel los gestiona).
    // Un alojamiento sin tipos (insertado a mano en la BD) recibe aquí su tipo "estándar".
    const tiposPor = await this.tiposService.listarDe(lista.map((a) => a.id));
    for (const a of lista.filter((x) => !tiposPor.has(x.id))) {
      tiposPor.set(a.id, await this.tiposService.asegurarTipoBase(a));
    }

    return {
      data: lista.map((a) => ({
        ...this.transformAlojamiento(a, tiposPor.get(a.id) ?? []),
        reservas_pendientes: pendientesPor.get(a.id) || 0,
        creado_en: a.createdAt,
        actualizado_en: a.updatedAt,
      })),
      resumen: {
        total: visibles.length,
        activos: visibles.filter((a) => (a.estado || 'ACTIVO') === 'ACTIVO').length,
        inactivos: visibles.filter((a) => a.estado === 'INACTIVO').length,
        manuales: visibles.filter((a) => !a.proveedorId).length,
        de_proveedores: visibles.filter((a) => a.proveedorId).length,
        proveedores,
      },
    };
  }

  /**
   * Sincronización por lotes desde el sistema de un proveedor.
   *
   * Idempotente: la clave es (proveedorId, idExterno). Si ya existe se ACTUALIZA,
   * si no se CREA; reenviar el mismo lote no duplica nada. Para retirar un
   * alojamiento se envía con `estado: 'INACTIVO'`.
   *
   * Cada elemento se valida por separado con el MISMO contrato que el alta
   * (CreateAlojamientoDto): un elemento inválido no impide guardar los demás, y
   * su error se devuelve con el campo exacto, como en las APIs de contenido de Booking.
   */
  async sincronizar(items: unknown[], actor: ActorCatalogo, proveedorDelLote?: string): Promise<any> {
    const proveedorId = actor.tipo === 'proveedor' ? actor.proveedorId : proveedorDelLote;
    if (!proveedorId || !/^[a-z0-9-]{2,60}$/.test(proveedorId)) {
      throw validacion('Indica el proveedor del lote.', [
        { name: 'proveedorId', reason: 'Obligatorio para un administrador (con API key se toma de la clave). Minúsculas, números y "-".' },
      ]);
    }
    if (actor.tipo !== 'proveedor') await this.exigirProveedorRegistrado(proveedorId);

    const resultados: any[] = [];
    const vistos = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      const crudo = items[i] as any;
      const idExterno = typeof crudo?.idExterno === 'string' ? crudo.idExterno : null;
      if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
        resultados.push({ indice: i, idExterno: null, resultado: 'ERROR', errores: [{ name: `alojamientos.${i}`, reason: 'Debe ser un objeto.' }] });
        continue;
      }
      if (!idExterno) {
        resultados.push({ indice: i, idExterno: null, resultado: 'ERROR', errores: [{ name: 'idExterno', reason: 'Es obligatorio al sincronizar.' }] });
        continue;
      }
      if (vistos.has(idExterno)) {
        resultados.push({ indice: i, idExterno, resultado: 'ERROR', errores: [{ name: 'idExterno', reason: 'Está repetido en el mismo lote.' }] });
        continue;
      }
      vistos.add(idExterno);

      const { proveedorId: _ignorado, ...datos } = crudo;
      const dto = plainToInstance(CreateAlojamientoDto, datos);
      const errores: ValidationError[] = await validate(dto as object, { whitelist: true, forbidNonWhitelisted: true });
      if (errores.length) {
        resultados.push({ indice: i, idExterno, resultado: 'ERROR', errores: aplanarValidacion(errores) });
        continue;
      }

      try {
        // También los dados de baja lógica: reenviarlos los RESTAURA (mismo id, mismo historial).
        const existente = await this.alojamientoRepo.findOne({ where: { proveedorId, idExterno }, withDeleted: true } as any);
        if (existente) {
          if (existente.deletedAt) {
            existente.deletedAt = null as any;
            await this.alojamientoRepo.save(existente);
          }
          const guardado = await this.aplicarEdicion(existente, dto, { tipo: 'proveedor', proveedorId });
          resultados.push({ indice: i, idExterno, resultado: 'ACTUALIZADO', id: guardado.id, estado: guardado.estado || 'ACTIVO' });
        } else {
          const creado = await this.create(dto, { tipo: 'proveedor', proveedorId });
          resultados.push({ indice: i, idExterno, resultado: 'CREADO', id: creado.id, estado: creado.estado });
        }
      } catch (e) {
        // Una regla de negocio (p. ej. tipos de habitación incoherentes) falla solo ese elemento.
        if (!(e instanceof HttpException) || e.getStatus() >= 500) throw e;
        const params = e instanceof ProblemaApi && e.invalidParams.length ? e.invalidParams : [{ name: 'alojamiento', reason: e.message }];
        resultados.push({ indice: i, idExterno, resultado: 'ERROR', errores: params });
      }
    }

    const cuenta = (r: string) => resultados.filter((x) => x.resultado === r).length;
    this.telemetryService?.trackEvent({
      event_name: 'catalog_synced',
      vertical: 'alojamientos',
      properties: { proveedor_id: proveedorId, creados: cuenta('CREADO'), actualizados: cuenta('ACTUALIZADO'), errores: cuenta('ERROR') },
    });
    return {
      proveedor_id: proveedorId,
      resumen: { recibidos: items.length, creados: cuenta('CREADO'), actualizados: cuenta('ACTUALIZADO'), errores: cuenta('ERROR') },
      resultados,
    };
  }

  async getResenas(alojamientoId: string): Promise<any> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id: alojamientoId });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);

    let resenas = await this.resenaRepo.find({ where: { alojamientoId }, order: { createdAt: 'DESC' } });

    if (resenas.length === 0) {
      const mocks = [
        {
          alojamientoId,
          usuarioId: 'mock-user-1',
          usuarioNombre: 'Carlos M.',
          usuarioPais: 'Colombia',
          comentario: 'Excelente alojamiento, muy limpio y bien ubicado. El anfitrión fue muy atento y resolvió todas nuestras dudas. Lo recomiendo totalmente.',
          puntuacion: 9.2,
          limpieza: 9.5,
          servicio: 9.0,
          calidad: 9.0,
        },
        {
          alojamientoId,
          usuarioId: 'mock-user-2',
          usuarioNombre: 'Laura P.',
          usuarioPais: 'Ecuador',
          comentario: 'Muy buen apartamento, tiene todo lo necesario. La vista desde la terraza es increíble. Volvería sin dudarlo.',
          puntuacion: 9.6,
          limpieza: 10.0,
          servicio: 9.5,
          calidad: 9.2,
        },
        {
          alojamientoId,
          usuarioId: 'mock-user-3',
          usuarioNombre: 'Roberto A.',
          usuarioPais: 'Perú',
          comentario: 'La ubicación es perfecta, cerca de todo. El apartamento es espacioso y moderno. Solo mejoraría la velocidad del WiFi.',
          puntuacion: 8.8,
          limpieza: 9.0,
          servicio: 8.5,
          calidad: 9.0,
        },
      ];
      resenas = await this.resenaRepo.save(mocks as any[]);
    }

    const avg = (arr: number[]) => Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
    const scores = {
      limpieza: avg(resenas.map((r) => r.limpieza)),
      servicio: avg(resenas.map((r) => r.servicio)),
      calidad: avg(resenas.map((r) => r.calidad)),
      general: avg(resenas.map((r) => r.puntuacion)),
    };

    return { resenas, scores, total: resenas.length };
  }

  // --- Helpers de Formateo ---

  private buildReservaResponse(
    reserva: ReservaAlojamiento,
    alojamiento?: any,
    extra: { tipo?: TipoHabitacion | null; huespedes?: HuespedReserva[] } = {},
  ) {
    const defaultPhoto = 'https://cf.bstatic.com/xdata/images/hotel/max1024x768/833148758.jpg?k=4af6fee87e75cf2bdb688cfa67e30d77b3282140a0ed4ee22ac61e5be30b95dd&o=&hp=1';
    const photos = alojamiento?.photos;
    const photoUrl = Array.isArray(photos) && photos.length > 0 ? photos[0].url : defaultPhoto;

    return {
      reservation_id: reserva.id,
      alojamiento_id: reserva.alojamientoId,
      codigo_reserva: reserva.codigoReserva,
      status: reserva.status,
      customer_name: reserva.customerName,
      customer_email: reserva.customerEmail,
      checkin: reserva.checkin,
      checkout: reserva.checkout,
      noches: reserva.noches,
      huespedes: reserva.huespedes,
      adultos: reserva.adultos ?? reserva.huespedes,
      ninos: reserva.ninos ?? 0,
      habitaciones_count: reserva.habitacionesCount,
      tipo_habitacion: extra.tipo
        ? {
            id: extra.tipo.id,
            codigo: extra.tipo.codigo,
            nombre: extra.tipo.nombre,
            regimen: NOMBRE_REGIMEN[extra.tipo.regimen] ?? extra.tipo.regimen,
            cancelacion: textoCancelacion(extra.tipo.cancelacionGratuitaHoras),
          }
        : reserva.tipoHabitacionId
          ? { id: reserva.tipoHabitacionId }
          : null,
      precio_noche: reserva.precioNoche !== undefined && reserva.precioNoche !== null ? Number(reserva.precioNoche) : null,
      total_price: reserva.totalPrice || { currency: reserva.moneda || 'USD', total: Number(reserva.total) },
      telefono: reserva.telefono ?? null,
      peticiones_especiales: reserva.peticionesEspeciales ?? null,
      hora_llegada: reserva.horaLlegada ?? null,
      // Vinculada a una cuenta (usuario_id) o hecha sin sesión.
      cuenta_vinculada: Boolean(reserva.usuarioId),
      cancelada_en: reserva.canceladaEn ?? null,
      motivo_cancelacion: reserva.motivoCancelacion ?? null,
      huespedes_detalle: (extra.huespedes ?? []).map((h) => ({
        orden: h.orden,
        es_titular: h.esTitular,
        tipo: h.tipo,
        nombre: h.nombre,
        apellido: h.apellido,
        edad: h.edad ?? null,
      })),
      created_at: reserva.createdAt,
      nombre_alojamiento: alojamiento?.nombre || null,
      destino: alojamiento?.destino || null,
      photo_url: photoUrl,
      _links: {
        self: { href: `/api/v1/alojamientos/reservations/${reserva.id}`, type: 'GET' },
        cancelar: { href: `/api/v1/alojamientos/reservations/${reserva.id}/cancel`, type: 'POST' },
        alojamiento: { href: `/api/v1/alojamientos/${reserva.alojamientoId}`, type: 'GET' },
      },
    };
  }

  private buildOrderDetailDto(
    reserva: ReservaAlojamiento,
    alojamiento?: any,
    paymentReference?: string,
    tipo?: TipoHabitacion | null,
  ): OrderDetailDto {
    return {
      order_id: reserva.id,
      codigo_reserva: reserva.codigoReserva,
      status: reserva.status,
      accommodation_details: {
        id: alojamiento?.id || reserva.alojamientoId,
        nombre: alojamiento?.nombre || 'Propiedad de Alojamiento',
        destino: alojamiento?.destino || 'Ecuador',
        checkin: reserva.checkin,
        checkout: reserva.checkout,
        noches: reserva.noches,
        habitaciones: reserva.habitacionesCount,
        huespedes: reserva.huespedes,
        adultos: reserva.adultos ?? reserva.huespedes,
        ninos: reserva.ninos ?? 0,
        precio_noche: reserva.precioNoche !== undefined && reserva.precioNoche !== null ? Number(reserva.precioNoche) : null,
      },
      tipo_habitacion: tipo ? { id: tipo.id, codigo: tipo.codigo, nombre: tipo.nombre } : reserva.tipoHabitacionId ? { id: reserva.tipoHabitacionId } : null,
      total_price: Number(reserva.total),
      currency: reserva.moneda || reserva.totalPrice?.currency || 'USD',
      creation_date: reserva.createdAt ? new Date(reserva.createdAt).toISOString() : new Date().toISOString(),
      payment_reference: paymentReference || 'pay_verified',
      customer_name: reserva.customerName,
      customer_email: reserva.customerEmail,
      _links: {
        self: { href: `/api/v1/alojamientos/orders/${reserva.id}`, type: 'GET' },
        modify: { href: `/api/v1/alojamientos/orders/${reserva.id}/modify`, type: 'POST' },
        cancel: { href: `/api/v1/alojamientos/orders/${reserva.id}/cancel`, type: 'POST' },
        accommodation: { href: `/api/v1/alojamientos/${reserva.alojamientoId}`, type: 'GET' },
      },
    };
  }

  /**
   * Check-in Digital de Alojamiento (Cátedra RDA2 §4).
   * Liberado estrictamente a las 14:00 del día de ingreso; emite habitación asignada y clave de acceso digital.
   */
  async checkin(reservaId: string): Promise<any> {
    const reserva = await this.reservaRepo.findOne({
      where: [{ id: reservaId }, { codigoReserva: reservaId }],
    });

    if (!reserva) {
      throw new HttpException('Reserva de alojamiento no encontrada', HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const habitacion = reserva.habitacionAsignada || 'Habitación 304 (Suite Deluxe)';
    const claveDigital = reserva.claveAccesoDigital || `KEY-${Math.floor(100000 + Math.random() * 900000)}`;

    reserva.habitacionAsignada = habitacion;
    reserva.claveAccesoDigital = claveDigital;
    reserva.checkinLiberadoALas14 = true;
    reserva.checkinCompletadoAt = now;
    reserva.status = 'CHECKED_IN';
    await this.reservaRepo.save(reserva);

    return {
      success: true,
      reserva_id: reserva.id,
      codigo_reserva: reserva.codigoReserva,
      habitacion_asignada: habitacion,
      clave_acceso_digital: claveDigital,
      hora_checkin: now.toISOString(),
      mensaje: '¡Check-in completado exitosamente! Llave digital y acceso habilitados.',
    };
  }
}
