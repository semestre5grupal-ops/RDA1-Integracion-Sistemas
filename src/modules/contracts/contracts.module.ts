import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';

@Module({
  controllers: [ContractsController],
})
export class ContractsModule {}
