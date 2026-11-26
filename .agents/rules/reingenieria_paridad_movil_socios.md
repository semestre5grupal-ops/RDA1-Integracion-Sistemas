# Directiva de Ingeniería Inversa y Migración Móvil B2B (Booking Central & Socios)

## 1. Principio de Verdad Absoluta (Single Source of Truth)
- El código fuente en `frontend/src/` es la única referencia canónica.
- **Queda terminantemente prohibido inventar componentes o arquitecturas no existentes** en la web (como carritos de compras tipo e-commerce tradicional, barras de navegación inferior móvil no responsivas, o botones arbitrarios en el Header).
- Las reservas en todas las verticales se procesan de forma individual y directa mediante modales con cabecera `Idempotency-Key` y timeout de 45 segundos.

## 2. Tolerancia a Esquemas Heterogéneos de Microservicios Socios
- Los modelos de datos (`fromJson` / deserializadores) de clientes móviles (Flutter, React Native, MAUI) deben soportar polimorfismo de campos:
  - **Identificadores**: Tolerar `id`, `_id`, `auto_id`, `vehicle_id`, `alojamiento_id`, `atraccion_id`, `offer_id`.
  - **Precios**: Aceptar `num`, `String` numérico y objetos anidados `{ total, adult, amount }`.
  - **Fotos**: Procesar arrays de strings, arrays de objetos `{ url }` y campos directos `foto_url`, `imagen_url`, `image_url`.
  - **Proveedores**: Soportar estructuras en objeto `{ name, nombre, rating }` o texto plano `proveedor_nombre`, `company`.
- Nunca descartar un ítem ni forzar un mock estático cuando los campos vengan con nombres alternativos.

## 3. Prohibición de Mocks que Enmascaren Datos Reales
- En llamadas de catálogo y búsqueda, nunca devolver listas fijas hardcodeadas como fallback permanente si la API responde vacía o falla transitoriamente.
- Las aplicaciones deben mostrar el estado real retornado por Azure para permitir auditorías y pruebas de cátedra en vivo.

## 4. Sincronización Dinámica en Vivo (Live Polling)
- Incorporar sondeo silencioso periódico (10-12s) en segundo plano para catálogos y resultados de búsqueda, replicando el comportamiento de `frontend/` sin interrumpir la experiencia del usuario.

## 5. Verificación Estática Pre-Commit Obligatoria
- Antes de commitear o desplegar cualquier cambio móvil:
  - Ejecutar `node scripts/verify_dart.mjs` en Flutter para asegurar balance sintáctico.
  - Verificar que no existan imports huérfanos ni discordancias de parámetros nombrados en constructores.

## 6. Convenciones de Shell en Windows
- En PowerShell 5.1, no usar `&&`. Encadenar con `;` o comandos independientes.
