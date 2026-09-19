import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AtraccionesService } from './atracciones.service';
import { AtraccionesController } from './atracciones.controller';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [CommonModule, HttpModule],
  controllers: [AtraccionesController],
  providers: [AtraccionesService],
})
export class AtraccionesModule {}
