import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Version,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Roles } from '../../core/decorators/roles.decorator';
import { RolesGuard } from '../../core/guards/roles.guard';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { ListWebhookDeliveriesDto } from './dto/list-webhook-deliveries.dto';
import { WebhooksRateLimitGuard } from './webhooks-rate-limit.guard';
import { WebhooksService } from './webhooks.service';

type RequestWithRawBody = Request & { rawBody?: Buffer };

@ApiTags('Receptor Inbound de Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':vertical')
  @Version('2')
  @UseGuards(WebhooksRateLimitGuard)
  @ApiOperation({ summary: 'Recibir CloudEvent firmado y encolarlo para procesamiento asíncrono' })
  @ApiResponse({ status: 202, description: 'Evento autenticado y encolado.' })
  @ApiResponse({ status: 200, description: 'Evento duplicado; no se publica de nuevo.' })
  receive(
    @Param('vertical') vertical: string,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
    @Req() request: RequestWithRawBody,
    @Res() response: Response,
  ) {
    return this.webhooksService
      .receive(vertical, request.rawBody, signature, body, contentType)
      .then(({ replayed, ...result }) => {
        if (replayed) response.setHeader('Idempotent-Replayed', 'true');
        return response.status(replayed ? HttpStatus.OK : HttpStatus.ACCEPTED).json(result);
      });
  }

  @Get(':vertical/entregas')
  @Version('2')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiSecurity('bearer')
  @ApiOperation({ summary: 'Consultar historial paginado de entregas de webhooks (ADMIN)' })
  @ApiResponse({ status: 200, description: 'Entregas paginadas de la vertical solicitada.' })
  listDeliveries(
    @Param('vertical') vertical: string,
    @Query() query: ListWebhookDeliveriesDto,
  ) {
    return this.webhooksService.listDeliveries(vertical, query);
  }
}
