# 📱 Guía Oficial de Migración Móvil en FLUTTER para Socios B2B (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Plataforma Integradora:** Booking Central  
> **Framework Asignado:** **Flutter (Dart)**  
> **Destinatarios:** Socios Federados (Atracciones, Autos, Alojamientos, Vuelos)  
> **Instrucciones para el Estudiante:** Entrega este archivo completo a tu agente de IA (Cascade, Cursor, Copilot, Claude o ChatGPT). Contiene todo lo necesario para construir tu app móvil como **cliente** de tu API ya desplegada en Azure, sin poner en riesgo tu backend ni la integración con Booking Central.

---

## ⚠️ 1. REGLA DE ORO INVIOLABLE: PROHIBIDO MODIFICAR EL BACKEND

> [!CAUTION]
> ### 🛑 INSTRUCCIÓN CRÍTICA PARA EL AGENTE DE IA
> - **QUEDA ESTRICTAMENTE PROHIBIDO MODIFICAR, EDITAR, REFACTORIZAR, FORMATEAR O "ARREGLAR" CUALQUIER ARCHIVO DEL BACKEND EXISTENTE** (controladores, rutas, entidades, DTOs, servicios, migraciones, variables de entorno, `Dockerfile` o scripts de despliegue en Azure). Tampoco se ejecutan despliegues ni migraciones de base de datos.
> - **NO MODIFICAR LOS CONTRATOS OPENAPI v3:** La integración B2B con Booking Central se probó y aprobó en el RDA2. Cambiar una ruta, un campo o un código de estado rompe las transacciones federadas (Sagas, cancelaciones, sincronización de cupos) y afecta la calificación de **ambos** grupos.
> - **NO INVENTAR ENDPOINTS:** La app solo consume rutas que **ya existen** en tu backend (ver §2.1). Si una pantalla necesita un dato que la API no expone, la pantalla se simplifica; la API no se cambia.
> - **LA APLICACIÓN MÓVIL ES ÚNICAMENTE UN CLIENTE CONSUMIDOR:** solo realiza peticiones HTTP a la API ya desplegada en Azure (App Service / Container Apps).
> - **LA CONSOLA ADMINISTRATIVA NO SE MIGRA A MÓVIL:** paneles de administración, monitoreo y telemetría se quedan en la web. La app es **exclusiva para el cliente / turista final**.

### 1.1 Anti-Patrones Prohibidos para el Agente de IA (Lo que NUNCA debe implementar)

> [!WARNING]
> 1. **🚫 PROHIBIDO EL CARRITO DE COMPRAS (Cart / Basket):** La integración B2B con Booking Central opera **solo con reservas atómicas individuales y directas**: el usuario confirma **una** reserva y la app hace **un** `POST` a la ruta de reservas de tu backend, con cabecera `Idempotency-Key` (UUIDv4) y timeout de **45 segundos**. No existen `CartProvider`, `CartItem`, `CartService`, `BasketProvider`, pantallas `/cart`, "Agregar al carrito" ni checkout multi-ítem. Un carrito rompe la orquestación transaccional y la sincronización de inventario.
> 2. **🚫 PROHIBIDO USAR MOCKS ESTÁTICOS:** Nunca devuelvas listas falsas desde un `catch` ni como "respaldo" cuando la API responde `[]`. La app debe reflejar **en vivo** lo que existe en Azure: los profesores crearán datos durante la evaluación y deben verlos aparecer. Si la API devuelve `[]` → estado visual **"No hay servicios disponibles"** con botón **Reintentar**. Si falla → mensaje de error con **Reintentar**. Esto incluye **valores inventados**: no rellenes un precio ausente con `25.0` ni un aforo ausente con `10`; muestra "Precio no disponible" / oculta el dato.
> 3. **🚫 PROHIBIDO MIGRAR LA CONSOLA DE ADMINISTRACIÓN:** Cero dashboards, métricas, gestión de proveedores, CRUD de inventario o pantallas de "crear/editar servicio". Solo flujos del cliente final: explorar, ver detalle, reservar, ver/cancelar sus reservas y mostrar su voucher.
> 4. **🚫 PROHIBIDO INVENTAR NAVEGACIÓN:** No agregues `BottomNavigationBar` ni botones con secciones que no existen ("Facturas", "Admin", "Ofertas"…). Navegación mínima: **Catálogo → Detalle → Confirmación/Voucher**, con un acceso a **"Mis Reservas"** en la `AppBar`.

---

## 2. Ubicación y Aislamiento en tu Repositorio

1. Crea una carpeta dedicada en la raíz de tu repositorio, por ejemplo `mobile_flutter/`. **No** muevas ni renombres nada del backend.
2. Agrega un `.gitignore` dentro de esa carpeta:
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

### 2.1 Descubre tu contrato real ANTES de escribir código (solo lectura)

> [!IMPORTANT]
> Las rutas que aparecen en los ejemplos de esta guía (`/catalogo`, `/reservas`, `/reservas/{id}/cancel`) son **marcadores de posición**. El agente debe **leer (sin editar)** el backend del repositorio —controladores/routers y, si existe, el `openapi.yaml`/Swagger— y completar esta tabla **antes** de programar. Si una fila no se puede llenar con una ruta existente, esa función no se implementa.

| Función en la app | Método + ruta real en TU backend | Campos del body / query | Forma de la respuesta |
| :--- | :--- | :--- | :--- |
| Listar catálogo | `GET /...` | filtros opcionales | ¿`[...]` o `{ data: [...] }`? |
| Detalle de un servicio | `GET /.../{id}` | — | objeto |
| Disponibilidad (turnos, fechas, cupos) | `GET /...` | `date`, … | lista |
| Crear reserva | `POST /...` | campos exactos del DTO | id / código / estado |
| Listar mis reservas | `GET /...` | `email` / cédula / token | lista |
| Cancelar reserva | `POST` o `PATCH /...` | `reason`, … | estado |

---

## 3. Configuración del Proyecto Flutter

Crea el proyecto con `flutter create mobile_flutter` y usa este `pubspec.yaml`. **Ojo:** en YAML un comentario `#` necesita un espacio antes; `^2.2.2# texto` rompe `flutter pub get`.

```yaml
name: mobile_flutter
description: "Aplicación Móvil Cliente - Integración RDA3"
publish_to: "none"
version: 1.0.0+1

environment:
  sdk: ">=3.0.0 <4.0.0"

dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0 # Cliente HTTP hacia tu API en Azure
  provider: ^6.1.1 # Estado reactivo
  intl: ^0.19.0 # Formato de fechas y moneda (USD)
  qr_flutter: ^4.1.0 # Código QR del voucher
  uuid: ^4.3.3 # X-Correlation-Id e Idempotency-Key
  shared_preferences: ^2.2.2 # Persistencia ligera (sesión, email del cliente)

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
```

> [!WARNING]
> **Permiso de Internet en el APK de release.** La plantilla de Flutter solo declara `INTERNET` en los manifiestos de *debug* y *profile*: la app funciona en el emulador y el **APK de entrega no puede llamar a la API**. Agrega en `android/app/src/main/AndroidManifest.xml`, dentro de `<manifest>` y antes de `<application>`:
> ```xml
> <uses-permission android:name="android.permission.INTERNET"/>
> ```

---

## 4. Arquitectura de Código Recomendada

```text
lib/
├── main.dart                     # MaterialApp, tema y rutas
├── config/
│   └── api_config.dart           # URL base (--dart-define=API_URL=...)
├── models/
│   ├── json_utils.dart           # Helpers tolerantes (texto, número, lista)
│   ├── servicio_item.dart        # Servicio (Atracción, Auto, Hotel o Vuelo)
│   └── reserva_item.dart         # Reserva con fecha, estado y regla de cancelación
├── services/
│   └── api_service.dart          # HTTP centralizado: cabeceras, timeouts, errores RFC 7807
├── providers/
│   └── app_state_provider.dart   # Catálogo, reservas, loading y error
└── screens/
    ├── catalogo_screen.dart      # Lista + Pull-to-Refresh + estados vacío/error
    ├── detalle_screen.dart       # Selector de fechas/turnos y "Reservar"
    ├── mis_reservas_screen.dart  # Historial y cancelación
    └── voucher_qr_screen.dart    # QR para check-in
```

### 4.1 Modelado Resiliente y Deserialización Polimórfica (`fromJson`)

Los microservicios de los socios no comparten nombres ni tipos: `id` vs `_id` vs `auto_id`, precios como `45`, `"45.00"` o `{ "total": 45 }`, fotos como lista de textos, lista de objetos `{ "url": ... }` o un texto suelto. **Un cast directo (`as int`, `as num`, `as List`) lanza excepción en tiempo de ejecución** y deja la pantalla en blanco. Usa estos helpers, que nunca lanzan:

```dart
// lib/models/json_utils.dart

/// Primer valor no vacío entre [keys], como texto. Ignora mapas y listas.
String? firstString(Map<String, dynamic> json, List<String> keys) {
  for (final k in keys) {
    final v = json[k];
    if (v == null || v is Map || v is List) continue;
    final s = v.toString().trim();
    if (s.isNotEmpty) return s;
  }
  return null;
}

/// Número desde 45, 45.5, "45.00", "$1,250.50" o {total|amount|adult|value: ...}.
/// Devuelve null si no se puede interpretar (NUNCA un valor inventado).
double? toDouble(dynamic v) {
  if (v == null || v is bool) return null;
  if (v is num) return v.toDouble();
  if (v is String) {
    final limpio = v.replaceAll(RegExp(r'[^0-9.\-]'), '');
    return double.tryParse(limpio);
  }
  if (v is Map) {
    for (final k in const ['total', 'amount', 'adult', 'value', 'precio', 'price']) {
      final r = toDouble(v[k]);
      if (r != null) return r;
    }
  }
  return null;
}

int? toInt(dynamic v) => toDouble(v)?.round();

/// Lista de elementos desde `[...]`, `{data: [...]}`, `{items: [...]}` o `{results: [...]}`.
List<Map<String, dynamic>> extraerLista(dynamic decoded) {
  dynamic lista = decoded;
  if (decoded is Map) {
    lista = decoded['data'] ?? decoded['items'] ?? decoded['results'] ?? decoded['content'];
  }
  if (lista is! List) return const [];
  return lista.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
}
```

```dart
// lib/models/servicio_item.dart
import 'json_utils.dart';

class ServicioItem {
  final String id;
  final String nombre;
  final double? precio; // null = "Precio no disponible" (no se inventa)
  final String? imagenUrl;
  final int? cuposDisponibles; // null = el socio no informa aforo
  final String? proveedor;

  const ServicioItem({
    required this.id,
    required this.nombre,
    this.precio,
    this.imagenUrl,
    this.cuposDisponibles,
    this.proveedor,
  });

  factory ServicioItem.fromJson(Map<String, dynamic> json) {
    // 1. Identificador tolerante (numérico o texto)
    final id = firstString(json, const [
          'id', '_id', 'auto_id', 'vehicle_id', 'vehiculo_id',
          'alojamiento_id', 'atraccion_id', 'offer_id', 'offerId', 'vuelo_id',
        ]) ??
        '';

    // 2. Precio tolerante (número, texto u objeto)
    final precio = toDouble(json['precio'] ?? json['price'] ?? json['precio_diario'] ??
        json['precio_por_noche'] ?? json['precio_por_dia'] ?? json['tarifa']);

    // 3. Foto: lista de textos, lista de objetos {url} o campo directo
    String? foto;
    final fotos = json['photos'] ?? json['fotos'] ?? json['imagenes'];
    if (fotos is List && fotos.isNotEmpty) {
      final primera = fotos.first;
      foto = primera is Map ? primera['url']?.toString() : primera?.toString();
    }
    foto ??= firstString(json, const ['foto_url', 'imagen_url', 'image_url', 'imagen', 'image']);

    // 4. Proveedor: objeto {nombre|name} o texto plano
    final prov = json['proveedor'];
    final proveedor = prov is Map
        ? firstString(Map<String, dynamic>.from(prov), const ['nombre', 'name'])
        : firstString(json, const ['proveedor', 'proveedor_nombre', 'company']);

    return ServicioItem(
      id: id,
      nombre: firstString(json, const ['nombre', 'name', 'titulo', 'title', 'vehiculo', 'modelo']) ?? 'Servicio sin nombre',
      precio: precio != null && precio > 0 ? precio : null,
      imagenUrl: (foto != null && foto.startsWith('http')) ? foto : null,
      cuposDisponibles: toInt(json['cupos_disponibles'] ?? json['cupos'] ?? json['stock'] ?? json['available_spots']),
      proveedor: proveedor,
    );
  }
}
```

> [!NOTE]
> Si un ítem trae un campo con un nombre que no está en estas listas, **agrega el nombre a la lista** del helper; nunca descartes el ítem ni lo reemplaces por un mock.

---

## 5. Implementación de Servicios y Conectividad HTTP

`lib/config/api_config.dart` toma la URL en tiempo de compilación, para no editar código al cambiar de entorno:

```dart
class ApiConfig {
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://tu-api-desplegada.azurewebsites.net/api/v3', // ← tu URL real de Azure
  );
  static const Duration timeoutLectura = Duration(seconds: 20);
  static const Duration timeoutReserva = Duration(seconds: 45); // reservas y cancelaciones
}
```

`lib/services/api_service.dart` centraliza cabeceras, timeouts y errores (los backends NestJS/Express suelen responder con ProblemDetails RFC 7807: `{ title, detail, status }`):

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';
import '../config/api_config.dart';
import '../models/json_utils.dart';
import '../models/servicio_item.dart';

class ApiException implements Exception {
  final int status;
  final String mensaje;
  ApiException(this.status, this.mensaje);
  @override
  String toString() => mensaje;
}

class ApiService {
  static const _uuid = Uuid();

  static Map<String, String> _headers({String? idempotencyKey}) => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Correlation-Id': _uuid.v4(),
        if (idempotencyKey != null) 'Idempotency-Key': idempotencyKey,
      };

  static dynamic _decodificar(http.Response res) {
    final body = utf8.decode(res.bodyBytes);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return body.isEmpty ? null : jsonDecode(body);
    }
    String mensaje = 'Error del servidor (HTTP ${res.statusCode}).';
    try {
      final d = jsonDecode(body);
      if (d is Map) mensaje = (d['detail'] ?? d['message'] ?? d['title'] ?? mensaje).toString();
    } catch (_) {}
    throw ApiException(res.statusCode, mensaje);
  }

  /// Catálogo. Lanza ApiException o TimeoutException: la PANTALLA decide qué mostrar.
  static Future<List<ServicioItem>> getCatalogo() async {
    final res = await http
        .get(Uri.parse('${ApiConfig.baseUrl}/catalogo'), headers: _headers()) // ← ruta real (§2.1)
        .timeout(ApiConfig.timeoutLectura);
    final items = <ServicioItem>[];
    for (final json in extraerLista(_decodificar(res))) {
      try {
        items.add(ServicioItem.fromJson(json));
      } catch (_) {
        // Un ítem malformado no tumba todo el catálogo.
      }
    }
    return items;
  }

  /// Reserva atómica. [idempotencyKey] la genera la pantalla UNA vez por intento
  /// y la reutiliza en los reintentos (ver §5.1).
  static Future<Map<String, dynamic>> crearReserva(Map<String, dynamic> payload, {required String idempotencyKey}) async {
    final res = await http
        .post(
          Uri.parse('${ApiConfig.baseUrl}/reservas'), // ← ruta real (§2.1)
          headers: _headers(idempotencyKey: idempotencyKey),
          body: jsonEncode(payload),
        )
        .timeout(ApiConfig.timeoutReserva);
    final d = _decodificar(res);
    return d is Map ? Map<String, dynamic>.from(d) : <String, dynamic>{};
  }

  static Future<void> cancelarReserva(String reservaId, {required String motivo, required String idempotencyKey}) async {
    final res = await http
        .post(
          Uri.parse('${ApiConfig.baseUrl}/reservas/${Uri.encodeComponent(reservaId)}/cancel'), // ← ruta real (§2.1)
          headers: _headers(idempotencyKey: idempotencyKey),
          body: jsonEncode({'reason': motivo}),
        )
        .timeout(ApiConfig.timeoutReserva);
    _decodificar(res);
  }
}
```

### 5.1 Uso correcto de la `Idempotency-Key`

> [!IMPORTANT]
> La clave identifica **una intención de compra**, no una petición HTTP. Genérala **una vez** cuando el usuario abre la confirmación y **reutilízala** si reintenta tras un timeout o un error de red: así el backend devuelve la misma reserva en vez de crear dos (y no descuenta dos cupos). Genera una nueva solo cuando la reserva terminó con éxito o el usuario cambia los datos (fecha, turno, cantidades).

```dart
class _ConfirmarReservaState extends State<ConfirmarReserva> {
  final String _idempotencyKey = const Uuid().v4(); // una por apertura de la pantalla
  bool _enviando = false;
  String? _error;

  Future<void> _confirmar() async {
    if (_enviando) return; // evita el doble clic
    setState(() { _enviando = true; _error = null; });
    try {
      final reserva = await ApiService.crearReserva(widget.payload, idempotencyKey: _idempotencyKey);
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => VoucherQrScreen(reserva: reserva)));
    } catch (e) {
      setState(() => _error = e is ApiException ? e.mensaje : 'No se pudo confirmar. Reintenta: no se duplicará tu reserva.');
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }
  // build(): muestra _error y un botón "Confirmar" deshabilitado mientras _enviando.
}
```

### 5.2 Autenticación, Supabase y URLs vigentes (si tu API protege rutas)

> [!WARNING]
> - **URL y variables vigentes:** toma la URL HTTPS actual de tu API en Azure (no uses URLs viejas de pruebas o servidores obsoletos en Render). Recuerda que los archivos `.env` no se suben a GitHub: revisa las variables vigentes de tu despliegue web.
> - **Ante un `401 Unauthorized`, NO toques el backend:** queda prohibido desactivar guards/middlewares de autenticación en el servidor. Implementa el login en Flutter o envía `Authorization: Bearer <token>` en `_headers(...)`.
> - **PROHIBIDO usar `service_role` o secretos en móvil:** un APK se puede decompilar. Si tu app usa Supabase Auth, usa **solo** `SUPABASE_URL` y `ANON_KEY` vigentes de tu web de producción (nunca `service_role` ni secretos de BD).

---

## 6. Reglas de Negocio Esenciales en la App Móvil

### A. Regla de Cancelación (24 h)
- El **backend decide** si una cancelación procede; la app solo **refleja** la regla para no ofrecer un botón que fallará. Usa la misma ventana que tu backend (24 h en el RDA2, salvo que tu política diga otra cosa) y, si el backend rechaza igualmente, muestra su mensaje (`detail`).
  ```dart
  bool puedeCancelar(DateTime fechaServicio, {int horasMinimas = 24}) {
    return fechaServicio.difference(DateTime.now()).inHours >= horasMinimas;
  }
  ```

### B. Voucher con Código QR para Check-in
- El contenido del QR es el **identificador real** que devolvió tu backend (código/PNR), no uno inventado:
  ```dart
  QrImageView(
    data: 'BOOKING-RESERVA:${reserva.codigo}',
    version: QrVersions.auto,
    size: 220,
  )
  ```

### C. Refresco Inmediato tras Cancelar (Anti-Stale State)
- Si el backend confirma la cancelación, actualiza la reserva a `CANCELADA` en el estado (`setState` / `notifyListeners`) **y** recarga la lista desde la API para mostrar lo que el servidor registró.

### D. Sincronización en Vivo y Pull-to-Refresh

Pantalla completa del catálogo con los cuatro estados (cargando, error, vacío, datos), **Pull-to-Refresh** y sondeo silencioso cada 12 s. Nota: `RefreshIndicator` solo funciona si su hijo es desplazable, por eso los estados vacío y error también van dentro de un `ListView` con `AlwaysScrollableScrollPhysics`.

```dart
import 'dart:async';
import 'package:flutter/material.dart';
import '../models/servicio_item.dart';
import '../services/api_service.dart';

class CatalogoScreen extends StatefulWidget {
  const CatalogoScreen({super.key});
  @override
  State<CatalogoScreen> createState() => _CatalogoScreenState();
}

class _CatalogoScreenState extends State<CatalogoScreen> {
  List<ServicioItem> _items = [];
  bool _cargando = true;
  bool _enCurso = false;
  String? _error;
  Timer? _sondeo;

  @override
  void initState() {
    super.initState();
    _cargar();
    // Sondeo silencioso: refleja lo que se crea en Azure sin recargar la app.
    _sondeo = Timer.periodic(const Duration(seconds: 12), (_) => _cargar(silencioso: true));
  }

  @override
  void dispose() {
    _sondeo?.cancel(); // sin esto el Timer sigue llamando a la API tras salir
    super.dispose();
  }

  Future<void> _cargar({bool silencioso = false}) async {
    if (_enCurso) return; // no solapar peticiones
    _enCurso = true;
    if (!silencioso) setState(() { _cargando = true; _error = null; });
    try {
      final items = await ApiService.getCatalogo();
      if (mounted) setState(() { _items = items; _error = null; });
    } catch (e) {
      // En el sondeo se conserva lo último real; en carga explícita se informa.
      if (mounted && !silencioso) setState(() => _error = 'No se pudo cargar el catálogo. $e');
    } finally {
      _enCurso = false;
      if (mounted && !silencioso) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catálogo'),
        actions: [
          TextButton(onPressed: () => Navigator.pushNamed(context, '/mis-reservas'), child: const Text('Mis Reservas')),
        ],
      ),
      body: _cargando && _items.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _cargar,
              child: ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(),
                itemCount: _items.isEmpty ? 1 : _items.length,
                itemBuilder: (context, i) {
                  if (_items.isEmpty) return _EstadoVacio(error: _error, onReintentar: _cargar);
                  final s = _items[i];
                  return ListTile(
                    leading: s.imagenUrl != null
                        ? Image.network(s.imagenUrl!, width: 56, height: 56, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(Icons.image_not_supported))
                        : const Icon(Icons.image_not_supported),
                    title: Text(s.nombre),
                    subtitle: Text(s.precio != null ? 'US\$ ${s.precio!.toStringAsFixed(2)}' : 'Precio no disponible'),
                    onTap: () => Navigator.pushNamed(context, '/detalle', arguments: s),
                  );
                },
              ),
            ),
    );
  }
}

class _EstadoVacio extends StatelessWidget {
  final String? error;
  final Future<void> Function() onReintentar;
  const _EstadoVacio({required this.error, required this.onReintentar});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(children: [
        Icon(error != null ? Icons.cloud_off : Icons.inventory_2_outlined, size: 48),
        const SizedBox(height: 12),
        Text(error ?? 'No hay servicios disponibles en este momento.', textAlign: TextAlign.center),
        const SizedBox(height: 12),
        FilledButton(onPressed: onReintentar, child: const Text('Reintentar')),
      ]),
    );
  }
}
```

---

## 7. Instrucciones Específicas por Tipo de Socio

> [!NOTE]
> Los nombres de campo de cada vertical salen de **tu** backend (§2.1). Las listas de opciones (tipos de habitación, clases, categorías) se obtienen de la API; **no** se escriben a mano en la app.

### 🎭 Si eres Socio de ATRACCIONES (Gloria, Dilan, Michael, Ariel, Alisson)
- **Turnos (`time_slots`) y aforo:** al elegir fecha (`showDatePicker`, sin fechas pasadas) consulta la ruta de disponibilidad de tu backend y pinta un `ChoiceChip` por turno con su **aforo restante** (`"10:00 · 6 cupos"`). Turno con 0 cupos o estado `AGOTADO` → chip deshabilitado. Refresca los turnos cada 10–12 s mientras la pantalla esté abierta.
- **Tickets por edad:** contadores `−/+` independientes (Adulto, Niño; y Tercera Edad/Infante si tu API los admite) con al menos 1 adulto, y **suma total ≤ aforo del turno**. Total = Σ (cantidad × precio de su categoría).
- **Tarifa única:** si tu API no distingue edades, muestra **un solo** contador "Personas (Entrada General)" y envía el total como adultos.

### 🚗 Si eres Socio de AUTOS (Esteban / Mateo — RutaLibre Autos)
- **Rango fecha/hora:** retiro y devolución con `showDatePicker` + `showTimePicker`; la devolución debe ser **posterior** al retiro.
- **Días y tarifa automáticos:** `dias = max(1, ceil(horas / 24))` y `total = dias × precio_diario` (más los recargos que tu API devuelva). Muestra el desglose antes de confirmar.
  ```dart
  int diasRenta(DateTime retiro, DateTime devolucion) {
    final horas = devolucion.difference(retiro).inMinutes / 60;
    return horas <= 24 ? 1 : (horas / 24).ceil();
  }
  ```
- **Cooldown de 2 horas (inspección técnica):** tras cada entrega el vehículo queda 2 h en limpieza/inspección. Muestra un badge **"Disponible"** o **"En inspección técnica — disponible a las 14:30"** a partir del estado/fecha que **tu API** expone (p. ej. `estado: EN_LIMPIEZA` o una marca de fin de cooldown) y deshabilita "Reservar" mientras dure. No simules el cooldown en la app si la API no lo informa.

### 🏨 Si eres Socio de ALOJAMIENTOS
- **Check-in / Check-out:** `showDateRangePicker` sin fechas pasadas; el check-out debe ser posterior al check-in.
- **Noches:** `noches = checkOut.difference(checkIn).inDays` (mínimo 1). **Total** = noches × precio por noche del tipo elegido × habitaciones.
- **Tipo de habitación (Simple, Doble, Suite…):** selector construido con los tipos que devuelve tu API (nombre, capacidad, precio, disponibilidad). Tipo sin disponibilidad → deshabilitado.

### ✈️ Si eres Socio de VUELOS
- **Origen/Destino:** selectores de códigos IATA con validación **origen ≠ destino**.
- **Pasajeros:** contadores con al menos 1 adulto y bebés ≤ adultos.
- **Clase (Económica / Ejecutiva):** solo las clases con disponibilidad que traiga la oferta.
- **Badge de estado:** mapea el estado de tu API a un `Chip` de color: `SCHEDULED/ON_TIME` → "A tiempo" (verde), `DELAYED` → "Demorado" (ámbar), `IN_FLIGHT/DEPARTED` → "En vuelo" (azul), `CANCELLED` → "Cancelado" (rojo); un estado desconocido se muestra tal cual.

---

## 8. Comandos para Verificar y Compilar el APK

> [!NOTE]
> **Windows (PowerShell 5.1):** ejecuta **un comando por línea**. No uses `&&` (en PowerShell 5.1 es un error de sintaxis); si necesitas encadenar, usa `;`.

```powershell
# 1. Entrar a la carpeta de la app
cd mobile_flutter

# 2. Descargar paquetes
flutter pub get

# 3. Verificación estática OBLIGATORIA: debe terminar sin errores antes de compilar
flutter analyze

# 4. Probar en el navegador (Chrome)
flutter run -d chrome --dart-define=API_URL=https://tu-api-desplegada.azurewebsites.net/api/v3

# 5. Probar en el celular o emulador Android
flutter run --dart-define=API_URL=https://tu-api-desplegada.azurewebsites.net/api/v3

# 6. APK de producción para la entrega
flutter build apk --release --dart-define=API_URL=https://tu-api-desplegada.azurewebsites.net/api/v3
```

*El APK queda en:* `build/app/outputs/flutter-apk/app-release.apk`. Instálalo en un celular real y confirma que el catálogo carga (si no carga, revisa el permiso `INTERNET` de §3).

---

## 9. Prompt Copy-Paste para tu Agente de IA

> [!IMPORTANT]
> **Copia o adjunta el archivo `.md` completo, no solo este recuadro.** Así tu agente podrá consultar las secciones **§2.1** (descubrimiento de rutas reales), **§4.1** (helpers `fromJson` tolerantes), **§5** (`ApiService` e `Idempotency-Key`), **§6.D** (`CatalogoScreen` completo) y **§7** (reglas de tu vertical).

```text
Hola agente. Trabajamos en el Reto 3 (RDA3) de Integración de Sistemas. Framework asignado: FLUTTER (Dart).
Vas a construir una app móvil que es SOLO un cliente HTTP de nuestra API ya desplegada en Azure.

REGLA DE ORO (NO NEGOCIABLE):
1. NO modifiques, formatees ni "arregles" NINGÚN archivo del backend (controladores, rutas, DTOs, entidades, migraciones, .env, Dockerfile, scripts de Azure). No despliegues nada. El backend y sus contratos OpenAPI ya están aprobados con Booking Central (RDA2); cualquier cambio rompe la integración.
2. NO inventes endpoints. Primero LEE (sin editar) el backend del repositorio y escríbeme una tabla con las rutas reales para: listar catálogo, detalle, disponibilidad, crear reserva, listar mis reservas y cancelar (método, ruta, body, forma de la respuesta). Usa solo esas rutas.
3. Crea la app en una carpeta nueva 'mobile_flutter' en la raíz. La URL base se pasa con --dart-define=API_URL.

PROHIBIDO:
- Carrito de compras (CartProvider, CartItem, CartService, pantallas de carrito). Cada reserva es individual y directa: un POST con cabecera 'Idempotency-Key' (UUIDv4) y timeout de 45 s. La clave se genera UNA vez por intento y se reutiliza en los reintentos.
- Mocks o datos inventados: nada de listas falsas en un catch, ni precio/cupos por defecto. Si la API devuelve [] muestra "No hay servicios disponibles" con botón Reintentar; si falla, muestra el error con Reintentar.
- Consola de administración, dashboards, métricas o CRUD de inventario. La app es solo para el cliente final.
- BottomNavigationBar o botones de secciones inexistentes. Navegación: Catálogo → Detalle → Voucher, y "Mis Reservas" en la AppBar.
- Desactivar la autenticación del backend ante un 401 o incrustar claves privadas (service_role, secretos). Usa la URL HTTPS vigente en Azure y, si tu API exige login/Supabase, usa la ANON_KEY vigente de tu web y envía 'Authorization: Bearer <token>'.

OBLIGATORIO:
- fromJson tolerante sin casts directos: ids ('id','_id','auto_id','vehicle_id','alojamiento_id','atraccion_id','offer_id'), precios (número, texto u objeto {total|amount}), fotos (lista de textos, lista de {url} o texto) y respuestas [ ] o {data:[ ]}. Un ítem malformado no debe tumbar la lista.
- Cabeceras 'Content-Type' y 'Accept' application/json y 'X-Correlation-Id' en cada petición; errores mostrando 'detail' del ProblemDetails.
- Catálogo con RefreshIndicator (también en estados vacío y error) y sondeo silencioso cada 12 s que se cancela en dispose y no borra los datos si falla.
- Mis Reservas: cancelación solo si faltan >= 24 h (el backend tiene la última palabra) y refresco inmediato del estado.
- Voucher con qr_flutter usando el código real devuelto por la API.
- Permiso <uses-permission android:name="android.permission.INTERNET"/> en android/app/src/main/AndroidManifest.xml.
- Sigue la implementación de referencia de las secciones 2.1, 4.1, 5, 6.D y las reglas de mi vertical de la sección 7 de la guía.

ENTREGA: 'flutter analyze' sin errores y 'flutter build apk --release' generado. En Windows PowerShell no uses '&&': un comando por línea.
```

---

## 10. Checklist de Aceptación (revísalo antes de entregar)

- [ ] `git status` no muestra cambios fuera de `mobile_flutter/` (el backend está intacto).
- [ ] La tabla de §2.1 está completa y la app usa solo esas rutas.
- [ ] Con la API devolviendo `[]` se ve el estado vacío con **Reintentar** (no datos falsos).
- [ ] Un ítem creado en Azure aparece en la app sin reinstalarla (pull-to-refresh o sondeo).
- [ ] Un doble toque en "Confirmar" crea **una sola** reserva.
- [ ] No existe ningún archivo, clase o pantalla de carrito ni de administración.
- [ ] `flutter analyze` termina sin errores y el APK de release carga datos en un celular real.
