import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { catchError, firstValueFrom } from 'rxjs';
import { Auto } from './entities/auto.entity';
import { OrderAuto } from './entities/order-auto.entity';
import { PagoService } from '../atracciones/pago.service';

@Injectable()
export class AutosService {
  private readonly logger = new Logger(AutosService.name);
  private readonly EXTERNAL_API_URL = process.env.AUTOS_API_URL || 'https://jsonplaceholder.typicode.com/posts'; // Mock para autos externos

  constructor(
    private readonly httpService: HttpService,
    private readonly pagoService: PagoService,
    @InjectRepository(Auto)
    private readonly autoRepo: Repository<Auto>,
    @InjectRepository(OrderAuto)
    private readonly orderRepo: Repository<OrderAuto>
  ) {}

  async search(dto: any): Promise<any> {
    this.logger.log('Búsqueda avanzada de rentas de autos (Híbrido)', dto);
    
    // 1. Obtener de DB Local
    const locales = await this.autoRepo.find({ where: { available: true } });
    const formattedLocales = locales.map(l => ({
      vehicle_id: l.id,
      price: parseFloat(l.price as any),
      supplier_id: 1, // 1 = Local Supplier
      vehicle_info: l.vehicle_info,
      images: l.images
    }));

    // 2. Obtener de Servicio Externo (Mock)
    let externalData = [];
    try {
      const { data } = await firstValueFrom(
        this.httpService.get(this.EXTERNAL_API_URL, { params: { _limit: 5 } })
      );
      externalData = data.map(item => ({
        vehicle_id: item.id.toString(),
        price: 35.50,
        supplier_id: 2, // 2 = Hertz Mock
        vehicle_info: {
          category: 'COMPACT',
          type: 'SEDAN',
          transmission: 'AUTOMATIC',
          fuel: 'PETROL',
          doors: 4,
          seats: 5
        },
        images: ['https://via.placeholder.com/300x150?text=Auto+Mock']
      }));
    } catch(err) {
      this.logger.warn('No se pudo conectar a la API externa de Autos');
    }

    const merged = [...formattedLocales, ...externalData];

    return {
      request_id: 'req-autos-123',
      data: merged,
      metadata: { total_results: merged.length },
      search_token: 'tok-search-abc'
    };
  }

  async getDepots(): Promise<any> {
    this.logger.log('Consultando Agencias (Catálogo estático)');
    return {
      depots: [
        { depot_id: 1, name: 'Quito Airport', location: { city_id: -924216 } },
        { depot_id: 2, name: 'Guayaquil Airport', location: { city_id: -924190 } }
      ]
    };
  }

  async getConstants(): Promise<any> {
    return {
      fuel_policies: [{ id: 'FULL_TO_FULL', description: 'Tanque Lleno' }],
      transmissions: [{ id: 'AUTOMATIC', description: 'Automático' }, { id: 'MANUAL', description: 'Manual' }]
    };
  }

  async getSuppliers(): Promise<any> {
    return {
      suppliers: [
        { id: 1, name: 'Local GDS Autos', rating: 4.8 },
        { id: 2, name: 'Hertz', rating: 4.5 }
      ]
    };
  }

  async createOrder(orderData: any, idempotencyKey: string): Promise<any> {
    this.logger.log(`Creando reserva de Auto con Idempotency-Key: ${idempotencyKey}`);

    // Idempotencia
    const existing = await this.orderRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      if (existing.status === 'CONFIRMED') {
         throw new HttpException('Conflicto de Idempotencia: Reserva ya procesada.', HttpStatus.CONFLICT);
      }
      return this.buildOrderResponse(existing);
    }

    // Cálculo y guardado de reserva PENDING
    const autoId = orderData.vehicle_id || 'dummy-auto-id';
    const dias = orderData.dias || 3;
    
    // Si viene de local, usar el precio real, sino usar un mock
    let precioDiario = 35.50;
    const isUuid = autoId.length === 36;
    if (isUuid) {
       const local = await this.autoRepo.findOneBy({ id: autoId });
       if (local) precioDiario = parseFloat(local.price as any);
    }
    const total = precioDiario * dias;

    let order = this.orderRepo.create({
      autoId,
      idempotencyKey,
      status: 'PENDING',
      diasRenta: dias,
      totalPrice: { currency: 'USD', total },
      booker: orderData.booker || { country: 'EC', name: 'User' },
      driver: orderData.driver || { age: 30 },
      route: orderData.route || {}
    });
    order = await this.orderRepo.save(order);

    // Pago Síncrono
    await this.pagoService.procesarPago({ cantidadTickets: 1, metodoPago: 'TARJETA' });

    // Confirmar
    order.status = 'CONFIRMED';
    await this.orderRepo.save(order);

    return this.buildOrderResponse(order);
  }

  async getOrders(): Promise<any> {
    const orders = await this.orderRepo.find();
    return orders.map(o => this.buildOrderResponse(o));
  }

  async getOrderById(orderId: string): Promise<any> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new HttpException('Orden no encontrada', HttpStatus.NOT_FOUND);
    return this.buildOrderResponse(order);
  }

  async cancelOrder(orderId: string, cancelData: any, idempotencyKey: string): Promise<any> {
    this.logger.log(`Cancelando reserva ${orderId} (razón: ${cancelData.reason}) con idempotency key ${idempotencyKey}`);
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new HttpException('Orden no encontrada', HttpStatus.NOT_FOUND);
    
    if (order.status === 'CANCELLED') {
      return this.buildOrderResponse(order);
    }

    order.status = 'CANCELLED';
    await this.orderRepo.save(order);
    return this.buildOrderResponse(order);
  }

  async createAutoLocal(autoData: any): Promise<any> {
    const auto = this.autoRepo.create({
       supplier_name: autoData.supplier_name || 'GDS Local',
       price: autoData.price,
       vehicle_info: autoData.vehicle_info || { category: 'SUV', transmission: 'AUTOMATIC' },
       images: autoData.images || ['https://via.placeholder.com/300x150?text=SUV'],
       available: true
    });
    return this.autoRepo.save(auto);
  }

  async deleteAutoLocal(id: string): Promise<void> {
    const auto = await this.autoRepo.findOneBy({ id });
    if (!auto) throw new HttpException('Auto local no encontrado', HttpStatus.NOT_FOUND);
    await this.autoRepo.remove(auto);
  }

  private buildOrderResponse(order: OrderAuto) {
    return {
      order_id: order.id,
      status: order.status,
      auto_id: order.autoId,
      total_price: order.totalPrice,
      dias_renta: order.diasRenta,
      _links: {
        self: { href: `/api/v1/autos/orders/${order.id}`, type: 'GET' },
        cancelar: { href: `/api/v1/autos/orders/${order.id}/cancel`, type: 'POST' }
      }
    };
  }
}
