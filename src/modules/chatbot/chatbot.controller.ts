import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { CacheInterceptor } from '@nestjs/cache-manager';

import { ChatbotService } from './chatbot.service';
import { MensajeChatDto, RespuestaChatDto } from './dto/chat-mensaje.dto';
import { RESPUESTA_SOLO_LECTURA } from './chatbot.prompt';
import { ChatbotRateLimitGuard } from './chatbot-rate-limit.guard';

/**
 * API del chatbot informativo.
 *
 * Montada con el prefijo global `api/v1` (ver `main.ts`), las rutas completas son
 * `/api/v1/chatbot/*`.
 *
 * ── Por qué NO lleva `@UseGuards(SupabaseAuthGuard)` ────────────────────────
 * El bot es un componente global presente en todas las pantallas, incluidas las
 * públicas (catálogo, login, registro). Si exigiera sesión, desaparecería justo
 * donde más lo necesita un visitante que todavía no ha iniciado sesión.
 *
 * Sin sesión NO se pierde nada en cuanto a datos: todas las herramientas que
 * expone son de lectura sobre catálogos y disponibilidad. Lo que sí se protege es
 * el consumo de Groq, que es un recurso de pago, y eso se hace en
 * `ChatbotConversationStore` (TTL de 60 min y tope de 500 sesiones) y en el
 * `ValidationPipe` global, que rechaza cuerpos con campos no declarados.
 *
 * ── Por qué no expone endpoints de escritura ────────────────────────────────
 * El único `DELETE` es borrar el historial de una sesión, que no toca la base de
 * datos: es memoria del proceso. No hay ninguna ruta que reserve, pague ni
 * cancele, y esa es exactamente la frontera del módulo.
 */
@ApiTags('Chatbot (informativo, solo lectura)')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  /**
   * `POST /api/v1/chatbot/mensaje` — envía un mensaje y recibe la respuesta.
   *
   * `HttpCode(200)`: en NestJS un `POST` devuelve 201 por defecto, y 201 es lo
   * correcto para un recurso NUEVO. Aquí no se crea nada: el recurso (la
   * conversación) ya existe y lo que se hace es un turno más. Un 201 haría
   * pensar al cliente que se creó algo.
   */
  @Post('mensaje')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ChatbotRateLimitGuard)
  @ApiOperation({
    summary: 'Enviar un mensaje al chatbot y recibir su respuesta',
    description:
      'Orquesta el bucle de tool-calling contra Groq: el modelo detecta los ' +
      'filtros (fechas, ciudades, personas), llama a las herramientas de solo ' +
      'lectura sobre la API de datos y redacta la respuesta en lenguaje natural. ' +
      'Devuelve también la traza de herramientas ejecutadas, para poder auditar ' +
      'de dónde salió cada dato.',
  })
  @ApiResponse({ status: 200, description: 'Respuesta del bot', type: RespuestaChatDto })
  @ApiResponse({ status: 400, description: 'Mensaje vacío o con formato inválido' })
  @ApiResponse({ status: 429, description: 'Límite de solicitudes excedido.' })
  @ApiResponse({ status: 503, description: 'Chatbot deshabilitado (falta GROQ_API_KEY) o Groq no disponible' })
  async enviar(@Body() dto: MensajeChatDto): Promise<RespuestaChatDto> {
    return this.chatbotService.responder(dto);
  }

  /**
   * `POST /api/v1/chatbot/nueva-conversacion` — empieza de cero.
   *
   * Es un `POST` y no un `DELETE` porque para el cliente la acción es "crear una
   * conversación nueva", no "destruir un recurso con un id que puede no
   * importarle". El cuerpo lleva la sesión a borrar y la respuesta trae el mismo
   * `sessionId` (se reutiliza en vez de generar otro), para que el frontend no
   * tenga que distinguir el caso de "sesión nueva" del de "conversación
   * reiniciada".
   */
  @Post('nueva-conversacion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reiniciar el historial de la conversación',
    description:
      'Borra el historial en memoria del servidor y empieza de cero. No toca la ' +
      'base de datos: es estado de sesión.',
  })
  nuevaConversacion(@Body() dto: { sessionId?: string }): {
    sessionId: string;
    mensaje: string;
    alcance: string;
  } {
    const sessionId = dto?.sessionId;
    if (sessionId) this.chatbotService.reiniciar(sessionId);

    return {
      sessionId: sessionId ?? null,
      mensaje: 'Conversación reiniciada.',
      alcance: RESPUESTA_SOLO_LECTURA,
    };
  }

  /**
   * `GET /api/v1/chatbot/estado` — diagnóstico.
   *
   * Devuelve si el módulo está operativo, qué herramientas tiene y cuántas
   * conversaciones hay vivas. Existe para dos cosas concretas: confirmar durante
   * la demostración que `GROQ_API_KEY` se leyó bien (si no, `disponible` es
   * `false` con el motivo), y depurar un "no responde" sin tener que leer logs.
   *
   * Devuelve `200` incluso cuando está deshabilitado: un diagnóstico que
   * fallara no podría diagnosticar. El `disponible: false` es la información.
   *
   * Cacheado 5 s con `CacheInterceptor`: es de solo lectura y su respuesta no
   * cambia entre peticiones consecutivas, así que no tiene sentido ir a Groq ni
   * recorrer el mapa de sesiones cada vez que se consulta.
   */
  @Get('estado')
  @UseInterceptors(CacheInterceptor)
  @ApiOperation({
    summary: 'Estado del chatbot (diagnóstico)',
    description:
      'Informa si hay credencial de Groq configurada, qué herramientas de solo ' +
      'lectura expone y cuántas conversaciones están activas en memoria.',
  })
  @ApiResponse({ status: 200, description: 'Estado del módulo' })
  estado() {
    return {
      ...this.chatbotService.estado(),
      alcance:
        'Solo informativo. El bot consulta disponibilidad de vuelos, autos y atracciones; ' +
        'no crea reservas, no procesa pagos y no modifica datos.',
    };
  }

  /**
   * `GET /api/v1/chatbot/alcance` — qué puede y qué no puede hacer.
   *
   * Endpoint público y estático, sin llamadas a Groq. El frontend lo usa como
   * fuente de verdad del mensaje de bienvenida, en vez de duplicar el texto en el
   * componente: si el alcance del bot cambia, cambia en un solo sitio.
   */
  @Get('alcance')
  @ApiOperation({
    summary: 'Alcance y límites del chatbot',
    description:
      'Devuelve, en texto, qué consultas puede atender el bot y cuáles no. ' +
      'El frontend lo usa para el mensaje de bienvenida y los avisos.',
  })
  alcance() {
    return {
      puede: [
        'Consultar vuelos disponibles por ruta, fecha y número de pasajeros',
        'Consultar el estado operativo de un vuelo por su número y fecha',
        'Consultar el catálogo de autos de alquiler, con características y precio',
        'Consultar atracciones y tours disponibles por ciudad y fecha',
        'Consultar los cupos y horarios de una atracción concreta',
      ],
      no_puede: [
        'Crear reservas u órdenes de alquiler',
        'Procesar pagos o emitir boletos',
        'Hacer check-in o cancelar reservas',
        'Consultar o modificar datos personales o reservas de un usuario',
      ],
      mensaje_limite: RESPUESTA_SOLO_LECTURA,
      sugerencia_reserva:
        'Para reservar, usa los buscadores de la web: el bot informa, la web transactúa.',
    };
  }
}