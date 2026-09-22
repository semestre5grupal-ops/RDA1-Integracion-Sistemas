import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchAtraccionesRequestDto } from './dto/search-atracciones.dto';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { ReservationRequestDto, CancelReservationRequestDto, ReservationStatus } from './dto/reservation.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { PagoService } from './pago.service';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class AtraccionesService {
  private readonly logger = new Logger(AtraccionesService.name);
  
  // URL placeholder hasta que los compañeros de Atracciones desplieguen su API
  private readonly EXTERNAL_API_URL = process.env.ATRACCIONES_API_URL || 'https://jsonplaceholder.typicode.com/posts';

  constructor(
    private readonly httpService: HttpService,
    private readonly pagoService: PagoService
  ) {}

  async search(dto: SearchAtraccionesRequestDto): Promise<any> {
    this.logger.log('Búsqueda avanzada de atracciones', dto);
    // Mock advanced search con next_page token
    return {
      data: [{
        id: 'PRahAzWtTraa',
        free_cancellation: true,
        price: { currency: 'EUR', total: 20 },
        url: { web: 'https://www.booking.com/attractions/nl/prahazwttraa' }
      }],
      metadata: { 
        total_results: 128,
        next_page: Buffer.from(JSON.stringify({ page: 2 })).toString('base64')
      },
      request_id: 'mock-req-id'
    };
  }

  async getDetailsBatch(dto: DetailsRequestDto): Promise<any> {
    this.logger.log(`Consultando batch details para ${dto.attractions.length} atracciones`);
    const data = dto.attractions.map(id => ({
      id,
      name: `Atracción ${id}`,
      categories: ['food_drinks'],
      duration: 'PT2H',
      badges: ['best_seller'],
      photos: [{ url: 'https://cf.bstatic.com/xdata/images/xphoto/500x375/170335205.jpg' }],
      locations: [{
        address: 'Centro, Ciudad',
        city: -2140479,
        country: 'nl',
        coordinates: { latitude: 52.36, longitude: 4.88 },
        type: 'attraction'
      }],
      long_description: `Descubre los detalles de ${id}.`,
      ratings: { number_of_reviews: 120, score: 4.8 },
      supported_languages: dto.languages || ['en-gb'],
      url: { web: `https://www.booking.com/attractions/${id}` }
    }));

    return {
      request_id: 'mock-batch-req',
      data
    };
  }

  async health(): Promise<any> {
    return { status: 'ok', service: 'Atracciones' };
  }

  async findAll(query: PaginationQueryDto): Promise<any> {
    this.logger.log(`Consultando API externa de Atracciones: ${this.EXTERNAL_API_URL}`);
    
    const { data } = await firstValueFrom(
      this.httpService.get(this.EXTERNAL_API_URL, { params: { _limit: query.limit, _page: query.page } }).pipe(
        catchError((error) => {
          this.logger.error('Error al contactar la API de Atracciones', error);
          throw new HttpException('El servicio de Atracciones no está disponible temporalmente.', HttpStatus.SERVICE_UNAVAILABLE);
        }),
      ),
    );
    
    // ** PATRÓN WRAPPER **
    // Aquí el BFF actúa como un Wrapper o Traductor.
    // Transforma una respuesta externa (ej. Legacy XML, SOAP, o un JSON mal formateado)
    // a un contrato REST/JSON unificado y limpio para el Frontend (Marketplace).
    return {
      data: data.map(item => ({
        id: item.id.toString(),
        name: item.title,
        long_description: item.body,
        duration: 'PT4H',
        price: { currency: 'USD', total: Math.floor(Math.random() * 50) + 10 },
        operator: { id: 1, name: 'Quito Tour Bus' },
        product_type: 'PACKAGE',
        includes: ['Transporte', 'Guía Bilingüe', 'Almuerzo'],
        categories: ['tour_guiado', 'cultural'],
        badges: ['best_seller'],
        locations: [{
          address: 'Centro Histórico, Quito',
          city: -924216,
          country: 'EC',
          coordinates: { latitude: -0.22985, longitude: -78.52495 },
          type: 'STARTING_POINT'
        }],
        photos: [{ url: 'https://via.placeholder.com/600x400?text=Tour+Quito' }],
        supported_languages: ['es', 'en'],
        free_cancellation: true,
        ratings: { number_of_reviews: 120, score: 4.8 },
        url: { web: `https://www.booking.com/attractions/ec/${item.id}`, app: `booking://attractions/product?slug=${item.id}` }
      })),
      meta: {
        total: 100, // Mock
        limit: query.limit || 10,
        page: query.page || 1
      }
    };
  }

  async create(dto: CreateAtraccionDto): Promise<any> {
    this.logger.log('Creando atracción mock');
    return { id: 'mock-uuid', ...dto };
  }

  async replace(id: string, dto: CreateAtraccionDto): Promise<void> {
    this.logger.log(`Reemplazando atracción ${id}`);
  }

  async update(id: string, dto: UpdateAtraccionDto): Promise<any> {
    this.logger.log(`Actualizando atracción ${id}`);
    return { id, ...dto };
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Eliminando atracción ${id}`);
  }

  async getAvailability(id: string, date: string): Promise<any> {
    this.logger.log(`Consultando disponibilidad para ${id} en ${date}`);
    return {
      date,
      available_spots: 15,
      times: ['10:00', '14:00']
    };
  }

  async findOne(id: string): Promise<any> {
    this.logger.log(`Consultando detalle de Atracción ID ${id}`);
    
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.EXTERNAL_API_URL}/${id}`).pipe(
        catchError((error) => {
          this.logger.error(`Error al buscar la atracción ${id}`, error);
          throw new HttpException('Atracción no encontrada o servicio caído.', HttpStatus.NOT_FOUND);
        }),
      ),
    );

    // ** PATRÓN WRAPPER **
    return {
      id: data.id.toString(),
      name: data.title,
      long_description: data.body,
      duration: 'PT4H',
      price: { currency: 'USD', total: Math.floor(Math.random() * 50) + 10 },
      operator: { id: 1, name: 'Quito Tour Bus' },
      product_type: 'PACKAGE',
      includes: ['Transporte', 'Guía Bilingüe', 'Almuerzo'],
      categories: ['tour_guiado', 'cultural'],
      badges: ['best_seller'],
      locations: [{
        address: 'Centro Histórico, Quito',
        city: -924216,
        country: 'EC',
        coordinates: { latitude: -0.22985, longitude: -78.52495 },
        type: 'STARTING_POINT'
      }],
      photos: [{ url: 'https://via.placeholder.com/600x400?text=Tour+Quito' }],
      supported_languages: ['es', 'en'],
      free_cancellation: true,
      ratings: { number_of_reviews: 120, score: 4.8 },
      url: { web: `https://www.booking.com/attractions/ec/${id}`, app: `booking://attractions/product?slug=${id}` }
    };
  }

  async reservar(id: string, dto: ReservationRequestDto, idempotencyKey: string): Promise<any> {
    this.logger.log(`Iniciando reserva síncrona para Atracción ${id} con idempotency key ${idempotencyKey}`);
    
    // 1. Verificar si la atracción existe
    const atraccion = await this.findOne(id);
    
    // 2. Transacción Síncrona: Llamar al PagoService (Pasarela) de forma bloqueante
    // Adaptamos el mock para usar total_price
    const pagoResult = await this.pagoService.procesarPago({ cantidadTickets: dto.ticket_count, metodoPago: 'TARJETA' });

    // 3. Generar Ticket de confirmación si el pago es exitoso
    return {
      reservation_id: `res-${pagoResult.transactionId}`,
      status: ReservationStatus.CONFIRMED,
      ticket_count: dto.ticket_count,
      total_price: { currency: 'USD', total: atraccion.price.total * dto.ticket_count },
      _links: {
        self: { href: `/api/v1/atracciones/${id}/reservations`, type: 'POST' },
        cancelar: { href: `/api/v1/atracciones/reservations/res-${pagoResult.transactionId}/cancel`, type: 'POST' },
        atraccion: { href: `/api/v1/atracciones/${id}`, type: 'GET' }
      }
    };
  }

  async cancelarReserva(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string): Promise<any> {
    this.logger.log(`Cancelando reserva ${reservationId} (razón: ${dto.reason}) con idempotency key ${idempotencyKey}`);
    
    return {
      reservation_id: reservationId,
      status: ReservationStatus.CANCELLED,
      ticket_count: 0, // mock
      total_price: { currency: 'USD', total: 0 }
    };
  }

  async getReservas(): Promise<any> {
    this.logger.log('Consultando historial de reservas del usuario');
    // Mock de historial de reservas
    return [
      {
        reservation_id: 'res-123',
        status: ReservationStatus.CONFIRMED,
        ticket_count: 2,
        total_price: { currency: 'USD', total: 45.0 }
      },
      {
        reservation_id: 'res-456',
        status: ReservationStatus.CANCELLED,
        ticket_count: 1,
        total_price: { currency: 'USD', total: 20.0 }
      }
    ];
  }

  async getReservaById(reservationId: string): Promise<any> {
    this.logger.log(`Consultando detalle de reserva ${reservationId}`);
    // Mock de detalle de reserva
    return {
      reservation_id: reservationId,
      status: ReservationStatus.CONFIRMED,
      ticket_count: 2,
      total_price: { currency: 'USD', total: 45.0 },
      _links: {
        self: { href: `/api/v1/atracciones/reservations/${reservationId}`, type: 'GET' },
        cancelar: { href: `/api/v1/atracciones/reservations/${reservationId}/cancel`, type: 'POST' }
      }
    };
  }
}
