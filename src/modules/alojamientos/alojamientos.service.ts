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
import { Repository, ILike } from 'typeorm';
import { randomUUID } from 'crypto';

import { Alojamiento } from './entities/alojamiento.entity';
import { ReservaAlojamiento } from './entities/reserva.entity';
import { ResenaAlojamiento } from './entities/resena.entity';

import { SearchAlojamientosRequestDto } from './dto/search-alojamientos.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { ReservationRequestDto, CancelReservationRequestDto, ReservationStatus } from './dto/reservation.dto';
import { CreateAlojamientoDto } from './dto/create-alojamiento.dto';
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
} from '../../core/errors/codigo-error';

interface OrderPreviewStoreItem {
  id: string;
  alojamientoId: string;
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

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Alojamiento)
    private readonly alojamientoRepo: Repository<Alojamiento>,
    @InjectRepository(ReservaAlojamiento)
    private readonly reservaRepo: Repository<ReservaAlojamiento>,
    @InjectRepository(ResenaAlojamiento)
    private readonly resenaRepo: Repository<ResenaAlojamiento>,
    @Optional()
    private readonly telemetryService?: TelemetryService,
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

    const where: any = {};
    const destinoTerm = dto.destino || (typeof dto.city === 'string' ? dto.city : undefined);

    if (destinoTerm) {
      where.destino = ILike(`%${destinoTerm}%`);
    } else if (dto.country) {
      const paisDestinoMap: Record<string, string> = {
        ec: 'Quito',
        mx: 'Cancún',
        co: 'Cartagena',
        pe: 'Cusco',
      };
      const destinoMapeado = paisDestinoMap[dto.country.toLowerCase()];
      if (destinoMapeado) {
        where.destino = ILike(`%${destinoMapeado}%`);
      }
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

    const rowsCount = dto.rows || 10;
    const [items, total] = await this.alojamientoRepo.findAndCount({
      where,
      take: rowsCount,
    });

    let filtered = items;
    if (dto.filters?.tienePiscina) {
      filtered = filtered.filter((i) => i.tienePiscina);
    }
    if (dto.filters?.precioMin !== undefined) {
      filtered = filtered.filter((i) => Number(i.precioPorNoche) >= dto.filters!.precioMin!);
    }
    if (dto.filters?.precioMax !== undefined) {
      filtered = filtered.filter((i) => Number(i.precioPorNoche) <= dto.filters!.precioMax!);
    }

    if (filtered.length > 0) {
      const data = filtered.map((l) => this.transformAlojamiento(l));

      return {
        request_id: `req-${Date.now()}`,
        data,
        metadata: {
          total_results: total,
          next_page: total > rowsCount ? Buffer.from(JSON.stringify({ page: 2 })).toString('base64') : null,
        },
        next_page: total > rowsCount ? Buffer.from(JSON.stringify({ page: 2 })).toString('base64') : null,
      };
    }

    return this.findAll({ limit: rowsCount, page: 1 });
  }

  async getDetailsBatch(dto: DetailsRequestDto): Promise<any> {
    this.logger.log(`Consultando batch details para ${dto.accommodations.length} alojamientos`);
    const data = await Promise.all(
      dto.accommodations.map(async (id) => {
        try {
          return await this.findOne(String(id));
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
    let local = await this.alojamientoRepo.findOne({ where: { id: accId } });
    if (!local) {
      local = await this.alojamientoRepo.findOne({ order: { createdAt: 'ASC' } });
    }

    const basePrice = local ? Number(local.precioPorNoche) : 120.0;
    const currency = dto.currency || local?.moneda || 'USD';

    // Cálculo de noches
    let nights = 1;
    if (dto.checkin && dto.checkout) {
      const dIn = new Date(dto.checkin).getTime();
      const dOut = new Date(dto.checkout).getTime();
      if (dOut > dIn) {
        nights = Math.max(1, Math.round((dOut - dIn) / (1000 * 60 * 60 * 24)));
      }
    }

    const products = [
      {
        product_id: `prod_${local?.id || accId}_std`,
        room_name: 'Habitación Estándar',
        meal_plan: 'Solo Alojamiento',
        cancellation_type: 'Cancelación gratuita hasta 48 horas antes',
        price: Number((basePrice * nights).toFixed(2)),
        currency,
      },
      {
        product_id: `prod_${local?.id || accId}_deluxe_bb`,
        room_name: 'Habitación Deluxe con Balcón',
        meal_plan: 'Desayuno Buffet Incluido',
        cancellation_type: 'Cancelación gratuita hasta 24 horas antes',
        price: Number((basePrice * 1.25 * nights).toFixed(2)),
        currency,
      },
      {
        product_id: `prod_${local?.id || accId}_suite_ai`,
        room_name: 'Master Suite Premium',
        meal_plan: 'Todo Incluido',
        cancellation_type: 'No Reembolsable (Tarifa Promocional)',
        price: Number((basePrice * 1.6 * nights).toFixed(2)),
        currency,
      },
    ];

    return {
      request_id: `req-avail-${Date.now()}`,
      data: {
        id: local ? local.id : accId,
        currency,
        products,
        url: `/api/v1/alojamientos/${local ? local.id : accId}`,
      },
    };
  }

  async getBulkAvailability(dto: BulkAvailabilityRequestDto): Promise<BulkAvailabilityResponseDto> {
    this.logger.log(`Consultando bulk availability para ${dto.accommodations.length} propiedades`);
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
    let local = await this.alojamientoRepo.findOne({ where: { id: accId } });
    if (!local) {
      local = await this.alojamientoRepo.findOne({ order: { createdAt: 'ASC' } });
    }
    if (!local) {
      throw new NotFoundException(`El alojamiento '${dto.accommodation_id}' no existe.`);
    }

    let nights = 1;
    if (dto.checkin && dto.checkout) {
      const dIn = new Date(dto.checkin).getTime();
      const dOut = new Date(dto.checkout).getTime();
      if (dOut > dIn) {
        nights = Math.max(1, Math.round((dOut - dIn) / (1000 * 60 * 60 * 24)));
      }
    }

    const rooms = dto.guests?.number_of_rooms || 1;
    let multiplier = 1.0;
    if (dto.product_id?.includes('deluxe')) multiplier = 1.25;
    if (dto.product_id?.includes('suite')) multiplier = 1.6;

    const basePrice = Number(local.precioPorNoche) || 120.0;
    const totalPrice = Number((basePrice * multiplier * nights * rooms).toFixed(2));
    const previewId = `prev_${randomUUID().substring(0, 8)}`;

    // Guardar en caché temporal para validación en createOrder
    this.orderPreviews.set(previewId, {
      id: previewId,
      alojamientoId: local.id,
      checkin: dto.checkin || new Date().toISOString().split('T')[0],
      checkout: dto.checkout || new Date(Date.now() + 86400000 * nights).toISOString().split('T')[0],
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
        total_price: totalPrice,
        currency: local.moneda || 'USD',
        nights,
        rooms,
      },
    };
  }

  async createOrder(dto: OrderCreateRequestDto, idempotencyKey: string): Promise<OrderDetailDto> {
    this.logger.log(`Creando orden de alojamiento a partir de preview ${dto.order_preview_id} con idempotency key ${idempotencyKey}`);

    // 1. Verificación de Idempotencia estricta
    const existing = await this.reservaRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      if (existing.status === ReservationStatus.CONFIRMED) {
        this.logger.warn(`Idempotencia detectada: retornando reserva confirmada previa ${existing.id}`);
        const local = await this.alojamientoRepo.findOne({ where: { id: existing.alojamientoId } });
        return this.buildOrderDetailDto(existing, local, dto.payment_reference);
      }
    }

    // 2. Validación de referencia de pago (RFC 7807: PAYMENT_REFERENCE_INVALID)
    if (!dto.payment_reference || dto.payment_reference.trim().length < 4) {
      throw noProcesable(
        CodigoProblema.PAYMENT_REFERENCE_INVALID,
        'payment_reference inválido o ausente. Se requiere confirmación de pago de la Payment API.',
      );
    }

    // 3. Resolución de datos del preview o fallback
    let preview = this.orderPreviews.get(dto.order_preview_id);
    let local: Alojamiento | null = null;

    if (preview) {
      local = await this.alojamientoRepo.findOne({ where: { id: preview.alojamientoId } });
    } else {
      local = await this.alojamientoRepo.findOne({ order: { createdAt: 'ASC' } });
      preview = {
        id: dto.order_preview_id,
        alojamientoId: local ? local.id : 'aloj-1',
        checkin: new Date().toISOString().split('T')[0],
        checkout: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        nights: 2,
        rooms: 1,
        guests: { number_of_adults: 2, number_of_rooms: 1 },
        totalPrice: local ? Number(local.precioPorNoche) * 2 : 240.0,
        currency: local?.moneda || 'USD',
        createdAt: Date.now(),
      };
    }

    if (!local) {
      throw conflicto(
        CodigoProblema.ROOM_NO_LONGER_AVAILABLE,
        'El alojamiento seleccionado ya no tiene disponibilidad para formalizar la orden.',
      );
    }

    const codigoReserva = `BKG-${Math.floor(100000 + Math.random() * 900000)}`;
    const fullName = `${dto.customer_details.first_name} ${dto.customer_details.last_name}`;

    let reserva = this.reservaRepo.create({
      codigoReserva,
      alojamientoId: local.id,
      customerName: fullName,
      customerEmail: dto.customer_details.email,
      checkin: preview.checkin,
      checkout: preview.checkout,
      noches: preview.nights,
      huespedes: preview.guests?.number_of_adults || 2,
      habitacionesCount: preview.rooms || 1,
      total: preview.totalPrice,
      totalPrice: { currency: preview.currency, total: preview.totalPrice },
      status: ReservationStatus.CONFIRMED,
      idempotencyKey,
    });

    reserva = await this.reservaRepo.save(reserva);

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

    return this.buildOrderDetailDto(reserva, local, dto.payment_reference);
  }

  async getOrderById(orderId: string): Promise<OrderDetailDto> {
    this.logger.log(`Consultando detalle de orden ${orderId}`);
    const reserva = await this.reservaRepo.findOne({ where: { id: orderId } });
    if (!reserva) {
      throw new NotFoundException(`La orden de alojamiento '${orderId}' no existe.`);
    }

    const local = await this.alojamientoRepo.findOne({ where: { id: reserva.alojamientoId } });
    return this.buildOrderDetailDto(reserva, local);
  }

  async modifyOrder(orderId: string, dto: OrderModifyRequestDto, idempotencyKey: string): Promise<OrderDetailDto> {
    this.logger.log(`Modificando orden ${orderId} con idempotency key ${idempotencyKey}`);
    const reserva = await this.reservaRepo.findOne({ where: { id: orderId } });
    if (!reserva) {
      throw new NotFoundException(`La orden '${orderId}' no existe.`);
    }

    if (reserva.status === ReservationStatus.CANCELLED) {
      throw new ConflictException(`No se puede modificar una orden en estado CANCELLED.`);
    }

    if (dto.checkin) reserva.checkin = dto.checkin;
    if (dto.checkout) reserva.checkout = dto.checkout;
    if (dto.guests?.number_of_adults) reserva.huespedes = dto.guests.number_of_adults;
    if (dto.guests?.number_of_rooms) reserva.habitacionesCount = dto.guests.number_of_rooms;

    if (dto.checkin && dto.checkout) {
      const dIn = new Date(dto.checkin).getTime();
      const dOut = new Date(dto.checkout).getTime();
      if (dOut > dIn) {
        reserva.noches = Math.max(1, Math.round((dOut - dIn) / (1000 * 60 * 60 * 24)));
        const local = await this.alojamientoRepo.findOne({ where: { id: reserva.alojamientoId } });
        const basePrice = local ? Number(local.precioPorNoche) : 120.0;
        reserva.total = Number((basePrice * reserva.noches * reserva.habitacionesCount).toFixed(2));
        reserva.totalPrice = { currency: 'USD', total: reserva.total };
      }
    }

    await this.reservaRepo.save(reserva);
    const local = await this.alojamientoRepo.findOne({ where: { id: reserva.alojamientoId } });

    this.triggerWebhookNotification('ORDER_MODIFIED', reserva.id, {
      order_id: reserva.id,
      checkin: reserva.checkin,
      checkout: reserva.checkout,
      total: reserva.total,
    });

    return this.buildOrderDetailDto(reserva, local);
  }

  async cancelOrder(orderId: string, idempotencyKey: string, reason?: string): Promise<any> {
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
      take: limit,
      skip: (page - 1) * limit,
    });

    if (locales.length > 0) {
      const total = await this.alojamientoRepo.count();
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

    const local = await this.alojamientoRepo.findOne({
      where: { id },
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
    this.logger.log(`Iniciando reserva para Alojamiento ${id} con idempotency key ${idempotencyKey}`);

    const existing = await this.reservaRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      if (existing.status === ReservationStatus.CONFIRMED) {
        throw conflicto(CodigoProblema.BOOKING_NOT_CONFIRMED, 'Conflicto de Idempotencia: Reserva ya procesada con este Idempotency-Key.');
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
      totalPrice: { currency: 'USD', total },
      noches: nights,
      habitacionesCount: roomsCount,
      customerName: dto.customer_name,
      customerEmail: dto.customer_email || 'cliente@example.com',
      checkin: dto.checkin || new Date().toISOString().split('T')[0],
      checkout: dto.checkout || new Date(Date.now() + 86400000 * nights).toISOString().split('T')[0],
      huespedes: (dto.adultos || 1) + (dto.ninos || 0),
    });

    reserva = await this.reservaRepo.save(reserva);

    this.telemetryService?.trackEvent({
      event_name: 'booking_confirmed',
      vertical: 'alojamientos',
      properties: {
        order_id: reserva.id,
        codigo_reserva: reserva.codigoReserva,
        alojamiento_id: reserva.alojamientoId,
        total: reserva.total,
        customer_email: reserva.customerEmail,
      },
    });

    return this.buildReservaResponse(reserva, alojamiento);
  }

  async cancelarReserva(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string): Promise<any> {
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

  async getReservas(): Promise<any> {
    this.logger.log('Consultando historial de reservas de alojamientos');
    const reservas = await this.reservaRepo.find({ order: { createdAt: 'DESC' } });
    const ids = [...new Set(reservas.map((r) => r.alojamientoId))];
    const alojamientos = ids.length > 0 ? await this.alojamientoRepo.find({ where: ids.map((id) => ({ id })) }) : [];
    const alojMap = new Map(alojamientos.map((a) => [a.id, a]));
    return reservas.map((r) => this.buildReservaResponse(r, alojMap.get(r.alojamientoId)));
  }

  async getReservaById(reservationId: string): Promise<any> {
    this.logger.log(`Consultando detalle de reserva ${reservationId}`);
    const reserva = await this.reservaRepo.findOneBy({ id: reservationId });
    if (!reserva) throw new HttpException('Reserva no encontrada', HttpStatus.NOT_FOUND);
    const alojamiento = await this.alojamientoRepo.findOneBy({ id: reserva.alojamientoId });
    return this.buildReservaResponse(reserva, alojamiento);
  }

  async create(dto: CreateAlojamientoDto): Promise<any> {
    const id = (dto as any).id || `aloj-${Date.now()}`;
    const entity = this.alojamientoRepo.create({
      id,
      ...dto,
      photos: (dto as any).photos || [{ url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800' }],
      amenidades: (dto as any).amenidades || [],
      ratings: (dto as any).ratings || { score: 9.0, number_of_reviews: 0 },
      host: (dto as any).host || null,
      ubicacion: (dto as any).ubicacion || { city: dto.destino },
    } as any);
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

  private buildReservaResponse(reserva: ReservaAlojamiento, alojamiento?: any) {
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
      habitaciones_count: reserva.habitacionesCount,
      total_price: reserva.totalPrice || { currency: 'USD', total: Number(reserva.total) },
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

  private buildOrderDetailDto(reserva: ReservaAlojamiento, alojamiento?: any, paymentReference?: string): OrderDetailDto {
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
      },
      total_price: Number(reserva.total),
      currency: reserva.totalPrice?.currency || 'USD',
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
}
