import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VuelosService } from './vuelos.service';
import { VuelosController } from './vuelos.controller';
import { CommonModule } from '../../common/common.module';
import { SupabaseOrquestadorService } from './supabase-orquestador.service';
import { ConfigProveedor } from '../nodes/entities/config-proveedor.entity';
import { VuelosSociosService } from './socios/vuelos-socios.service';
import { VuelosSociosMiddleware } from './socios/vuelos-socios.middleware';
import { VuelosSociosReservasService } from './socios/vuelos-socios-reservas.service';
import { PagosModule } from '../pagos/pagos.module';

import {
  // ── Bloque 1 · Catálogo e Inventario (3) ──
  Aerolinea,
  Vuelo,
  AsientoVuelo,
  // ── Bloque 2 · Ofertas y Tarifas (6) ──
  Oferta,
  OfertaItinerario,
  OfertaSegmento,
  TarifaCabina,
  TarifaEquipaje,
  TarifaPrecioPasajero,
  // ── Bloque 3 · Bloqueo de Cupos / Hold (2) ──
  BloqueoCupo,
  BloqueoItinerario,
  // ── Bloque 4 · Reservas (5) ──
  Reserva,
  ReservaItinerario,
  ReservaSegmento,
  Pasajero,
  AsientoAsignado,
  // ── Bloque 5 · Emisión: Boletos, Check-in, Pases (6) ──
  Boleto,
  BoletoSegmento,
  Checkin,
  CheckinPasajero,
  CheckinSegmento,
  PaseAbordar,
  // ── Bloque 6a · Postventa (5) ──
  EquipajePasajero,
  OfertaCambioFecha,
  OfertaCambioSegmento,
  CotizacionCancelacion,
  HistorialCambio,
  // ── Bloque 6b · Soporte: webhooks, idempotencia, rate limit, auditoría (8) ──
  SuscripcionWebhook,
  EventoWebhook,
  EntregaWebhook,
  Idempotencia,
  LimiteDispositivo,
  CodigoError,
  EventoError,
} from './entities';

/**
 * Las 35 entidades del esquema, agrupadas en el mismo orden de
 * `entities/index.ts` y de `vuelos_schema.sql`.
 *
 * ── Por qué las 35 y no solo las que usa `searchFlights` ─────────────────────
 *
 * `autoLoadEntities: true` (en `app.module.ts`) carga SOLO las entidades que
 * algún módulo registra explicitamente en `forFeature`. Al construir los metadatos
 * de una entidad, TypeORM recorre sus relaciones y exige que la entidad destino
 * también esté en el grafo de la conexión.
 *
 * `Vuelo` declara 5 relaciones: `aerolineaMarketing`, `aerolineaOperadora`,
 * `asientos`, `segmentosOferta` (→ `OfertaSegmento`) y `segmentosReserva`
 * (→ `ReservaSegmento`), entre otras. Registrar solo `[Vuelo, Aerolinea,
 * AsientoVuelo]` dejaba a `OfertaSegmento` y `ReservaSegmento` fuera del grafo, y
 * la aplicación NO arrancaba:
 *
 *   TypeORMError: Entity metadata for Vuelo#segmentosOferta was not found.
 *
 * Ese error sale en tiempo de ejecución, al inicializar el `DataSource`: ni
 * `tsc --noEmit` ni `npm run build` lo detectan, porque el decorador es válido y
 * la propiedad está bien escrita. Solo aparece al levantar la aplicación.
 *
 * Regla operativa: **toda entidad alcanzable por una relación desde una entidad
 * registrada debe registrarse también.** Añadir una `@OneToMany` nueva obliga a
 * revisar esta lista.
 *
 * NOTA: se importan desde el barrel `./entities` pero se listan una por una, sin
 * `...ENTIDADES`, porque el barrel también exporta `vuelos.enums` y
 * `numeric.transformer`, que no son entidades y romperían el grafo de TypeORM.
 */
const ENTIDADES = [
  // Bloque 1 · Catálogo e Inventario
  Aerolinea,
  Vuelo,
  AsientoVuelo,
  // Bloque 2 · Ofertas y Tarifas
  Oferta,
  OfertaItinerario,
  OfertaSegmento,
  TarifaCabina,
  TarifaEquipaje,
  TarifaPrecioPasajero,
  // Bloque 3 · Bloqueo de Cupos (Hold)
  BloqueoCupo,
  BloqueoItinerario,  // Bloque 4 · Reservas
  Reserva,
  ReservaItinerario,
  ReservaSegmento,
  Pasajero,
  AsientoAsignado,
  // Bloque 5 · Emisión
  Boleto,
  BoletoSegmento,
  Checkin,
  CheckinPasajero,
  CheckinSegmento,
  PaseAbordar,
  // Bloque 6a · Postventa
  EquipajePasajero,
  OfertaCambioFecha,
  OfertaCambioSegmento,
  CotizacionCancelacion,
  HistorialCambio,
  // Bloque 6b · Soporte
  SuscripcionWebhook,
  EventoWebhook,
  EntregaWebhook,
  Idempotencia,
  LimiteDispositivo,
  CodigoError,
  EventoError,
];

import { VuelosTrazaPersistencia } from './socios/vuelos-traza-persistencia';

@Module({
  imports: [CommonModule, PagosModule, TypeOrmModule.forFeature([...ENTIDADES, ConfigProveedor])],
  controllers: [VuelosController],
  providers: [VuelosService, SupabaseOrquestadorService, VuelosSociosService, VuelosSociosReservasService, VuelosSociosMiddleware, VuelosTrazaPersistencia],
  exports: [SupabaseOrquestadorService, VuelosSociosService, VuelosSociosMiddleware],
})
export class VuelosModule {}
