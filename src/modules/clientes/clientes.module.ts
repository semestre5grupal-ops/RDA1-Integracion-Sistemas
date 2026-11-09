import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ClientesController } from './clientes.controller';
import { CustomerMergeService } from './customer-merge.service';
import { Usuario } from '../../core/entities/usuario.entity';
import { ClienteSocioMapeo } from '../../core/entities/cliente-socio-mapeo.entity';
import { CoreModule } from '../../core/core.module';
import { EventBusModule } from '../event-bus/event-bus.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, ClienteSocioMapeo]),
    HttpModule,
    CoreModule,
    EventBusModule,
  ],
  controllers: [ClientesController],
  providers: [CustomerMergeService],
  exports: [CustomerMergeService],
})
export class ClientesModule {}

