import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { Rfc7807ExceptionFilter } from './core/filters/rfc7807-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilita CORS para que el frontend en localhost:5173 pueda llamar al backend
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:4173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Registrar el filtro global de excepciones para cumplir con la RFC 7807
  app.useGlobalFilters(new Rfc7807ExceptionFilter());


  const config = new DocumentBuilder()
    .setTitle('Booking Prototipo API')
    .setDescription('API base para los dominios de Alojamientos, Autos, Atracciones y Vuelos.')
    .setVersion('1.0')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
