import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { catchError, firstValueFrom } from 'rxjs';

@Injectable()
export class AtraccionesService {
  private readonly logger = new Logger(AtraccionesService.name);
  
  // URL placeholder hasta que los compañeros de Atracciones desplieguen su API
  private readonly EXTERNAL_API_URL = process.env.ATRACCIONES_API_URL || 'https://jsonplaceholder.typicode.com/posts'; // Usando jsonplaceholder como mock temporal

  constructor(private readonly httpService: HttpService) {}

  async findAll(query: PaginationQueryDto): Promise<any> {
    this.logger.log(`Consultando API externa de Atracciones: ${this.EXTERNAL_API_URL}`);
    
    // Aquí podemos mapear el query local a los parámetros que espera la API externa
    const { data } = await firstValueFrom(
      this.httpService.get(this.EXTERNAL_API_URL, { params: { _limit: query.limit, _page: query.page } }).pipe(
        catchError((error) => {
          this.logger.error('Error al contactar la API de Atracciones', error);
          throw new HttpException('El servicio de Atracciones no está disponible temporalmente.', HttpStatus.SERVICE_UNAVAILABLE);
        }),
      ),
    );
    
    // Mapeo de respuesta mockeada (adaptaremos esto cuando sepamos el contrato real)
    return {
      data: data.map(item => ({
        id: item.id.toString(),
        nombre: item.title,
        descripcion: item.body,
        precio_unitario: Math.floor(Math.random() * 50) + 10, // Mock price
        tipo_producto: 'atraccion'
      })),
      meta: {
        total: 100, // Mock
        limit: query.limit || 10,
        page: query.page || 1
      }
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

    return {
      id: data.id.toString(),
      nombre: data.title,
      descripcion: data.body,
      precio_unitario: Math.floor(Math.random() * 50) + 10,
      tipo_producto: 'atraccion'
    };
  }
}
