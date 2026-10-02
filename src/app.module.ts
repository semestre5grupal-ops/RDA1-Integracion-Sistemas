import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { CommonModule } from './common/common.module';
import { CoreModule } from './core/core.module';
import { AlojamientosModule } from './modules/alojamientos/alojamientos.module';
import { AtraccionesModule } from './modules/atracciones/atracciones.module';
import { VuelosModule } from './modules/vuelos/vuelos.module';

@Module({
  imports: [
    // Carga de variables de entorno globales
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Configuración centralizada de TypeORM usando DATABASE_URL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL') || '';
        const isCloudDb = dbUrl.includes('supabase') || dbUrl.includes('render') || dbUrl.includes('neon') || dbUrl.includes('aws');
        return {
          type: 'postgres',
          url: dbUrl,
          autoLoadEntities: true,
          synchronize: configService.get<string>('NODE_ENV') !== 'production',
          ssl: isCloudDb || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
          extra: { max: 1 },
        };
      },
    }),

    // Módulos Compartidos
    CommonModule,

    // =========================================================================
    // Módulo Core del Integrador (Booking Prototipo)
    // =========================================================================
    CoreModule,
    
    // =========================================================================
    // Módulos de Integración (Tus endpoints BFF)
    // =========================================================================
    AtraccionesModule,
    VuelosModule,
    AlojamientosModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
