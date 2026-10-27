import { Module, Global } from '@nestjs/common';
import { RabbitMqEventBusService } from './rabbitmq/rabbitmq-event-bus.service';
import { KafkaEventBusService } from './kafka/kafka-event-bus.service';
import { KafkaRabbitBridgeService } from './bridge/kafka-rabbit-bridge.service';
import { EventConsumerIdempotencyService } from './consumer/event-consumer-idempotency.service';
import { RabbitMqConsumerService } from './consumer/rabbitmq-consumer.service';
import { CoreModule } from '../../core/core.module';
import { WinstonPhysicalLoggerService } from '../../core/logger/winston-logger.service';

@Global()
@Module({
  imports: [CoreModule],
  providers: [
    RabbitMqEventBusService,
    KafkaEventBusService,
    KafkaRabbitBridgeService,
    EventConsumerIdempotencyService,
    RabbitMqConsumerService,
    WinstonPhysicalLoggerService,
  ],
  exports: [
    RabbitMqEventBusService,
    KafkaEventBusService,
    KafkaRabbitBridgeService,
    EventConsumerIdempotencyService,
    RabbitMqConsumerService,
    WinstonPhysicalLoggerService,
  ],
})
export class EventBusModule {}
