import { Injectable, Logger, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { firstValueFrom } from 'rxjs';

import { Alojamiento } from './entities/alojamiento.entity';
import { ReservaAlojamiento } from './entities/reserva.entity';
import { Host } from './entities/host.entity';
import { Amenidad } from './entities/amenidad.entity';
import { FotoAlojamiento } from './entities/foto.entity';
import { ResenaAlojamiento } from './entities/resena.entity';

import { SearchAlojamientosRequestDto } from './dto/search-alojamientos.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { ReservationRequestDto, CancelReservationRequestDto, ReservationStatus } from './dto/reservation.dto';
import { CreateAlojamientoDto } from './dto/create-alojamiento.dto';
import { UpdateAlojamientoDto } from './dto/update-alojamiento.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class AlojamientosService implements OnModuleInit {
  private readonly logger = new Logger(AlojamientosService.name);
  private readonly EXTERNAL_API_URL = 'https://jsonplaceholder.typicode.com/posts';

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Alojamiento)
    private readonly alojamientoRepo: Repository<Alojamiento>,
    @InjectRepository(ReservaAlojamiento)
    private readonly reservaRepo: Repository<ReservaAlojamiento>,
    @InjectRepository(Host)
    private readonly hostRepo: Repository<Host>,
    @InjectRepository(Amenidad)
    private readonly amenidadRepo: Repository<Amenidad>,
    @InjectRepository(FotoAlojamiento)
    private readonly fotoRepo: Repository<FotoAlojamiento>,
    @InjectRepository(ResenaAlojamiento)
    private readonly resenaRepo: Repository<ResenaAlojamiento>,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.alojamientoRepo.count();
      this.logger.log(`Conexión a base de datos de Alojamientos activa. Total de registros: ${count}`);
    } catch (err: any) {
      this.logger.warn('Error al verificar base de datos de alojamientos:', err.message);
    }
  }

  private transformAlojamiento(l: Alojamiento) {
    const photos = (l.fotos && l.fotos.length > 0)
      ? l.fotos.sort((a, b) => (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0) || a.orden - b.orden)
          .map((f) => ({ url: f.url, caption: f.titulo }))
      : [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800' }];

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
      barrio: l.barrio,
      direccion: l.direccion,
      precioPorNoche: Number(l.precioPorNoche),
      moneda: l.moneda || 'USD',
      capacidadAdultos: l.capacidadAdultos || 2,
      capacidadNinos: l.capacidadNinos || 0,
      habitaciones: l.habitaciones || 1,
      camas: l.camas || 1,
      banos: Number(l.banos) || 1.0,
      tienePiscina: l.tienePiscina,
      host: l.host ? {
        id: l.host.id,
        nombre: l.host.nombre,
        tiempo_respuesta: l.host.tiempoRespuesta,
        es_superhost: l.host.esSuperhost,
        foto_perfil: l.host.fotoPerfil,
      } : null,
      photos,
      ratings: {
        score: Number(l.rating) || 9.0,
        limpieza: Number(l.ratingLimpieza) || 9.0,
        ubicacion: Number(l.ratingUbicacion) || 9.0,
        servicio: Number(l.ratingServicio) || 9.0,
        number_of_reviews: l.totalReviews || l.resenas?.length || 0,
      },
      amenidades: l.amenidades?.map((a) => a.nombre) || [],
      ubicacion: {
        address: l.direccion || l.barrio || l.destino,
        city: l.destino,
        country: countryCode,
        coordinates: {
          latitude: Number(l.latitud) || 0,
          longitude: Number(l.longitud) || 0,
        },
      },
      resenas: l.resenas?.map((r) => ({
        autor: r.reviewerName,
        fecha: r.fecha,
        puntuacion: Number(r.puntuacion),
        comentario: r.comentario,
      })) || [],
      url: { web: `/alojamientos/${l.id}` },
      _links: {
        self: { href: `/api/v1/alojamientos/${l.id}`, type: 'GET' },
        reservations: { href: `/api/v1/alojamientos/${l.id}/reservations`, type: 'POST' },
      },
    };
  }

  async search(dto: SearchAlojamientosRequestDto): Promise<any> {
    this.logger.log('Búsqueda avanzada de alojamientos', dto);

    const where: any = {};
    if (dto.destino) {
      where.destino = ILike(`%${dto.destino}%`);
    }

    const [items, total] = await this.alojamientoRepo.findAndCount({
      where,
      relations: ['host', 'fotos', 'amenidades', 'resenas'],
      take: dto.rows || 10,
    });

    let filtered = items;
    if (dto.filters?.tienePiscina) {
      filtered = filtered.filter((i) => i.tienePiscina);
    }

    if (filtered.length > 0) {
      const data = filtered.map((l) => this.transformAlojamiento(l));

      return {
        data,
        metadata: {
          total_results: total,
          next_page: total > (dto.rows || 10) ? Buffer.from(JSON.stringify({ page: 2 })).toString('base64') : null,
        },
        request_id: `req-${Date.now()}`,
      };
    }

    return this.findAll({ limit: dto.rows || 10, page: 1 });
  }

  async getDetailsBatch(dto: DetailsRequestDto): Promise<any> {
    this.logger.log(`Consultando batch details para ${dto.accommodations.length} alojamientos`);
    const data = await Promise.all(
      dto.accommodations.map(async (id) => {
        try {
          return await this.findOne(id);
        } catch {
          return { id, nombre: `Alojamiento ${id}`, disponible: false };
        }
      }),
    );

    return {
      request_id: `req-batch-${Date.now()}`,
      data,
    };
  }

  async health(): Promise<any> {
    const total = await this.alojamientoRepo.count();
    return { status: 'ok', service: 'Alojamientos', database: 'connected', total_listings: total };
  }

  async findAll(query: PaginationQueryDto): Promise<any> {
    this.logger.log(`Consultando catálogo de alojamientos`);

    const locales = await this.alojamientoRepo.find({
      relations: ['host', 'fotos', 'amenidades', 'resenas'],
      take: query.limit || 10,
      skip: ((query.page || 1) - 1) * (query.limit || 10),
      order: { rating: 'DESC' },
    });

    if (locales.length > 0) {
      const total = await this.alojamientoRepo.count();
      const data = locales.map((l) => this.transformAlojamiento(l));
      return {
        data,
        meta: {
          total,
          limit: query.limit || 10,
          page: query.page || 1,
        },
      };
    }

    // Fallback externo si no hubiera datos
    return {
      data: [],
      meta: { total: 0, limit: query.limit || 10, page: query.page || 1 },
    };
  }

  async findOne(id: string): Promise<any> {
    this.logger.log(`Consultando detalle granular de Alojamiento ID ${id}`);

    const local = await this.alojamientoRepo.findOne({
      where: { id },
      relations: ['host', 'fotos', 'amenidades', 'resenas'],
    });

    if (local) {
      return this.transformAlojamiento(local);
    }

    throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
  }

  async getAvailability(id: string, date: string): Promise<any> {
    this.logger.log(`Consultando disponibilidad para alojamiento ${id} en ${date}`);
    const local = await this.alojamientoRepo.findOne({ where: { id } });
    const precio = local ? Number(local.precioPorNoche) : 150.0;
    return {
      alojamiento_id: id,
      date: date || new Date().toISOString().split('T')[0],
      available_rooms: local ? local.habitaciones : 5,
      price_per_night: precio,
      checkin_times: ['14:00', '15:00', '16:00'],
    };
  }

  async reservar(id: string, dto: ReservationRequestDto, idempotencyKey: string): Promise<any> {
    this.logger.log(`Iniciando reserva granular para Alojamiento ${id} con idempotency key ${idempotencyKey}`);

    // Verificación de Idempotencia estricta
    const existing = await this.reservaRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      if (existing.status === ReservationStatus.CONFIRMED) {
        throw new HttpException('Conflicto de Idempotencia: Reserva ya procesada.', HttpStatus.CONFLICT);
      }
      return this.buildReservaResponse(existing);
    }

    const alojamiento = await this.findOne(id);
    const nights = Math.max(1, dto.nights || 1);
    const pricePerNight = Number(alojamiento.precioPorNoche) || 100.0;
    const roomsCount = dto.habitaciones_count || 1;
    const total = pricePerNight * nights * roomsCount;

    const codigoReserva = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;

    let reserva = this.reservaRepo.create({
      codigoReserva,
      alojamientoId: id,
      idempotencyKey,
      status: ReservationStatus.CONFIRMED,
      total,
      customerName: dto.customer_name,
      customerEmail: dto.customer_email || 'cliente@example.com',
      checkin: dto.checkin || new Date().toISOString().split('T')[0],
      checkout: dto.checkout || new Date(Date.now() + 86400000 * nights).toISOString().split('T')[0],
      huespedes: (dto.adultos || 1) + (dto.ninos || 0),
    });

    reserva = await this.reservaRepo.save(reserva);
    return this.buildReservaResponse(reserva);
  }

  async cancelarReserva(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string): Promise<any> {
    this.logger.log(`Cancelando reserva ${reservationId} (razón: ${dto.reason}) con idempotency key ${idempotencyKey}`);

    const reserva = await this.reservaRepo.findOneBy({ id: reservationId });
    if (!reserva) throw new HttpException('Reserva no encontrada', HttpStatus.NOT_FOUND);

    if (reserva.status === ReservationStatus.CANCELLED) {
      return this.buildReservaResponse(reserva);
    }

    reserva.status = ReservationStatus.CANCELLED;
    await this.reservaRepo.save(reserva);

    return this.buildReservaResponse(reserva);
  }

  async getReservas(): Promise<any> {
    this.logger.log('Consultando historial de reservas de alojamientos');
    const reservas = await this.reservaRepo.find({ order: { createdAt: 'DESC' } });
    return reservas.map((r) => this.buildReservaResponse(r));
  }

  async getReservaById(reservationId: string): Promise<any> {
    this.logger.log(`Consultando detalle de reserva ${reservationId}`);
    const reserva = await this.reservaRepo.findOneBy({ id: reservationId });
    if (!reserva) throw new HttpException('Reserva no encontrada', HttpStatus.NOT_FOUND);
    return this.buildReservaResponse(reserva);
  }

  async create(dto: CreateAlojamientoDto): Promise<any> {
    const entity = this.alojamientoRepo.create(dto as any);
    return this.alojamientoRepo.save(entity);
  }

  async replace(id: string, dto: CreateAlojamientoDto): Promise<void> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    await this.alojamientoRepo.save({ ...alojamiento, ...(dto as any) });
  }

  async update(id: string, dto: UpdateAlojamientoDto): Promise<any> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    Object.assign(alojamiento, dto);
    return this.alojamientoRepo.save(alojamiento);
  }

  async delete(id: string): Promise<void> {
    const alojamiento = await this.alojamientoRepo.findOneBy({ id });
    if (!alojamiento) throw new HttpException('Alojamiento no encontrado', HttpStatus.NOT_FOUND);
    await this.alojamientoRepo.remove(alojamiento);
  }

  private buildReservaResponse(reserva: ReservaAlojamiento) {
    return {
      reservation_id: reserva.id,
      codigo_reserva: reserva.codigoReserva,
      status: reserva.status,
      customer_name: reserva.customerName,
      customer_email: reserva.customerEmail,
      checkin: reserva.checkin,
      checkout: reserva.checkout,
      huespedes: reserva.huespedes,
      total_price: { currency: 'USD', total: Number(reserva.total) },
      created_at: reserva.createdAt,
      _links: {
        self: { href: `/api/v1/alojamientos/reservations/${reserva.id}`, type: 'GET' },
        cancelar: { href: `/api/v1/alojamientos/reservations/${reserva.id}/cancel`, type: 'POST' },
        alojamiento: { href: `/api/v1/alojamientos/${reserva.alojamientoId}`, type: 'GET' },
      },
    };
  }
}
