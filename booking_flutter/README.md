# Booking Flutter — Marketplace Turístico (RDA3)

> **Asignatura:** Integración de Sistemas
> **Proyecto:** Booking Central (Reto 3 - RDA3)
> **Framework:** Flutter (Dart) — objetivo principal: **Flutter Web** responsivo
> **Fuente de verdad:** `frontend/` (React + Vite). Esta app replica 1:1 su diseño, flujos y contratos.

---

## 1. Arquitectura

- **`lib/config/`** — `ApiConfig`: URL del API Gateway (`String.fromEnvironment('API_URL')`, Azure en release, `localhost:3000` en desarrollo) y timeouts (30 s, Saga 45 s, reserva de vuelos 90 s).
- **`lib/models/`** — `Alojamiento`, `Atraccion`/`TimeSlot`, `Auto`, `Vuelo`, `Reserva`. Todos los `fromJson` son tolerantes a las variaciones de los nodos socios.
- **`lib/utils/json_parse.dart`** — parsing que nunca lanza excepción: precios `45`, `"45.00"`, `"$1,250.50"`, `{ total: 45 }`, `{ amount: "45.00" }`; booleanos `true`/`"true"`/`1`/`"sí"`; listas `[...]`, `{data:[...]}`, `{items:[...]}`.
- **`lib/services/`** — `ApiClient` (errores RFC 7807, `Idempotency-Key`, `X-Correlation-Id`, `X-Device-Fingerprint`) y `BookingServices` (4 verticales + Mis Reservas).
- **`lib/providers/`** — `AuthProvider` (sesión) y `CurrencyProvider` (moneda).
- **`lib/screens/`** — `main_shell.dart` (chatbot flotante + banner de cookies), `catalogo/home_screen.dart` (landing de las 4 verticales con buscador amarillo), `search/`, `detalle/`, `reservas/`, `vuelos/`, `perfil/`, `auth/`, `info/`.
- **`lib/widgets/`** — cabecera, footer, chatbot, modal de reserva directa, selectores de ocupación y pasajeros.

### Reglas de paridad con `frontend/`

- **Sin carrito de compras**: cada vertical tiene su checkout directo con idempotencia (`DirectBookingModal`).
- **Sin barra de navegación inferior**: la navegación es la cabecera superior adaptable, igual que `Navbar.jsx`.
- **Sin datos simulados que oculten a los socios**: si una API falla, la pantalla muestra el error (o conserva lo último recibido en los sondeos silenciosos); nunca lo reemplaza por datos de ejemplo.
- **Sondeo en vivo** con la cadencia de React: alojamientos 5 s, atracciones 8 s, turnos de una atracción 4 s.
- El panel `/admin` **no** se migra.

---

## 2. Compilación y ejecución

Prerrequisito: Flutter SDK estable (Dart >= 3.0).

```bash
flutter pub get
```

```bash
flutter run -d chrome
```

Build de producción (apunta al API Gateway de Azure):

```bash
flutter build web --release
```

Apuntar a otro gateway:

```bash
flutter build web --release --dart-define=API_URL=http://localhost:3000/api/v1
```

El resultado queda en `build/web/`. Solo la plataforma **web** está configurada; para Android o iOS ejecutar antes `flutter create . --platforms=android,ios`.

---

## 3. Verificación

```bash
flutter analyze
```

```bash
flutter test
```

Desde la raíz del repositorio, validación rápida de sintaxis sin SDK:

```bash
node scripts/verify_dart.mjs
```
