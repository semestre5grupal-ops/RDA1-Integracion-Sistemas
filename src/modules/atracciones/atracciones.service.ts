import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchAtraccionesRequestDto } from './dto/search-atracciones.dto';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { ReservationRequestDto, CancelReservationRequestDto, ReservationStatus } from './dto/reservation.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { PagoService } from './pago.service';
import { catchError, firstValueFrom } from 'rxjs';
import { Atraccion } from './entities/atraccion.entity';
import { ReservaAtraccion } from './entities/reserva.entity';

@Injectable()
export class AtraccionesService {
  private readonly logger = new Logger(AtraccionesService.name);
  
  // URL placeholder hasta que los compañeros de Atracciones desplieguen su API
  private readonly EXTERNAL_API_URL = process.env.ATRACCIONES_API_URL || 'https://jsonplaceholder.typicode.com/posts';

  constructor(
    private readonly httpService: HttpService,
    private readonly pagoService: PagoService,
    @InjectRepository(Atraccion)
    private readonly atraccionRepo: Repository<Atraccion>,
    @InjectRepository(ReservaAtraccion)
    private readonly reservaRepo: Repository<ReservaAtraccion>
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
    this.logger.log(`Consultando API externa de Atracciones y base local`);
    
    // 1. Catálogo Externo
    let externalData = [];
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(this.EXTERNAL_API_URL, { params: { _limit: query.limit, _page: query.page } })
      );
      externalData = data.map(item => ({
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
      }));
    } catch(err) {
      this.logger.warn('Error al contactar la API externa de Atracciones, mostrando solo locales', err.message);
    }

    // 2. Catálogo Local
    const locales = await this.atraccionRepo.find({
      take: query.limit || 10,
      skip: ((query.page || 1) - 1) * (query.limit || 10)
    });
    
    const localData = locales.map(l => ({
      ...l,
      url: { web: `/atracciones/${l.id}` }
    }));

    return {
      data: [...localData, ...externalData],
      meta: {
        total: localData.length + externalData.length,
        limit: query.limit || 10,
        page: query.page || 1
      }
    };
  }

  async create(dto: CreateAtraccionDto): Promise<any> {
    this.logger.log('Creando atracción en base de datos local');
    const newAtraccion = this.atraccionRepo.create(dto);
    return this.atraccionRepo.save(newAtraccion);
  }

  async replace(id: string, dto: CreateAtraccionDto): Promise<void> {
    this.logger.log(`Reemplazando atracción local ${id}`);
    const atraccion = await this.atraccionRepo.findOneBy({ id });
    if (!atraccion) throw new HttpException('Atracción no encontrada', HttpStatus.NOT_FOUND);
    
    await this.atraccionRepo.save({ ...atraccion, ...dto });
  }

  async update(id: string, dto: UpdateAtraccionDto): Promise<any> {
    this.logger.log(`Actualizando atracción local ${id}`);
    const atraccion = await this.atraccionRepo.findOneBy({ id });
    if (!atraccion) throw new HttpException('Atracción no encontrada', HttpStatus.NOT_FOUND);
    
    Object.assign(atraccion, dto);
    return this.atraccionRepo.save(atraccion);
  }

  async delete(id: string): Promise<void> {
    this.logger.log(`Eliminando atracción local ${id}`);
    const atraccion = await this.atraccionRepo.findOneBy({ id });
    if (!atraccion) throw new HttpException('Atracción no encontrada', HttpStatus.NOT_FOUND);
    await this.atraccionRepo.remove(atraccion);
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
    
    // Buscar primero en local
    let isUuid = id.length === 36; // quick check
    if (isUuid) {
       const local = await this.atraccionRepo.findOneBy({ id });
       if (local) {
         return {
            ...local,
            url: { web: `/atracciones/${local.id}` }
         };
       }
    }

    // Buscar externo
    try {
      const { data } = await firstValueFrom(this.httpService.get(`${this.EXTERNAL_API_URL}/${id}`));
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
    } catch(err) {
      throw new HttpException('Atracción no encontrada', HttpStatus.NOT_FOUND);
    }
  }

  async reservar(id: string, dto: ReservationRequestDto, idempotencyKey: string): Promise<any> {
    this.logger.log(`Iniciando reserva síncrona para Atracción ${id} con idempotency key ${idempotencyKey}`);
    
    // Verificación de Idempotencia
    const existing = await this.reservaRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      if (existing.status === ReservationStatus.CONFIRMED) {
         throw new HttpException('Conflicto de Idempotencia: Reserva ya procesada.', HttpStatus.CONFLICT);
      }
      return this.buildReservaResponse(existing);
    }

    const atraccion = await this.findOne(id);
    const totalPrice = atraccion.price?.total ? atraccion.price.total * dto.ticket_count : 50 * dto.ticket_count;
    
    // Crear reserva como PENDING
    let reserva = this.reservaRepo.create({
      atraccionId: id,
      idempotencyKey,
      status: ReservationStatus.PENDING,
      ticketCount: dto.ticket_count,
      totalPrice: { currency: 'USD', total: totalPrice },
      customerName: dto.customer_name,
      customerEmail: dto.customer_email || 'no-email@example.com',
      date: dto.date,
      time: dto.time || '10:00'
    });
    reserva = await this.reservaRepo.save(reserva);

    // Pago Síncrono
    const pagoResult = await this.pagoService.procesarPago({ cantidadTickets: dto.ticket_count, metodoPago: 'TARJETA' });

    // Confirmar
    reserva.status = ReservationStatus.CONFIRMED;
    await this.reservaRepo.save(reserva);

    return this.buildReservaResponse(reserva);
  }

  async cancelarReserva(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string): Promise<any> {
    this.logger.log(`Cancelando reserva ${reservationId} (razón: ${dto.reason}) con idempotency key ${idempotencyKey}`);
    
    const reserva = await this.reservaRepo.findOneBy({ id: reservationId });
    if (!reserva) throw new HttpException('Reserva no encontrada', HttpStatus.NOT_FOUND);
    
    if (reserva.status === ReservationStatus.CANCELLED) {
      return this.buildReservaResponse(reserva); // idempotente
    }

    reserva.status = ReservationStatus.CANCELLED;
    await this.reservaRepo.save(reserva);

    return this.buildReservaResponse(reserva);
  }

  async getReservas(): Promise<any> {
    this.logger.log('Consultando historial de reservas del usuario (local DB)');
    const reservas = await this.reservaRepo.find();
    return reservas.map(r => this.buildReservaResponse(r));
  }

  async getReservaById(reservationId: string): Promise<any> {
    this.logger.log(`Consultando detalle de reserva ${reservationId}`);
    const reserva = await this.reservaRepo.findOneBy({ id: reservationId });
    if (!reserva) throw new HttpException('Reserva no encontrada', HttpStatus.NOT_FOUND);
    return this.buildReservaResponse(reserva);
  }

  private buildReservaResponse(reserva: ReservaAtraccion) {
    return {
      reservation_id: reserva.id,
      status: reserva.status,
      ticket_count: reserva.ticketCount,
      total_price: reserva.totalPrice,
      _links: {
        self: { href: `/api/v1/atracciones/reservations/${reserva.id}`, type: 'GET' },
        cancelar: { href: `/api/v1/atracciones/reservations/${reserva.id}/cancel`, type: 'POST' },
        atraccion: { href: `/api/v1/atracciones/${reserva.atraccionId}`, type: 'GET' }
      }
    };
  }
}
