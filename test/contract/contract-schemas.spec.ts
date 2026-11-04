import { validateResponse, assertMatchesContract } from './validate-response';

describe('Suites de Pruebas de Contrato OpenAPI v2 — Cátedra RDA2 (CE07 / CP-012)', () => {
  describe('CP-012: Contrato Admin v2 (admin-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de semáforo de nodos getNodesHealth (200 OK)', () => {
      const mockPayload = {
        summary: {
          total: 2,
          online: 2,
          degraded: 0,
          offline: 0,
        },
        nodes: [
          {
            id: 'atracciones',
            nombre: 'Sistema de Atracciones & Tours',
            vertical: 'Atracciones',
            protocolo: 'REST / OpenAPI v2',
            url: 'http://localhost:3000/api/v2/atracciones',
            enabled: true,
            status: 'ONLINE',
            latency: 45,
            lastCheck: new Date().toISOString(),
            circuitBreaker: 'CLOSED',
          },
          {
            id: 'autos',
            nombre: 'Sistema Renta de Autos & Flota',
            vertical: 'Autos',
            protocolo: 'REST / OpenAPI v2 + Cooldown 2h',
            url: 'http://localhost:3000/api/v2/autos',
            enabled: true,
            status: 'ONLINE',
            latency: 38,
            lastCheck: new Date().toISOString(),
            circuitBreaker: 'CLOSED',
          },
        ],
      };

      const result = validateResponse({
        contractPath: 'contracts/admin-openapi-v2.yaml',
        operationId: 'getNodesHealth',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
      expect(() =>
        assertMatchesContract({
          contractPath: 'contracts/admin-openapi-v2.yaml',
          operationId: 'getNodesHealth',
          statusCode: 200,
          responseBody: mockPayload,
        }),
      ).not.toThrow();
    });
  });

  describe('CP-012: Contrato Observabilidad v2 (observabilidad-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta del grafo DAG de trazas getTrazaGrafo (200 OK)', () => {
      const mockPayload = {
        correlation_id: 'SAGA-TEST-TRAZA-001',
        root_process: 'CHECKOUT_MULTIVERTICAL_SAGA',
        overall_status: 'COMPLETED',
        duration_ms: 320,
        nodes: [
          {
            id: 'span-orchestrator',
            label: 'API Gateway / Saga Orchestrator',
            service: 'MS_ESB',
            type: 'orchestrator',
            status: 'SUCCESS',
            color_led: '🟢',
            duration_ms: 320,
            timestamp: new Date().toISOString(),
          },
          {
            id: 'span-ms-atr',
            label: 'Reserva Tour Teleférico',
            service: 'MS_ATR',
            type: 'service_call',
            status: 'SUCCESS',
            color_led: '🟢',
            duration_ms: 110,
            timestamp: new Date().toISOString(),
          },
        ],
        edges: [
          {
            from: 'span-orchestrator',
            to: 'span-ms-atr',
            protocol: 'REST',
            event_name: 'Invocación Reserva Atracción',
          },
        ],
      };

      const result = validateResponse({
        contractPath: 'contracts/observabilidad-openapi-v2.yaml',
        operationId: 'getTrazaGrafo',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Atracciones v2 (atracciones-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta del listado de catálogo GET /atracciones (200 OK)', () => {
      const mockPayload = {
        request_id: 'req-atr-12345',
        metadata: {
          total_results: 1,
          total_pages: 1,
          page: 1,
          limit: 10,
        },
        data: [
          {
            id: 'PRhu4UBTWPBC',
            name: 'Teleférico y Volcán Pichincha',
            city: 'Quito',
            price: {
              currency: 'USD',
              adult: 30.0,
              child: 15.0,
              senior: 18.0,
              infant: 0.0,
            },
            rating: {
              score: 9.8,
              review_count: 1250,
              badge_text: 'Excepcional',
            },
            duration: '3 horas',
            inclusions: {
              incluye_comida: false,
              incluye_transporte: true,
              incluye_guia: true,
            },
          },
        ],
      };

      const result = validateResponse({
        contractPath: 'contracts/atracciones-openapi-v2.yaml',
        path: '/atracciones',
        method: 'get',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Autos v2 (autos-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de flota disponible GET /autos/flota (200 OK)', () => {
      const mockPayload = [
        {
          id: 'auto-sedan-01',
          marca: 'Chevrolet',
          modelo: 'Sail',
          categoria: 'SEDAN',
          precio_diario: 35.0,
          estado_operativo: 'DISPONIBLE',
          cooldown_activo: false,
          segundos_restantes_cooldown: 0,
          kilometraje_actual: 45000,
          umbral_mantenimiento_km: 50000,
          alerta_mantenimiento: false,
        },
      ];

      const result = validateResponse({
        contractPath: 'contracts/autos-openapi-v2.yaml',
        path: '/autos/flota',
        method: 'get',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato ESB Sagas v2 (esb-sagas-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de checkout exitoso checkoutSaga (200 OK)', () => {
      const mockPayload = {
        success: true,
        correlation_id: 'SAGA-HAPPY-001',
        estado: 'COMPLETED',
        total_pagado: 120.0,
        pago: {
          transaccion_id: 'TRX-998877',
          status: 'APROBADO',
          monto: 120.0,
        },
        items_confirmados: [
          {
            servicio: 'MS_ATR',
            operacion: 'RESERVAR_ATRACCION',
            datos: { reservation_id: 'RES-001', status: 'CONFIRMED' },
          },
        ],
        mensaje: 'Checkout compuesto finalizado exitosamente. Saga completada al 100%.',
      };

      const result = validateResponse({
        contractPath: 'contracts/esb-sagas-openapi-v2.yaml',
        operationId: 'checkoutSaga',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Pagos v2 (pagos-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de pago aprobado procesarPago (200 OK)', () => {
      const mockPayload = {
        transaccion_id: 'tx-approved-1234',
        codigo_autorizacion: 'AUTH-778899',
        estado: 'APROBADO',
        monto: 150.0,
        moneda: 'USD',
        fecha_procesamiento: new Date().toISOString(),
        mensaje: 'Cobro ejecutado exitosamente en pasarela.',
        es_idempotente: false,
      };

      const result = validateResponse({
        contractPath: 'contracts/pagos-openapi-v2.yaml',
        operationId: 'procesarPago',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Paquetes v2 (paquetes-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de listado de paquetes listarPaquetes (200 OK)', () => {
      const mockPayload = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          codigoPaquete: 'PKG-QUITO-EXPRESS',
          nombre: 'Quito Express + Pichincha',
          ciudadDestino: 'Quito',
          precio_base_total: 100.0,
          descuento_combo_pct: 10.0,
          precio_final_paquete: 90.0,
          activo: true,
          items: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              paqueteId: '11111111-1111-1111-1111-111111111111',
              itemReferenciaId: 'PRhu4UBTWPBC',
              vertical: 'atracciones',
              nombreItem: 'Teleférico Pichincha',
              precioIndividual: 40.0,
              descuentoAplicadoPct: 10.0,
              precioConDescuento: 36.0,
            },
          ],
        },
      ];

      const result = validateResponse({
        contractPath: 'contracts/paquetes-openapi-v2.yaml',
        operationId: 'listarPaquetes',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Webhooks Inbound v2 (webhooks-inbound-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de webhook encolado recibirWebhookVertical (202 Accepted)', () => {
      const mockPayload = {
        success: true,
        status: 'ACCEPTED',
        message: 'Evento CloudEvent recibido y encolado en RabbitMQ para procesamiento.',
        event_id: '11111111-1111-1111-1111-111111111111',
        vertical: 'vuelos',
        queue_target: 'booking.webhooks.inbound.vuelos',
        received_at: new Date().toISOString(),
      };

      const result = validateResponse({
        contractPath: 'contracts/webhooks-inbound-openapi-v2.yaml',
        operationId: 'recibirWebhookVertical',
        statusCode: 202,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Clientes v2 (clientes-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de registro/login de usuario supabaseSignUp (200 OK)', () => {
      const mockPayload = {
        access_token: 'jwt-mock-token-abc.xyz.123',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: 'usr-cliente-001',
          email: 'turista@booking.com',
          role: 'authenticated',
        },
      };

      const result = validateResponse({
        contractPath: 'contracts/clientes-openapi-v2.yaml',
        operationId: 'supabaseSignUp',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Auditoría v2 (auditoria-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de listado de auditoría listarAuditoriaTransacciones (200 OK)', () => {
      const mockPayload = {
        total_registros_encontrados: 1,
        items: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            modulo: 'MS_ESB',
            accion: 'CHECKOUT_COMPLETED',
            correlation_id: 'SAGA-AUDIT-001',
            created_at: new Date().toISOString(),
          },
        ],
      };

      const result = validateResponse({
        contractPath: 'contracts/auditoria-openapi-v2.yaml',
        operationId: 'listarAuditoriaTransacciones',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Contrato Finanzas v2 (finanzas-openapi-v2.yaml)', () => {
    it('CP-012: Valida respuesta de resumen financiero global getResumenFinanciero (200 OK)', () => {
      const mockPayload = {
        total_recaudado_global: 12540.0,
        total_comisiones_booking_10pct: 1254.0,
        total_liquidado_a_socios: 8500.0,
        total_pendiente_de_pago: 2786.0,
        moneda: 'USD',
        regla_comision: '10% Booking Prototipo / 90% Socio Externo',
        fecha_corte: new Date().toISOString(),
      };

      const result = validateResponse({
        contractPath: 'contracts/finanzas-openapi-v2.yaml',
        operationId: 'getResumenFinanciero',
        statusCode: 200,
        responseBody: mockPayload,
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('CP-012: Rigor y Detección Estricta de Discrepancias', () => {
    it('CP-012: Rechaza estrictamente una respuesta que omite campos requeridos por el contrato', () => {
      const invalidPayload = {
        // Omite total_recaudado_global, moneda, regla_comision, etc.
        total_liquidado_a_socios: 100.0,
      };

      const result = validateResponse({
        contractPath: 'contracts/finanzas-openapi-v2.yaml',
        operationId: 'getResumenFinanciero',
        statusCode: 200,
        responseBody: invalidPayload,
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);

      expect(() =>
        assertMatchesContract({
          contractPath: 'contracts/finanzas-openapi-v2.yaml',
          operationId: 'getResumenFinanciero',
          statusCode: 200,
          responseBody: invalidPayload,
        }),
      ).toThrow(/FAIL CONTRATO OpenAPI/);
    });
  });
});
