# 📱 Guía Oficial de Migración Móvil en FLUTTER para Socios B2B (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Plataforma Integradora:** Booking Central  
> **Framework Asignado:** **Flutter (Dart)**  
> **Destinatarios:** Socios Federados (Atracciones, Autos, Alojamientos, Vuelos)  
> **Instrucciones para el Estudiante:** Entrega este archivo completo a tu agente de IA (Cascade, Cursor, Copilot, Claude o ChatGPT). Tu agente tiene aquí todas las especificaciones necesarias para crear tu aplicación móvil sin poner en riesgo tu backend ni la integración con Booking Central.

---

## ⚠️ 1. REGLA DE ORO INVIOLABLE: PROHIBIDO MODIFICAR EL BACKEND

> [!CAUTION]
> ### 🛑 INSTRUCCIÓN CRÍTICA PARA EL AGENTE DE IA
> - **QUEDA ESTRICTAMENTE PROHIBIDO MODIFICAR, EDITAR O REFACTORIZAR CUALQUIER ARCHIVO DEL BACKEND EXISTENTE** (controladores, rutas, entidades de base de datos, DTOs, servicios o scripts de despliegue en Azure).
> - **NO MODIFICAR LOS CONTRATOS OPENAPI v3:** La integración B2B con Booking Central ya fue probada y aprobada en el RDA2. Cualquier cambio en rutas, payloads o modelos romperá las transacciones federadas (Sagas, cancelaciones, sincronización de cupos) y arruinará la calificación de ambos grupos.
> - **LA APLICACIÓN MÓVIL ES ÚNICAMENTE UN CLIENTE CONSUMIDOR:** Tu app móvil solo debe realizar peticiones HTTP (GET, POST, PATCH) a la API que ya está desplegada y funcionando en la nube (Azure Container Apps / Azure App Service).
> - **LA CONSOLA ADMINISTRATIVA NO SE MIGRA A MÓVIL:** Los paneles de administración, monitoreo y telemetría operativa se conservan en la aplicación Web de escritorio. La app móvil es **exclusiva para el cliente / turista final**.

### 1.1 Anti-Patrones Prohibidos para el Agente de IA (Lo que NUNCA debe implementar)
> [!WARNING]
> 1. **PROHIBIDO CREAR UN CARRITO DE COMPRAS (Cart / Carrito):** Esta plataforma NO es una tienda de e-commerce tradicional. Cada reserva (un hotel, un vuelo, un auto o una atracción) se ejecuta de forma **atómica, directa e individual** mediante `POST /reservas` enviando una cabecera única `Idempotency-Key` (UUIDv4) y un timeout de 45 segundos. Inventar un carrito (`CartProvider`, `CartItem`, `/cart`) romperá la lógica transaccional.
> 2. **PROHIBIDO USAR DATOS MOCKEADOS O HARDCODEADOS:** Si una llamada al backend devuelve una lista vacía `[]` o un error temporal, **nunca** devuelvas una lista falsa fija como fallback permanente. Muestra el estado vacío real con un botón interactivo de "Reintentar". Usar mocks estáticos ocultará los datos reales que tus compañeros y profesores registren en Azure durante la evaluación.
> 3. **PROHIBIDO INVENTAR BARRAS INFERIORES NO RESPONSIVAS:** No agregues barras de navegación tipo `BottomNavigationBar` con botones inventados ("Facturas", "Admin", etc.). La navegación debe ser limpia y basada en el catálogo y "Mis Reservas".

---

## 2. Ubicación y Aislamiento en tu Repositorio

Para evitar conflictos con tu código de servidor y garantizar un repositorio limpio:
1. Crea una carpeta dedicada en la raíz de tu repositorio (por ejemplo: `mi_app_flutter/` o `mobile_app/`).
2. Configura un archivo `.gitignore` dentro de esa carpeta para no subir artefactos temporales:
   ```gitignore
   .dart_tool/
   .packages
   build/
   android/.gradle/
   android/app/build/
   ios/.symlinks/
   *.apk
   *.aab
   .env
   ```

---

## 3. Configuración del Proyecto Flutter (`pubspec.yaml`)

Inicializa el proyecto con `flutter create <nombre_carpeta>` y agrega estas dependencias probadas y estables:

```yaml
name: socio_mobile_app
description: "Aplicación Móvil Cliente - Integración RDA3"
publish_to: "none"
version: 1.0.0+1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0              # Cliente HTTP para llamadas REST a tu backend en Azure
  provider: ^6.1.1          # Gestión de estado reactivo y limpio
  intl: ^0.19.0             # Formateo de fechas, horas y moneda ($ USD)
  qr_flutter: ^4.1.0        # Generación vectorial nativa de códigos QR para vouchers
  uuid: ^4.3.3              # Generación de X-Correlation-Id e Idempotency-Key
  shared_preferences: ^2.2.2# Persistencia local ligera de reservas o sesión

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
```

---

## 4. Arquitectura de Código Recomendada

Organiza tu código en `lib/` siguiendo una arquitectura modular y desacoplada:

```text
lib/
├── main.dart                  # Punto de entrada, MaterialApp y ThemeData
├── config/
│   └── api_constants.dart     # URL base de tu backend desplegado en Azure
├── models/
│   ├── servicio_item.dart     # Modelo de datos de tu servicio (Atracción, Auto, Hotel o Vuelo)
│   └── reserva_item.dart      # Modelo de reserva con fecha, estado y cálculo de 24h/48h
├── services/
│   └── api_service.dart       # Métodos HTTP centralizados con cabeceras de trazabilidad
├── providers/
│   └── app_state_provider.dart# Estado reactivo (catálogo, reservas activas, loading)
└── screens/
    ├── home_catalogo_screen.dart # Listado con fotos, precios y botón "Ver Detalle"
    ├── detalle_screen.dart       # Selector interactivo de fechas/turnos y botón reservar
    ├── mis_reservas_screen.dart  # Historial de reservas con validación de cancelación
    └── voucher_qr_screen.dart    # Código QR para check-in presencial offline
```

### 4.1 Modelado Resiliente de Datos (Tolerancia a Nodos Socios en `fromJson`)
Debido a que los microservicios pueden retornar ligeras variaciones de nombres de campo (snake_case vs camelCase o IDs de MongoDB), tu modelo en `lib/models/servicio_item.dart` debe deserializar de forma tolerante:

```dart
class ServicioItem {
  final String id;
  final String nombre;
  final double precio;
  final String? imagenUrl;
  final int cuposDisponibles;

  ServicioItem({
    required this.id,
    required this.nombre,
    required this.precio,
    this.imagenUrl,
    this.cuposDisponibles = 10,
  });

  factory ServicioItem.fromJson(Map<String, dynamic> json) {
    // 1. Identificador tolerante
    final idStr = json['id']?.toString() ??
        json['_id']?.toString() ??
        json['auto_id']?.toString() ??
        json['vehicle_id']?.toString() ??
        json['alojamiento_id']?.toString() ??
        json['atraccion_id']?.toString() ??
        json['offerId']?.toString() ??
        '';

    // 2. Precios tolerantes (pueden venir como num, string u objeto { total: 45 })
    double precioParsed = 0.0;
    final rawPrice = json['precio'] ?? json['price'] ?? json['precio_diario'] ?? json['precio_por_noche'];
    if (rawPrice is num) {
      precioParsed = rawPrice.toDouble();
    } else if (rawPrice is String) {
      precioParsed = double.tryParse(rawPrice) ?? 0.0;
    } else if (rawPrice is Map && rawPrice['total'] != null) {
      precioParsed = (rawPrice['total'] as num).toDouble();
    }

    // 3. Extracción de fotos (array de URLs, array de objetos o string único)
    String? foto;
    if (json['photos'] is List && (json['photos'] as List).isNotEmpty) {
      final first = (json['photos'] as List).first;
      foto = first is Map ? first['url']?.toString() : first?.toString();
    } else {
      foto = json['foto_url']?.toString() ?? json['imagen_url']?.toString();
    }

    return ServicioItem(
      id: idStr,
      nombre: json['nombre']?.toString() ?? json['name']?.toString() ?? json['vehiculo']?.toString() ?? 'Servicio Turístico',
      precio: precioParsed > 0 ? precioParsed : 25.0,
      imagenUrl: foto,
      cuposDisponibles: (json['cupos_disponibles'] ?? json['stock'] ?? json['available_spots'] ?? 10) as int,
    );
  }
}
```

---

## 5. Implementación de Servicios y Conectividad HTTP

En `lib/services/api_service.dart`, define la conexión con tu backend en Azure. **Incluye siempre las cabeceras estándar de trazabilidad**:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

class ApiService {
  // IMPORTANTE: Coloca aquí la URL HTTPS de tu backend ya desplegado en Azure
  static const String baseUrl = 'https://tu-api-desplegada.azurewebsites.net/api/v3';

  static Map<String, String> _getHeaders({String? idempotencyKey}) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Correlation-Id': const Uuid().v4(),
      if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
    };
  }

  // 1. Obtener catálogo
  static Future<List<dynamic>> getCatalogo() async {
    final response = await http.get(
      Uri.parse('$baseUrl/atracciones'), // o /vehiculos, /alojamientos, /vuelos según tu servicio
      headers: _getHeaders(),
    );
    if (response.statusCode == 200) {
      return jsonDecode(utf8.decode(response.bodyBytes)) as List<dynamic>;
    }
    throw Exception('Error al cargar catálogo: ${response.statusCode}');
  }

  // 2. Crear reserva
  static Future<Map<String, dynamic>> crearReserva(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('$baseUrl/reservas'),
      headers: _getHeaders(idempotencyKey: const Uuid().v4()),
      body: jsonEncode(payload),
    );
    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    }
    throw Exception('Error al crear reserva: ${response.body}');
  }

  // 3. Cancelar reserva
  static Future<bool> cancelarReserva(String reservaId) async {
    final response = await http.post(
      Uri.parse('$baseUrl/reservas/$reservaId/cancel'), // Ajustar a tu ruta exacta de cancelación
      headers: _getHeaders(),
    );
    return response.statusCode == 200 || response.statusCode == 204;
  }
}
```

---

## 6. Reglas de Negocio Esenciales en la App Móvil

### A. Regla Invariante de Cancelación (24h / 48h)
- En la pantalla `mis_reservas_screen.dart`, **oculta o deshabilita el botón "Cancelar" si faltan menos de 24 horas** (o 48 horas en atracciones reguladas) para el inicio del servicio.
- **Implementación en Dart:**
  ```dart
  bool puedeCancelar(DateTime fechaServicio) {
    final horasRestantes = fechaServicio.difference(DateTime.now()).inHours;
    return horasRestantes >= 24; // 48 para atracciones si aplica tu regla
  }
  ```

### B. Emisión de Voucher con Código QR para Check-in Offline
- Utiliza el paquete `qr_flutter` para mostrar un QR con los datos esenciales de la reserva (ID de reserva, nombre del cliente, servicio y fecha):
  ```dart
  import 'package:qr_flutter/qr_flutter.dart';

  QrImageView(
    data: 'BOOKING-RESERVA:${reserva.id}|CLIENTE:${reserva.clienteNombre}',
    version: QrVersions.auto,
    size: 220.0,
  )
  ```

### C. Refresco Inmediato tras Cancelación (Anti-Stale State)
- Al confirmarse la cancelación desde el backend, actualiza el estado local de la reserva a `'CANCELADA'` inmediatamente con `setState()` o mediante tu `Provider`, sin obligar al usuario a reiniciar la app o recargar manualmente.

### D. Sincronización en Vivo y Pull-to-Refresh
- Envuelve tu listado de catálogo en `home_catalogo_screen.dart` con `RefreshIndicator` para que el usuario pueda deslizar hacia abajo y refrescar los ítems en tiempo real:
  ```dart
  RefreshIndicator(
    onRefresh: () => Provider.of<AppStateProvider>(context, listen: false).cargarCatalogo(),
    child: ListView.builder(...),
  )
  ```
- Opcionalmente, puedes inicializar un `Timer.periodic(const Duration(seconds: 12), ...)` en tu pantalla principal para mantener los cupos y la disponibilidad sincronizados silenciosamente con Azure.

---

## 7. Instrucciones Específicas por Tipo de Socio

Identifica cuál es tu servicio y aplica estas directrices particulares:

### 🎭 Si eres Socio de ATRACCIONES (Gloria, Dilan, Michael, Ariel, Alisson):
- **Time Slots y Aforo:** En `detalle_screen.dart`, muestra un selector de fechas que consulte los horarios disponibles (`time_slots`) y pinte chips interactivos con la **capacidad restante** en tiempo real.
- **Tickets:** Si manejas tarifas por edad (Adulto, Niño, Tercera Edad), incluye contadores `+ / -` independientes.

### 🚗 Si eres Socio de AUTOS (Esteban / Mateo - RutaLibre Autos):
- **Fechas y Días:** El usuario selecciona fecha/hora de retiro y fecha/hora de devolución; calcula el número de días y el costo total automáticamente.
- **Cooldown de 2 Horas:** En la ficha de detalle, muestra un indicador de estado del vehículo (disponible vs en período de inspección técnica de 2h tras entrega).

### 🏨 Si eres Socio de ALOJAMIENTOS:
- Permite seleccionar rango de fechas (Check-in / Check-out), calcula automáticamente las noches de estancia y permite elegir el Tipo de Habitación (Simple, Doble, Suite).

### ✈️ Si eres Socio de VUELOS:
- Permite seleccionar origen/destino, cantidad de pasajeros, clase (Económica / Ejecutiva) y muestra el estado del vuelo (A tiempo, En vuelo, Demorado).

---

## 8. Comandos para Probar y Compilar el APK

> [!NOTE]
> **Usuarios de Windows (PowerShell):** Ejecuta cada comando en una línea separada. En PowerShell 5.1 no encadenes instrucciones con `&&` ya que arrojará un error de sintaxis; usa `;` o ejecuta comando por comando.

```bash
# 1. Ubicarse en la carpeta de la app móvil
cd mi_app_flutter

# 2. Descargar paquetes
flutter pub get

# 3. Verificación estática obligatoria (garantiza cero errores de tipos antes de compilar)
flutter analyze

# 4. Probar en navegador Web
flutter run -d chrome

# 5. Probar en celular Android (modo Debug con USB o Emulador)
flutter run

# 6. Generar archivo APK de Producción para entrega de la tarea
flutter build apk --release
```
*El instalador APK final estará ubicado en:*  
`build/app/outputs/flutter-apk/app-release.apk`

---

## 9. Prompt Copy-Paste para tu Agente de IA

Copia el siguiente recuadro y pégaselo directamente a tu asistente de IA (Cascade, Cursor, Copilot, ChatGPT, etc.):

```text
Hola agente. Estamos trabajando en la entrega del Reto 3 (RDA3) de la asignatura Integración de Sistemas.
Nuestro framework asignado para el cliente móvil es FLUTTER (Dart).

INSTRUCCIONES OBLIGATORIAS Y REGLA DE ORO:
1. NO MODIFIQUES ningún archivo de nuestro backend existente ni toques controladores, entidades, DTOs ni rutas en Azure. El backend ya está funcionando y aprobado con Booking Central en el RDA2. Cualquier cambio en el backend romperá la integración.
2. Desarrolla la aplicación móvil en una carpeta nueva en la raíz de nuestro repositorio llamada 'mobile_flutter'.
3. La aplicación móvil se conectará como cliente HTTP a nuestra API ya desplegada en Azure, utilizando las cabeceras estándar 'Content-Type: application/json', 'Accept: application/json' y 'X-Correlation-Id'.

GUARDRAILS Y ANTI-PATRONES OBLIGATORIOS (LO QUE NO DEBES HACER):
- PROHIBIDO CREAR UN CARRITO DE COMPRAS: Cada reserva se ejecuta de forma directa, atómica e individual enviando una cabecera 'Idempotency-Key' única (UUIDv4) con timeout de 45s. No agregues CartProvider ni pantallas de carrito.
- PROHIBIDO USAR DATOS MOCKEADOS: Si la API responde con lista vacía o error, muestra un estado visual amigable con botón de reintento. Nunca inventes listas fijas hardcodeadas en producción.
- PROHIBIDO MIGRAR CONSOLA ADMIN: No agregues paneles de administración, gestión de proveedores ni telemetría. La app es 100% para el cliente final.
- MODELADO RESILIENTE: En 'fromJson', tolera identificadores ('id', '_id', 'auto_id', 'vehicle_id', 'alojamiento_id'), precios (número, string u objeto con total) y fotos (array o string) sin lanzar excepciones.

PANTALLAS ESENCIALES A IMPLEMENTAR:
1. Pantalla de Catálogo: Listado responsivo con Pull-to-Refresh (RefreshIndicator), imágenes, títulos, precios en USD y botón de detalle.
2. Pantalla de Detalle: Ficha del servicio con selector de fechas/turnos, capacidad restante y botón para confirmar la reserva individual.
3. Pantalla de Mis Reservas: Historial con botón de cancelación (oculto si faltan menos de 24h para el servicio) y actualización reactiva inmediata del estado al cancelar.
4. Pantalla de Voucher QR: Generación vectorial de código QR para check-in usando el paquete 'qr_flutter'.

Utiliza 'provider' para el manejo de estado y 'http' para las peticiones. Deja el proyecto verificado con 'flutter analyze' y listo para compilar con 'flutter build apk --release'.
```

