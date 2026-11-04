import { Module } from '@nestjs/common';
import { ObservabilidadController } from './observabilidad.controller';
import { ObservabilidadService } from './observabilidad.service';
import { EsbModule } from '../esb/esb.module';
import { SecurityModule } from '../../core/security/security.module';

@Module({
  imports: [EsbModule, SecurityModule],
  controllers: [ObservabilidadController],
  providers: [ObservabilidadService],
  exports: [ObservabilidadService],
})
export class ObservabilidadModule {}
