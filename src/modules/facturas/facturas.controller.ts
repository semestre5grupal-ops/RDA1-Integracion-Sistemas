import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FacturasService } from './facturas.service';
import { EnviarFacturaDto } from './dto/enviar-factura.dto';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { Rol } from '../../core/auth/roles.enum';
import { FacturasAdminService } from './facturas-admin.service';

@ApiTags('Facturas')
@ApiBearerAuth()
@Controller('facturas')
export class FacturasController {
  constructor(
    private readonly facturasService: FacturasService,
    private readonly facturasAdmin: FacturasAdminService,
  ) {}

  @Get()
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Listar facturas emitidas (Panel 5 · Consola Fiscal del administrador)' })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  @ApiQuery({ name: 'estado', required: false, enum: ['EMITIDA', 'PAGADA', 'ANULADA_POR_COMPENSACION'] })
  @ApiQuery({ name: 'q', required: false, description: 'Busca por número, cliente, cédula/RUC o email' })
  @ApiResponse({ status: 200, description: '{ items, total, totales }' })
  @ApiResponse({ status: 403, description: 'Requiere rol ADMIN' })
  @ApiResponse({ status: 503, description: 'Base de datos de facturación no disponible' })
  listar(@Query('limit') limit?: string, @Query('estado') estado?: string, @Query('q') q?: string) {
    return this.facturasAdmin.listar({ limit: Number(limit), estado, q });
  }

  @Post('enviar')
  @UseGuards(SupabaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar la factura en PDF al correo del usuario autenticado',
    description:
      'Recibe el PDF generado en el navegador codificado en Base64 y lo reenvia como adjunto por SMTP (Gmail). ' +
      'El destinatario es el `email` del token de Supabase; el cliente no puede elegirlo.',
  })
  @ApiResponse({ status: 200, description: 'Correo enviado con la factura en PDF adjunta.' })
  @ApiResponse({ status: 400, description: 'El Base64 recibido no es un PDF valido.' })
  @ApiResponse({ status: 401, description: 'Falta el token de Supabase o no es valido.' })
  @ApiResponse({ status: 502, description: 'El servidor SMTP rechazo el envio.' })
  @ApiResponse({ status: 503, description: 'El envio por correo no esta configurado en el servidor.' })
  async enviar(
    @Body() dto: EnviarFacturaDto,
    @Req() req: { user?: { email?: string } },
  ) {
    /**
     * El guard ya valido el token contra Supabase y dejo el usuario en `req.user`.
     * El `email` es de los datos firmados por Supabase, no lo elige el cliente, y
     * por eso no se valida con `@IsEmail`: si faltara, el problema es del proveedor
     * de identidad, no de esta peticion.
     */
    const destinatario = req.user?.email;
    if (!destinatario) {
      throw new HttpException(
        'El token de Supabase no trae un correo de destino.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.facturasService.enviarFactura(dto, destinatario);
  }
}
