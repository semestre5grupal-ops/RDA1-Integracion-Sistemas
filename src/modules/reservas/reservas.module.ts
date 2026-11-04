import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';
import { ClienteSocioMapeo } from '../../core/entities/cliente-socio-mapeo.entity';
import { Usuario } from '../../core/entities/usuario.entity';
import { CoreModule } from '../../core/core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClienteSocioMapeo, Usuario]),
    HttpModule,
    CoreModule,
  ],
  controllers: [ReservasController],
  providers: [ReservasService],
  exports: [ReservasService],
})
export class ReservasModule {}

