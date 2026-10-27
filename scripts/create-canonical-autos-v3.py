import yaml
import re

# Read v2 contract
with open('contracts/autos-openapi-v2.yaml', 'r', encoding='utf-8') as f:
    v2_content = f.read()

# Parse YAML
v2_data = yaml.safe_load(v2_content)

# Update info
v2_data['info']['version'] = '3.0.0'
v2_data['info']['title'] = 'API de Renta de Autos y Gestión de Flota (Booking Prototipo RDA2 - Versión Canónica v3)'
v2_data['info']['description'] = """# Contrato Oficial Canónico de Integración — Vertical de Renta de Autos (RDA2 v3.0.0)

> **Sistema Emisor / Proveedor:** Tiendas y Concesionarias de Renta de Autos (Páginas Individuales de Compañeros RDA2)  
> **Sistema Consumidor / Agregador Central:** Booking Prototipo (Marketplace Multimodal — Paúl Rosero)  
> **Asignatura:** Integración de Sistemas — 6to Semestre (Reto 2: RDA2 / Semana 9)  
> **Estándar:** OpenAPI Specification 3.0.3 (API-First, REST HATEOAS Nivel 3, RFC 7807 Problem Details, CloudEvents v1.0)  
> **Documento Canónico:** `contracts/autos-openapi-v3.yaml`  
> **Versión:** 3.0.0 (Resolución de Ambigüedades de Idioma, Estandarización de Sagas y Sincronización gRPC)

---

## 1. Novedades y Mejoras Clave de la Versión 3.0.0 (Semana 9)

1. **Estandarización 100% en Inglés para Campos Requeridos (Indicaciones Semana 9 §8):**
   - Se eliminaron las duplicidades de nombres de atributos (`conductor` -> `driver`, `nombre`/`full_name`, `correo`/`email`, `telefono`/`phone`).
   - Las propiedades canónicas obligatorias para reservas son: `vehicle_id`, `pickup_date`, `dropoff_date`, `driver` (`full_name`, `email`, `phone`, `license_number`, `age`).
   - Se mantiene tolerancia pasiva de lectura para clientes que envíen alias en español (*Ley de Postel*).

2. **Resolución de Servidores Canónicos de Producción:**
   - La URL canónica apunta a Render: `https://rda1-backend-integracion-sistemas.onrender.com/api/v3`.
   - Se habilitan rutas de entorno de desarrollo (`http://localhost:3000/api/v3`) y compatibilidad hacia atrás (`/api/v2` y `/api/v1`).

3. **Estandarización Canónica de Errores para Sagas Distribuidas (RFC 7807):**
   - **`409 Conflict` (`VEHICLE_UNAVAILABLE`, `OUT_OF_STOCK`, `VEHICLE_IN_CLEANING_COOLDOWN`):** Es el **ÚNICO** código que activa compensaciones LIFO en el orquestador de Sagas del Booking.
   - **`422 Unprocessable Entity` (`DRIVER_UNDERAGE`, `INVALID_DATES`, `INVALID_PAYLOAD`):** Errores semánticos y de cliente; **NO** disparan compensaciones de Saga.
   - **`400 Bad Request` (`MALFORMED_REQUEST`, `IDEMPOTENCY_CONFLICT`):** Errores de sintaxis o conflicto de idempotencia.

4. **Máquina de Estados Finita de Flota (Consideraciones RDA2 §5):**
   - Ciclo de vida oficial: `DISPONIBLE` ➔ `RESERVADO` ➔ `LISTO_PARA_ENTREGAR` ➔ `ENTREGADO` ➔ `EN_LIMPIEZA` ➔ `EN_MANTENIMIENTO`.
   - **Cooldown de 2 Horas (120 min):** Tras el retorno del auto, queda en `EN_LIMPIEZA`. Bloqueado para nuevas reservas. Si se intenta reservar, responde `409 Conflict`.
   - **Alertas de Odómetro:** Cuando `current_mileage >= next_maintenance_km`, se activa alerta preventiva auditable.

5. **Sincronización Asimétrica con gRPC (`src/proto/inventory.proto`):**
   - Las concesionarias envían actualizaciones de stock a Booking vía gRPC (`InventoryStockService.PushStockUpdate`).
   - Para autos: `available_units = 1` (disponible) o `0` (reservado / en limpieza / entregado).
"""

# Update servers
v2_data['servers'] = [
    {
        'url': '/api/v3',
        'description': 'API Gateway Booking Prototipo — Ruta base canónica v3 (Producción / Local)'
    },
    {
        'url': 'https://rda1-backend-integracion-sistemas.onrender.com/api/v3',
        'description': 'Servidor de Producción Desplegado en Render (HTTPS)'
    },
    {
        'url': 'http://localhost:3000/api/v3',
        'description': 'Entorno de Desarrollo Local del Gateway NestJS'
    },
    {
        'url': '/api/v2',
        'description': 'Ruta de compatibilidad v2'
    },
    {
        'url': '/api/v1',
        'description': 'Ruta Legacy v1'
    }
]

# Update CreateAutoOrderRequestV2 in schemas to have English canonical driver and clean properties
schemas = v2_data['components']['schemas']

# Clean Driver schema
driver_schema = {
    'type': 'object',
    'required': ['full_name', 'email', 'phone', 'license_number', 'age'],
    'properties': {
        'full_name': {
            'type': 'string',
            'example': 'Carlos Andrés Zambrano'
        },
        'email': {
            'type': 'string',
            'format': 'email',
            'example': 'carlos.zambrano@example.com'
        },
        'phone': {
            'type': 'string',
            'example': '+593987654321'
        },
        'license_number': {
            'type': 'string',
            'example': '1723456789'
        },
        'country_license': {
            'type': 'string',
            'example': 'Ecuador',
            'default': 'Ecuador'
        },
        'age': {
            'type': 'integer',
            'minimum': 18,
            'example': 28
        },
        'flight_number': {
            'type': 'string',
            'example': 'AV1632'
        },
        # Tolerancia hacia atrás (opcionales)
        'nombre': {'type': 'string', 'example': 'Carlos Andrés Zambrano', 'description': 'Alias en español de full_name'},
        'correo': {'type': 'string', 'format': 'email', 'example': 'carlos.zambrano@example.com', 'description': 'Alias en español de email'},
        'telefono': {'type': 'string', 'example': '+593987654321', 'description': 'Alias en español de phone'},
        'licencia_conducir': {'type': 'string', 'example': '1723456789', 'description': 'Alias en español de license_number'},
        'edad': {'type': 'integer', 'example': 28, 'description': 'Alias en español de age'}
    }
}

if 'CreateAutoOrderRequestV2' in schemas:
    order_req = schemas['CreateAutoOrderRequestV2']
    order_req['required'] = ['vehicle_id', 'pickup_date', 'dropoff_date', 'driver']
    order_req['properties']['driver'] = driver_schema
    order_req['properties']['conductor'] = driver_schema  # backward compatibility alias
    order_req['properties']['coverage_type'] = {
        'type': 'string',
        'enum': ['BASIC', 'TOTAL', 'BASICA'],
        'default': 'BASIC',
        'description': 'Tipo de cobertura del seguro (BASIC: con franquicia, TOTAL: franquicia $0)'
    }
    order_req['properties']['pickup_time'] = {
        'type': 'string',
        'example': '10:00',
        'default': '10:00'
    }
    order_req['properties']['dropoff_time'] = {
        'type': 'string',
        'example': '10:00',
        'default': '10:00'
    }

# Also ensure AutoVehiculoCardV2 has clean English properties as primary
if 'AutoVehiculoCardV2' in schemas:
    card = schemas['AutoVehiculoCardV2']
    # Ensure id and vehicle_id are clean strings
    card['properties']['vehicle_id'] = {'type': 'string', 'example': 'auto-spark-01'}
    card['properties']['brand'] = {'type': 'string', 'example': 'Chevrolet'}
    card['properties']['model'] = {'type': 'string', 'example': 'Spark GT 1.2'}
    card['properties']['category'] = {'type': 'string', 'example': 'ECONOMICO'}
    card['properties']['daily_price'] = {'type': 'number', 'example': 35.0}
    card['properties']['total_price'] = {'type': 'number', 'example': 105.0}
    card['properties']['currency'] = {'type': 'string', 'example': 'USD'}
    card['properties']['transmission'] = {'type': 'string', 'enum': ['MANUAL', 'AUTOMATICO'], 'example': 'MANUAL'}
    card['properties']['seats'] = {'type': 'integer', 'example': 5}
    card['properties']['doors'] = {'type': 'integer', 'example': 5}
    card['properties']['status'] = {'$ref': '#/components/schemas/EstadoVehiculoEnum'}
    card['properties']['cleaning_cooldown'] = {'$ref': '#/components/schemas/CooldownStatusDto'}

# Write v3
with open('contracts/autos-openapi-v3.yaml', 'w', encoding='utf-8') as f:
    yaml.dump(v2_data, f, allow_unicode=True, sort_keys=False)

print("Generated contracts/autos-openapi-v3.yaml successfully!")
