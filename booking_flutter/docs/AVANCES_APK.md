# Avances hacia el APK (rama `flutter-apk-completar`)

Parte de `feat/flutter-paridad-frontend` (PR #281). No cambia el backend, la web ni los contratos.

## Qué se hizo

| Tema | Antes | Ahora |
| --- | --- | --- |
| APK | Solo plataforma web | `android/` configurado (id `ec.booking.app`, permiso de internet, http solo en debug, firma por `key.properties`) |
| Sesión | Tokens en `SharedPreferences` (texto plano) | Almacén cifrado (`flutter_secure_storage`) y migración automática de la sesión anterior |
| Compra de vuelos | Clave de idempotencia nueva en cada intento: un reintento tras un corte podía cobrar dos veces | Una clave y un código de correlación por retención de precio (`ClaveCompra`) |
| Autos y atracciones | Igual: clave nueva en cada toque | Misma clave mientras no cambien los datos (`ClavePorContenido`) |
| Errores de compra | Mensaje sin código | Muestran "Código de soporte: corr-…" para buscar la traza en el panel de observabilidad |
| Pase de abordar | Leía `seatNumber`/`barcodeData`; el contrato v2 usa `seat`/`barcode`. Con varios pasajeros todos mostraban el pase del primero | Lee el contrato (y los nombres viejos), empareja boleto y pase por `passengerId`, muestra grupo de embarque y puerta (`gate`) si ya está asignada |
| Sin conexión | No existía | Cola cifrada (`lib/offline/`): vuelos, autos, atracciones y alojamientos se guardan con su misma clave y se envían al volver la red; aviso arriba en toda la app |
| Alojamientos | Tras un corte de red se borraba la clave y el siguiente toque podía crear otra reserva | Conserva la clave y encola la reserva |
| Telemetría | La app no enviaba eventos | `Telemetria` envía eventos de uso a `/telemetry/events` (nunca rompe la app si falla) |
| Icono | El de Flutter | Icono propio (avión sobre fondo azul) en todas las densidades, incluido el adaptable de Android |
| Administración | No existía en la app | Panel de solo lectura, OCULTO por defecto en el APK (se activa con `--dart-define=ADMIN_PANEL=true`; entonces aparece en Perfil → Administración solo para admins): Resumen (KPIs, serie, verticales, destinos), Objetivos de servicio (SLO, presupuesto de error, latencias) y Compras de vuelos con diagrama de tiempos (Gantt) y pasos por código de correlación |
| Pruebas | 35 | 96 (sesión, claves, errores, centavos, pase de abordar, cola sin conexión, telemetría, admin) |

## Cómo probar en un celular

1. Instalar Flutter y Android SDK (`flutter doctor` sin errores).
2. `flutter pub get`
3. `flutter build apk --release --dart-define=API_URL=https://booking-core-api.azurewebsites.net/api/v1`
4. Copiar `build/app/outputs/flutter-apk/app-release.apk` al celular e instalarlo.

Lista de pruebas sugerida:

- [ ] Registro e inicio de sesión; cerrar y abrir la app: la sesión sigue.
- [ ] Vuelo: buscar, bloquear precio, elegir asiento, pagar, ver pase de abordar, check-in, cancelar.
- [ ] Vuelo con 2 pasajeros: cada boleto muestra su propio asiento.
- [ ] Modo avión justo al pagar un auto o una atracción: aparece el aviso "reserva en espera"; al volver la red se envía sola y NO se cobra dos veces.
- [ ] Un error de compra muestra el código de soporte.
- [ ] (Solo si se compiló con ADMIN_PANEL=true) Con una cuenta admin aparece "Administración" en Perfil; con una cuenta normal no aparece.
- [ ] Administración: Resumen cambia de período, Objetivos muestra los SLO, Compras abre el diagrama de tiempos de una compra.

## Lo que falta (no se hizo en esta rama)

- **Probar en un celular real.** Aquí no hay Android SDK: se verificó con `flutter analyze` (sin errores), 96 pruebas y una compilación web completa, pero el APK no se compiló.
- **Admin:** solo lectura (no hay gestión de usuarios, proveedores ni finanzas). La lista de correos admin está duplicada de la web; el que manda es el servidor (responde 403 a quien no lo es). Las compras agrupan por código de correlación sin la post-venta por PNR de la web.
- **Mis Reservas:** la pantalla web tiene 2.857 líneas y la de Flutter 410. Hay que comparar función por función (cancelación con cotización, equipaje, boletos, facturas por vertical).
- **Idiomas:** descartado por ahora; la app queda solo en español.
- **Supabase:** la app apunta al proyecto nuevo (`icpxceybcqkmkjuahkam`); los usuarios del proyecto viejo no existen ahí salvo que se migren. Se cambia con `--dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…`.
- **Firma con la llave real de entrega** (`android/key.properties`); hoy el release se firma con la de depuración.
- **Vuelos con socios reales:** probar con cada aerolínea, incluida la clase ejecutiva de GabatAIR que hoy falla de su lado.
- **Notificaciones push, biometría y enlaces profundos:** mejoras opcionales.
- La clave y la cola de reservas no cambian el servidor: si un socio no respeta `Idempotency-Key`, el reintento podría duplicarse. Conviene confirmarlo con cada socio.
