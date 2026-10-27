import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatbotToolsExecutorService } from './chatbot.tools-executor.service';
import { ChatbotConversationStore } from './chatbot.conversation.store';
import { ChatbotConcurrencyGate } from './chatbot.concurrency';
import { GroqService } from './groq.service';
import { CoreModule } from '../../core/core.module';
import { ChatbotRateLimitGuard } from './chatbot-rate-limit.guard';

/**
 * Módulo del chatbot informativo.
 *
 * ── Dependencias ────────────────────────────────────────────────────────────
 *
 * · `ConfigModule`: global en `AppModule`, así que `ConfigService` está
 *   disponible sin volver a importarlo. De ahí salen `GROQ_API_KEY`,
 *   `GROQ_MODEL` y `CHATBOT_API_BASE_URL`.
 *
 * · `CacheModule.register({ ttl: 5 })`: `CacheInterceptor` en `@nestjs/cache-manager`
 *   necesita un `CacheModule` registrado en el MIS módulo donde se usa el
 *   interceptor. `AppModule` no lo importa (los módulos de vuelos, autos y
 *   atracciones lo hacen por su cuenta), y registrarlo aquí a menor ttl no estorba
 *   a los demás: solo afecta a este módulo. Se importa a 5 s —el único endpoint
 *   cacheado es `estado`, que no cambia— en vez del default de 300 s, porque un
 *   diagnóstico que dice "no disponible" durante cinco minutos después de
 *   arreglar la variable de entorno es un diagnóstico inútil.
 *
 * ── Lo que el módulo NO importa, y por qué ─────────────────────────────────
 *
 * No importa `VuelosModule`, `AutosModule` ni `AtraccionesModule` a propósito.
 * El bot consume la API REST por HTTP (ver `chatbot.tools-executor.service.ts`),
 * igual que lo haría cualquier integrador externo. Es una decisión deliberada:
 *
 * · reproduce la condición real de uso, donde el bot es un cliente más de la API
 *   y no tiene accesoprivileged al TypeORM;
 * · evita acoplar el chatbot a entidades concretas: si `Auto` cambia de tabla,
 *   este módulo no se entera;
 * · permite apuntar `CHATBOT_API_BASE_URL` a una URL externa sin tocar código,
 *   que es lo que hace falta cuando el bot se despliegue por separado.
 *
 * El coste es una llamada HTTP extra dentro del propio proceso. Medido en el
 * laboratorio de Ecuador no es relevante frente a la llamada a Groq, que es
 * orden de magnitud más lenta.
 */
@Module({
  imports: [CacheModule.register({ ttl: 5 }), CoreModule],
  controllers: [ChatbotController],
  providers: [
    ChatbotService,
    GroqService,
    ChatbotToolsExecutorService,
    ChatbotConversationStore,
    ChatbotConcurrencyGate,
    ChatbotRateLimitGuard,
  ],
  exports: [ChatbotService],
})
export class ChatbotModule {}