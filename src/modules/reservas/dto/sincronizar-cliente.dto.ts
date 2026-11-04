import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SincronizarClienteDto {
  @ApiProperty({ description: 'ID del cliente en Booking Central (UUID o identificador local)' })
  @IsString()
  @IsNotEmpty()
  cliente_id: string;

  @ApiProperty({ description: 'Código del nodo del socio hacia el cual sincronizar (ej. NODE_AUT_RUTALIBRE, NODE_ATR_DILAN)' })
  @IsString()
  @IsNotEmpty()
  codigo_nodo: string;

  @ApiPropertyOptional({ description: 'Nombre completo del cliente' })
  @IsString()
  @IsOptional()
  nombre?: string;

  @ApiPropertyOptional({ description: 'Correo electrónico' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Cédula o Pasaporte' })
  @IsString()
  @IsOptional()
  identificacion?: string;

  @ApiPropertyOptional({ description: 'Teléfono de contacto' })
  @IsString()
  @IsOptional()
  telefono?: string;
}

