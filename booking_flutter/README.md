# Booking Mobile Flutter — Marketplace Turístico (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Proyecto:** Booking Central (Reto 3 - RDA3)  
> **Framework:** Flutter (Dart)  
> **Objetivo:** Experiencia móvil unificada para turistas y clientes de Booking Central (Atracciones, Autos, Alojamientos y Vuelos).

---

## 1. Arquitectura de la Aplicación

La aplicación implementa una arquitectura limpia por capas:
- **`lib/config/`**: Configuración de entorno y URLs de API hacia Booking Central (Azure en producción y localhost para desarrollo).
- **`lib/models/`**: DTOs fuertemente tipados en Dart mapeados desde los contratos OpenAPI v3 (`Atraccion`, `TimeSlot`, `Auto`, `Alojamiento`, `Vuelo`, `Reserva`, `CartItem`).
- **`lib/services/`**: Clientes HTTP con inyección automática de cabeceras de trazabilidad (`X-Correlation-Id`, `Idempotency-Key`).
- **`lib/providers/`**: Gestión de estado reactivo mediante Provider (`CartProvider`, `AuthProvider`).
- **`lib/screens/`**: Las vistas canónicas del marketplace móvil:
  * `main_shell.dart`: Barra de navegación inferior (BottomNavigationBar).
  * `catalogo/`: Exploración multivertical (Tours, Autos, Hoteles, Vuelos).
  * `detalle/`: Fichas adaptativas con selector de turnos/cupos en vivo, coberturas, etc.
  * `checkout/`: Carrito y checkout transaccional con desglose de IVA 15%.
  * `reservas/`: Mis Reservas con vouchers QR vectoriales y bloqueo de cancelación < 24h.
  * `vuelos/`: Estado de vuelos en vivo.
  * `perfil/`: Sesión de usuario, facturas SRI y configuración.

---

## 2. Instrucciones de Compilación y Ejecución

### Prerrequisitos
- Flutter SDK (versión >= 3.0.0).
- Android SDK / Android Studio (para generar el APK).
- Google Chrome (para probar en modo Web).

### Ejecución en Modo Desarrollo (Navegador Chrome)
```bash
flutter run -d chrome
```

### Ejecución en Emulador o Dispositivo Android Físico
```bash
flutter run
```

### Compilar el Instalador APK de Producción
```bash
flutter build apk --release
```
El archivo resultante queda ubicado en:
`build/app/outputs/flutter-apk/app-release.apk`

