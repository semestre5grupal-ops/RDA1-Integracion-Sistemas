import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';
import { FacturasAdminService } from './facturas-admin.service';
import { SecurityModule } from '../../core/security/security.module';
import { SupabaseAuthGuard } from '../../core/guards/supabase-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';

/**
 * Facturacion: envio de la factura en PDF por correo.
 *
 * No usa `TypeOrmModule.forFeature`. El PDF se genera en el NAVEGADOR con jsPDF y
 * llega aqui en Base64, asi que el backend no reconstruye la factura ni la
 * persiste: solo la reenvía como adjunto. La entidad `Factura` de
 * `core/entities` pertenece a la facturacion de Supabase (`FacturasPage`) y es otro
 * flujo, asi que no se mezcla con este.
 *
 * El transporte SMTP lo lee `FacturasService` de `ConfigService`, que es global
 * (`isGlobal: true` en `app.module.ts`); se importa `ConfigModule` solo para dejar
 * explicito de donde vienen las credenciales.
 */
@Module({
  imports: [ConfigModule, SecurityModule],
  controllers: [FacturasController],
  providers: [FacturasService, FacturasAdminService, SupabaseAuthGuard, RolesGuard],
})
export class FacturasModule {}
