/**
 * ==============================================================================
 * scripts/demo/mock-tienda.js
 * Servidor HTTP ligero (cero dependencias externas) para simular tiendas socias
 * (Atracciones Dilan, Autos, Vuelos, Alojamientos) en el entorno de demostración.
 * ==============================================================================
 */

const http = require('node:http');
const { parse } = require('node:url');

const PORT = process.env.MOCK_TIENDA_PORT || 4000;

const mockCatalogos = {
  atracciones: [
    {
      id: 'tour-mitad-del-mundo',
      codigo: 'ATR-001',
      nombre: 'Tour Ciudad Mitad del Mundo',
      ciudad: 'Quito',
      precio: 25.0,
      cupos_disponibles: 40,
      duracion_horas: 4,
      incluye_transporte: true,
    },
    {
      id: 'tour-quilotoa-laguna',
      codigo: 'ATR-002',
      nombre: 'Excursión Laguna del Quilotoa',
      ciudad: 'Latacunga',
      precio: 45.0,
      cupos_disponibles: 18,
      duracion_horas: 8,
      incluye_transporte: true,
    },
  ],
  autos: [
    {
      id: 'auto-chevrolet-onix',
      placa: 'PBX-1024',
      marca: 'Chevrolet',
      modelo: 'Onix Sedán 1.0T',
      categoria: 'ECONOMICO',
      precio_por_dia: 35.0,
      disponible: true,
      transmision: 'MANUAL',
    },
    {
      id: 'auto-toyota-rav4',
      placa: 'PBY-4089',
      marca: 'Toyota',
      modelo: 'RAV4 2.5 Hybrid',
      categoria: 'SUV',
      precio_por_dia: 75.0,
      disponible: true,
      transmision: 'AUTOMATICA',
    },
  ],
  vuelos: [
    {
      id: 'vuelo-uiomanta-01',
      numero_vuelo: 'EQ-312',
      origen: 'UIO',
      destino: 'MEC',
      salida: '2026-11-01T08:00:00Z',
      llegada: '2026-11-01T08:50:00Z',
      tarifa_base: 85.0,
      asientos_disponibles: 12,
    },
  ],
  alojamientos: [
    {
      id: 'hotel-swissotel-quito',
      codigo_hotel: 'HOT-SWISS-01',
      nombre: 'Swissôtel Quito 5 Estrellas',
      tipo_habitacion: 'SUITE_DELUXE',
      precio_noche: 120.0,
      habitaciones_libres: 6,
    },
  ],
};

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id, X-Api-Key',
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({ raw });
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();

  const correlationId = req.headers['x-correlation-id'] || `mock-${Date.now()}`;
  console.log(`[MockTienda] ${new Date().toISOString()} [${method}] ${pathname} (Correlation: ${correlationId})`);

  if (method === 'OPTIONS') {
    return json(res, 204, {});
  }

  // Healthcheck de la tienda socia
  if (pathname === '/health' || pathname === '/api/health') {
    return json(res, 200, {
      status: 'UP',
      service: 'mock-tienda-satelite',
      timestamp: new Date().toISOString(),
      verticales_habilitadas: ['atracciones', 'autos', 'vuelos', 'alojamientos'],
    });
  }

  // Catálogos
  if (pathname === '/api/v2/atracciones' || pathname === '/api/v2/tours' || pathname === '/atracciones/tours') {
    return json(res, 200, {
      status: 'OK',
      total: mockCatalogos.atracciones.length,
      data: mockCatalogos.atracciones,
    });
  }

  if (pathname === '/api/v2/autos' || pathname === '/autos/flota') {
    return json(res, 200, {
      status: 'OK',
      total: mockCatalogos.autos.length,
      data: mockCatalogos.autos,
    });
  }

  if (pathname === '/api/v2/vuelos' || pathname === '/vuelos/itinerarios') {
    return json(res, 200, {
      status: 'OK',
      total: mockCatalogos.vuelos.length,
      data: mockCatalogos.vuelos,
    });
  }

  if (pathname === '/api/v2/alojamientos' || pathname === '/alojamientos/habitaciones') {
    return json(res, 200, {
      status: 'OK',
      total: mockCatalogos.alojamientos.length,
      data: mockCatalogos.alojamientos,
    });
  }

  // Operaciones transaccionales (Reservas / Holds)
  if (method === 'POST') {
    const body = await parseBody(req);
    const idGenerado = `RES-MOCK-${Date.now().toString(36).toUpperCase()}`;

    if (pathname.includes('/reservas') || pathname.includes('/hold') || pathname.includes('/order')) {
      return json(res, 201, {
        codigo: 'OK',
        id_reserva: idGenerado,
        codigo_confirmacion: `CONF-${idGenerado}`,
        estado: 'CONFIRMADA',
        recibido: body,
        mensaje: 'Reserva procesada exitosamente por la tienda satélite simulada.',
      });
    }

    if (pathname.includes('/compensar') || pathname.includes('/cancelar') || pathname.includes('/rollback')) {
      return json(res, 200, {
        codigo: 'COMPENSADO',
        estado: 'ANULADA',
        mensaje: 'Compensación procesada exitosamente en la tienda satélite.',
      });
    }
  }

  // Liberación / Cancelación (DELETE)
  if (method === 'DELETE') {
    return json(res, 200, {
      codigo: 'CANCELADO',
      estado: 'LIBERADA',
      mensaje: 'Recurso liberado exitosamente en la tienda externa.',
    });
  }

  // Ruta por defecto para simular endpoints genéricos
  return json(res, 200, {
    mensaje: 'Mock Tienda Satélite RDA2',
    ruta: pathname,
    metodo: method,
    status: 'OPERACIONAL',
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[MockTienda] Simulación de tiendas socias lista en http://0.0.0.0:${PORT}`);
  console.log(`[MockTienda] Rutas: /health, /api/v2/atracciones, /api/v2/autos, /api/v2/vuelos, /api/v2/alojamientos`);
});
