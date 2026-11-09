import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class MergeClientesDto {
  @ApiProperty({ description: 'ID del cliente secundario que será fusionado y archivado', example: 'd3b07384-d113-4a44-935f-141a052ff698' })
  @IsString()
  @IsNotEmpty()
  cliente_id_origen: string;

  @ApiProperty({ description: 'ID del cliente canónico principal que conservará los datos unificados', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @IsString()
  @IsNotEmpty()
  cliente_id_destino: string;

  @ApiProperty({ description: 'Motivo o justificación de la unificación', example: 'Cuentas duplicadas con misma cédula pero emails distintos' })
  @IsString()
  @IsNotEmpty()
  motivo: string;

  @ApiPropertyOptional({ description: 'Si es true, sólo simula el merge y devuelve los registros que cambiarían sin alterar la BD', default: false })
  @IsBoolean()
  @IsOptional()
  dry_run?: boolean;

  @ApiPropertyOptional({ description: 'Código del nodo socio si la petición proviene de una integración M2M', example: 'NODE_ATR_GLORIA' })
  @IsString()
  @IsOptional()
  codigo_nodo?: string;
}

export class ValidarIdentificacionDto {
  @ApiProperty({ description: 'Número de cédula o pasaporte', example: '1710034065' })
  @IsString()
  @IsNotEmpty()
  identificacion: string;

  @ApiProperty({ description: 'Tipo de documento', enum: ['CEDULA', 'PASAPORTE'], default: 'CEDULA' })
  @IsString()
  @IsOptional()
  tipo?: 'CEDULA' | 'PASAPORTE';
}

