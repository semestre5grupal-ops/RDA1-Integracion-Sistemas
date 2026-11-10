import { Module } from '@nestjs/common';
import { ServiceMeshService } from './service-mesh.service';
import { ServiceMeshController } from './service-mesh.controller';
import { SidecarProxyInterceptor } from './interceptors/sidecar-proxy.interceptor';

@Module({
  controllers: [ServiceMeshController],
  providers: [ServiceMeshService, SidecarProxyInterceptor],
  exports: [ServiceMeshService, SidecarProxyInterceptor],
})
export class ServiceMeshModule {}

