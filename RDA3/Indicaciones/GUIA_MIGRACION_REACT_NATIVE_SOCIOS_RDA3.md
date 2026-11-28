# ⚛️ Guía Oficial de Migración Móvil en REACT NATIVE para Socios B2B (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Plataforma Integradora:** Booking Central  
> **Framework Asignado:** **React Native (Expo + TypeScript)**  
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
> 1. **🚫 PROHIBIDO EL CARRITO DE COMPRAS (Cart / Basket):** La integración B2B con Booking Central opera **solo con reservas atómicas individuales y directas**: el usuario confirma **una** reserva y la app hace **un** `POST` a la ruta de reservas de tu backend, con cabecera `Idempotency-Key` (UUIDv4) y timeout de **45 segundos**. No existen `CartContext`, `CartProvider`, `useCart`, `CartService`, `CartScreen`, "Agregar al carrito" ni checkout multi-ítem. Un carrito rompe la orquestación transaccional y la sincronización de inventario.
> 2. **🚫 PROHIBIDO USAR MOCKS ESTÁTICOS:** Nunca devuelvas arrays falsos desde un `catch` ni como "respaldo" cuando la API responde `[]`. La app debe reflejar **en vivo** lo que existe en Azure: los profesores crearán datos durante la evaluación y deben verlos aparecer. Si la API devuelve `[]` → estado visual **"No hay servicios disponibles"** con botón **Reintentar**. Si falla → mensaje de error con **Reintentar**. Esto incluye **valores inventados**: no rellenes un precio ausente con `25` ni un aforo ausente con `10`; muestra "Precio no disponible" / oculta el dato.
> 3. **🚫 PROHIBIDO MIGRAR LA CONSOLA DE ADMINISTRACIÓN:** Cero dashboards, métricas, gestión de proveedores, CRUD de inventario o pantallas de "crear/editar servicio". Solo flujos del cliente final: explorar, ver detalle, reservar, ver/cancelar sus reservas y mostrar su voucher.
> 4. **🚫 PROHIBIDO INVENTAR NAVEGACIÓN:** No agregues una barra de pestañas inferior (`@react-navigation/bottom-tabs`) ni botones con secciones que no existen ("Facturas", "Admin", "Ofertas"…). Navegación mínima con **native-stack**: **Catálogo → Detalle → Confirmación/Voucher**, con un acceso a **"Mis Reservas"** en la cabecera.

---

## 2. Ubicación y Aislamiento en tu Repositorio

1. Crea una carpeta dedicada en la raíz de tu repositorio, por ejemplo `mobile_react_native/`. **No** muevas ni renombres nada del backend.
2. Agrega un `.gitignore` dentro de esa carpeta:
   ```gitignore
   node_modules/
   .expo/
   dist/
   android/
   ios/
   npm-debug.*
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

## 3. Configuración Inicial del Proyecto (Expo)

Expo evita configurar Android Studio para desarrollar. Ejecuta **un comando por línea** (en PowerShell 5.1 no uses `&&`):

```powershell
# 1. Crear el proyecto Expo con TypeScript
npx create-expo-app mobile_react_native --template blank-typescript

# 2. Entrar a la carpeta
cd mobile_react_native

# 3. Navegación (solo stack: sin barra de pestañas inferior)
npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context

# 4. QR, selector de fecha/hora y UUID nativo (expo-crypto evita el polyfill de 'uuid')
npx expo install react-native-svg react-native-qrcode-svg @react-native-community/datetimepicker expo-crypto

# 5. Cliente HTTP
npm install axios
```

> [!NOTE]
> Usa `npx expo install` (no `npm install`) para los paquetes nativos: elige la versión compatible con tu SDK de Expo. Para los UUID usa `Crypto.randomUUID()` de `expo-crypto`; el paquete `uuid` por sí solo falla en React Native con *"crypto.getRandomValues() not supported"*.

---

## 4. Arquitectura de Código Recomendada

```text
mobile_react_native/
├── App.tsx                       # NavigationContainer + stack
├── app.json / eas.json
└── src/
    ├── config.ts                 # URL base (EXPO_PUBLIC_API_URL)
    ├── api/
    │   └── client.ts             # Axios: cabeceras, timeouts, errores RFC 7807
    ├── types/
    │   └── index.ts              # Interfaces + normalizadores tolerantes
    ├── navigation/
    │   └── AppNavigator.tsx      # Stack: Catalogo, Detalle, Confirmacion, MisReservas, Voucher
    └── screens/
        ├── CatalogoScreen.tsx    # FlatList + RefreshControl + estados vacío/error
        ├── DetalleScreen.tsx     # Selector de fechas/turnos y "Reservar"
        ├── MisReservasScreen.tsx # Historial y cancelación
        └── VoucherQrScreen.tsx   # QR para check-in
```

### 4.1 Modelado Resiliente y Deserialización Polimórfica (`normalizarServicioItem`)

Los microservicios de los socios no comparten nombres ni tipos: `id` vs `_id` vs `auto_id`, precios como `45`, `"45.00"` o `{ "total": 45 }`, fotos como lista de textos, lista de objetos `{ "url": ... }` o un texto suelto. TypeScript **no valida en tiempo de ejecución** lo que llega del servidor: normaliza siempre en la frontera de la API con estos helpers, que nunca lanzan.

```typescript
// src/types/index.ts

export interface ServicioItem {
  id: string;
  nombre: string;
  precio: number | null; // null = "Precio no disponible" (no se inventa)
  imagenUrl: string | null;
  cuposDisponibles: number | null; // null = el socio no informa aforo
  proveedor: string | null;
}

type Json = Record<string, unknown>;

const esObjeto = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Primer valor no vacío entre `keys`, como texto. Ignora objetos y arrays. */
export function primerTexto(raw: Json, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (v === null || v === undefined || typeof v === 'object') continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/** Número desde 45, "45.00", "$1,250.50" o {total|amount|adult|value}. null si no se puede. */
export function aNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (esObjeto(v)) {
    for (const k of ['total', 'amount', 'adult', 'value', 'precio', 'price']) {
      const n = aNumero(v[k]);
      if (n !== null) return n;
    }
  }
  return null;
}

/** Array de objetos desde `[...]`, `{data: [...]}`, `{items: [...]}` o `{results: [...]}`. */
export function extraerLista(data: unknown): Json[] {
  const lista = esObjeto(data) ? (data.data ?? data.items ?? data.results ?? data.content) : data;
  return Array.isArray(lista) ? lista.filter(esObjeto) : [];
}

export function normalizarServicioItem(raw: Json): ServicioItem {
  // 1. Identificador tolerante (numérico o texto)
  const id =
    primerTexto(raw, ['id', '_id', 'auto_id', 'vehicle_id', 'vehiculo_id', 'alojamiento_id', 'atraccion_id', 'offer_id', 'offerId', 'vuelo_id']) ?? '';

  // 2. Precio tolerante (número, texto u objeto)
  const precio = aNumero(
    raw.precio ?? raw.price ?? raw.precio_diario ?? raw.precio_por_noche ?? raw.precio_por_dia ?? raw.tarifa,
  );

  // 3. Foto: lista de textos, lista de objetos {url} o campo directo
  const fotos = raw.photos ?? raw.fotos ?? raw.imagenes;
  let foto: string | null = null;
  if (Array.isArray(fotos) && fotos.length > 0) {
    const primera: unknown = fotos[0];
    foto = esObjeto(primera) ? (primerTexto(primera, ['url']) ?? null) : typeof primera === 'string' ? primera : null;
  }
  foto = foto ?? primerTexto(raw, ['foto_url', 'imagen_url', 'image_url', 'imagen', 'image']);

  // 4. Proveedor: objeto {nombre|name} o texto plano
  const prov = raw.proveedor;
  const proveedor = esObjeto(prov) ? primerTexto(prov, ['nombre', 'name']) : primerTexto(raw, ['proveedor', 'proveedor_nombre', 'company']);

  const cupos = aNumero(raw.cupos_disponibles ?? raw.cupos ?? raw.stock ?? raw.available_spots);

  return {
    id,
    nombre: primerTexto(raw, ['nombre', 'name', 'titulo', 'title', 'vehiculo', 'modelo']) ?? 'Servicio sin nombre',
    precio: precio !== null && precio > 0 ? precio : null,
    imagenUrl: foto && foto.startsWith('http') ? foto : null,
    cuposDisponibles: cupos !== null ? Math.round(cupos) : null,
    proveedor,
  };
}
```

> [!NOTE]
> Si un ítem trae un campo con un nombre que no está en estas listas, **agrega el nombre a la lista**; nunca descartes el ítem ni lo reemplaces por un mock.

---

## 5. Implementación de Servicios y Conectividad HTTP

La URL base se define sin tocar el código. Crea `.env` en `mobile_react_native/` (Expo expone las variables con prefijo `EXPO_PUBLIC_`):

```bash
EXPO_PUBLIC_API_URL=https://tu-api-desplegada.azurewebsites.net/api/v3
```

`src/api/client.ts` centraliza cabeceras, timeouts y errores (los backends NestJS/Express suelen responder con ProblemDetails RFC 7807: `{ title, detail, status }`):

```typescript
import axios, { AxiosError } from 'axios';
import * as Crypto from 'expo-crypto';
import { extraerLista, normalizarServicioItem, ServicioItem } from '../types';

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://tu-api-desplegada.azurewebsites.net/api/v3';
const TIMEOUT_LECTURA = 20_000;
const TIMEOUT_RESERVA = 45_000; // reservas y cancelaciones

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_LECTURA,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

// Trazabilidad: un X-Correlation-Id por petición. La Idempotency-Key NO se genera
// aquí: la pasa quien llama, para reutilizarla en los reintentos (ver §5.1).
apiClient.interceptors.request.use((config) => {
  config.headers.set('X-Correlation-Id', Crypto.randomUUID());
  return config;
});

/** Mensaje legible de un error: `detail` del ProblemDetails, timeout o red. */
export function mensajeDeError(e: unknown): string {
  const err = e as AxiosError<{ detail?: string; message?: string; title?: string }>;
  if (err?.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder.';
  if (err?.response?.data) {
    const d = err.response.data;
    return d.detail ?? d.message ?? d.title ?? `Error del servidor (HTTP ${err.response.status}).`;
  }
  return 'No se pudo conectar con el servidor. Revisa tu conexión.';
}

/** Catálogo. Lanza el error: la PANTALLA decide qué mostrar. */
export async function getCatalogo(): Promise<ServicioItem[]> {
  const { data } = await apiClient.get('/catalogo'); // ← ruta real (§2.1)
  return extraerLista(data).map(normalizarServicioItem);
}

/** Reserva atómica con la clave de idempotencia del intento actual. */
export async function crearReserva(payload: Record<string, unknown>, idempotencyKey: string) {
  const { data } = await apiClient.post('/reservas', payload, { // ← ruta real (§2.1)
    timeout: TIMEOUT_RESERVA,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return data;
}

export async function cancelarReserva(reservaId: string, motivo: string, idempotencyKey: string) {
  const { data } = await apiClient.post(
    `/reservas/${encodeURIComponent(reservaId)}/cancel`, // ← ruta real (§2.1)
    { reason: motivo },
    { timeout: TIMEOUT_RESERVA, headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return data;
}
```

### 5.1 Uso correcto de la `Idempotency-Key`

> [!IMPORTANT]
> La clave identifica **una intención de compra**, no una petición HTTP. Genérala **una vez** cuando el usuario abre la confirmación y **reutilízala** si reintenta tras un timeout o un error de red: así el backend devuelve la misma reserva en vez de crear dos (y no descuenta dos cupos). Genera una nueva solo cuando la reserva terminó con éxito o el usuario cambia los datos (fecha, turno, cantidades).

```tsx
import { useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { crearReserva, mensajeDeError } from '../api/client';

export function useConfirmarReserva(payload: Record<string, unknown>) {
  const claveRef = useRef(Crypto.randomUUID()); // una por apertura de la pantalla
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (enviando) return null; // evita el doble toque
    setEnviando(true);
    setError(null);
    try {
      return await crearReserva(payload, claveRef.current);
    } catch (e) {
      setError(`${mensajeDeError(e)} Reintenta: no se duplicará tu reserva.`);
      return null;
    } finally {
      setEnviando(false);
    }
  }
  return { confirmar, enviando, error };
}
```

### 5.2 Autenticación, Supabase y URLs vigentes (si tu API protege rutas)

> [!WARNING]
> - **URL y variables vigentes:** configura en `EXPO_PUBLIC_API_URL` la URL HTTPS actual de tu API en Azure (no uses URLs viejas de pruebas o servidores obsoletos en Render). Recuerda que `.env` no se sube a GitHub: verifica las variables vigentes de tu despliegue web.
> - **Ante un `401 Unauthorized`, NO toques el backend:** queda prohibido desactivar guards/middlewares de autenticación en el servidor. Implementa el login en la app o inyecta `Authorization: Bearer <token>` en el interceptor de `apiClient`.
> - **PROHIBIDO usar `service_role` o secretos en móvil:** un APK se puede decompilar. Si tu app usa Supabase Auth, usa **solo** `SUPABASE_URL` y `ANON_KEY` vigentes de tu web de producción (nunca `service_role` ni secretos de BD).

---

## 6. Reglas de Negocio Esenciales en la App Móvil

### A. Regla de Cancelación (24 h)
- El **backend decide** si una cancelación procede; la app solo **refleja** la regla para no ofrecer un botón que fallará. Usa la misma ventana que tu backend (24 h en el RDA2, salvo que tu política diga otra cosa) y, si el backend rechaza igualmente, muestra su mensaje (`mensajeDeError`).
  ```typescript
  export function puedeCancelar(fechaServicioIso: string, horasMinimas = 24): boolean {
    const fecha = new Date(fechaServicioIso).getTime();
    if (Number.isNaN(fecha)) return false; // fecha ilegible: que decida el backend
    return (fecha - Date.now()) / 3_600_000 >= horasMinimas;
  }
  ```

### B. Voucher con Código QR para Check-in
- El contenido del QR es el **identificador real** que devolvió tu backend (código/PNR), no uno inventado:
  ```tsx
  import QRCode from 'react-native-qrcode-svg';

  <View style={{ alignItems: 'center', padding: 20 }}>
    <QRCode value={`BOOKING-RESERVA:${reserva.codigo}`} size={220} color="#003580" backgroundColor="white" />
  </View>
  ```

### C. Refresco Inmediato tras Cancelar (Anti-Stale State)
- Si el backend confirma la cancelación, actualiza la reserva a `CANCELADA` con `setReservas(...)` **y** recarga la lista desde la API para mostrar lo que el servidor registró.

### D. Sincronización en Vivo y Pull-to-Refresh

Pantalla completa del catálogo con los cuatro estados (cargando, error, vacío, datos), **Pull-to-Refresh** (`FlatList` + `refreshControl`) y sondeo silencioso cada 12 s que se detiene al salir de la pantalla. El estado vacío/error va en `ListEmptyComponent` para que también se pueda deslizar para refrescar.

```tsx
// src/screens/CatalogoScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native';
import { getCatalogo, mensajeDeError } from '../api/client';
import type { ServicioItem } from '../types';

export default function CatalogoScreen({ navigation }: { navigation: any }) {
  const [items, setItems] = useState<ServicioItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enCurso = useRef(false);

  const cargar = useCallback(async (silencioso = false) => {
    if (enCurso.current) return; // no solapar peticiones
    enCurso.current = true;
    try {
      const datos = await getCatalogo();
      setItems(datos);
      setError(null);
    } catch (e) {
      // En el sondeo se conserva lo último real; en carga explícita se informa.
      if (!silencioso) setError(mensajeDeError(e));
    } finally {
      enCurso.current = false;
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(() => cargar(true), 12_000); // refleja lo que se crea en Azure
    return () => clearInterval(id); // sin esto sigue llamando a la API tras salir
  }, [cargar]);

  const onRefresh = useCallback(async () => {
    setRefrescando(true);
    try {
      await cargar();
    } finally {
      setRefrescando(false);
    }
  }, [cargar]);

  if (cargando && items.length === 0) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color="#003580" />;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item, i) => item.id || String(i)}
      contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : undefined}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} colors={['#003580']} />}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ textAlign: 'center', marginBottom: 12 }}>{error ?? 'No hay servicios disponibles en este momento.'}</Text>
          <Button title="Reintentar" onPress={() => cargar()} />
        </View>
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate('Detalle', { servicio: item })} style={{ flexDirection: 'row', padding: 12 }}>
          {item.imagenUrl ? <Image source={{ uri: item.imagenUrl }} style={{ width: 56, height: 56, marginRight: 12 }} /> : null}
          <View>
            <Text style={{ fontWeight: 'bold' }}>{item.nombre}</Text>
            <Text>{item.precio !== null ? `US$ ${item.precio.toFixed(2)}` : 'Precio no disponible'}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}
```

---

## 7. Instrucciones Específicas por Tipo de Socio

> [!NOTE]
> Los nombres de campo de cada vertical salen de **tu** backend (§2.1). Las listas de opciones (tipos de habitación, clases, categorías) se obtienen de la API; **no** se escriben a mano en la app.

### 🎭 Si eres Socio de ATRACCIONES (Gloria, Dilan, Michael, Ariel, Alisson)
- **Turnos (`time_slots`) y aforo:** al elegir fecha (`DateTimePicker`, `minimumDate={new Date()}`) consulta la ruta de disponibilidad de tu backend y pinta un chip (`Pressable`) por turno con su **aforo restante** (`"10:00 · 6 cupos"`). Turno con 0 cupos o estado `AGOTADO` → chip deshabilitado (`disabled`). Refresca los turnos cada 10–12 s mientras la pantalla esté abierta.
- **Tickets por edad:** contadores `−/+` independientes (Adulto, Niño; y Tercera Edad/Infante si tu API los admite) con al menos 1 adulto, y **suma total ≤ aforo del turno**. Total = Σ (cantidad × precio de su categoría).
- **Tarifa única:** si tu API no distingue edades, muestra **un solo** contador "Personas (Entrada General)" y envía el total como adultos.

### 🚗 Si eres Socio de AUTOS (Esteban / Mateo — RutaLibre Autos)
- **Rango fecha/hora:** retiro y devolución con `DateTimePicker` (`mode="date"` y luego `mode="time"`); la devolución debe ser **posterior** al retiro.
- **Días y tarifa automáticos:** `dias = max(1, ceil(horas / 24))` y `total = dias × precio_diario` (más los recargos que tu API devuelva). Muestra el desglose antes de confirmar.
  ```typescript
  export function diasRenta(retiro: Date, devolucion: Date): number {
    const horas = (devolucion.getTime() - retiro.getTime()) / 3_600_000;
    return horas <= 24 ? 1 : Math.ceil(horas / 24);
  }
  ```
- **Cooldown de 2 horas (inspección técnica):** tras cada entrega el vehículo queda 2 h en limpieza/inspección. Muestra un badge **"Disponible"** o **"En inspección técnica — disponible a las 14:30"** a partir del estado/fecha que **tu API** expone (p. ej. `estado: 'EN_LIMPIEZA'` o una marca de fin de cooldown) y deshabilita "Reservar" mientras dure. No simules el cooldown en la app si la API no lo informa.

### 🏨 Si eres Socio de ALOJAMIENTOS
- **Check-in / Check-out:** dos `DateTimePicker` (el de salida con `minimumDate` = check-in + 1 día).
- **Noches:** `noches = max(1, round((checkOut − checkIn) / 86_400_000))`. **Total** = noches × precio por noche del tipo elegido × habitaciones.
- **Tipo de habitación (Simple, Doble, Suite…):** selector construido con los tipos que devuelve tu API (nombre, capacidad, precio, disponibilidad). Tipo sin disponibilidad → deshabilitado.

### ✈️ Si eres Socio de VUELOS
- **Origen/Destino:** selectores de códigos IATA con validación **origen ≠ destino**.
- **Pasajeros:** contadores con al menos 1 adulto y bebés ≤ adultos.
- **Clase (Económica / Ejecutiva):** solo las clases con disponibilidad que traiga la oferta.
- **Badge de estado:** mapea el estado de tu API a un badge de color: `SCHEDULED/ON_TIME` → "A tiempo" (verde), `DELAYED` → "Demorado" (ámbar), `IN_FLIGHT/DEPARTED` → "En vuelo" (azul), `CANCELLED` → "Cancelado" (rojo); un estado desconocido se muestra tal cual.

---

## 8. Comandos para Verificar y Compilar el APK

> [!NOTE]
> **Windows (PowerShell 5.1):** ejecuta **un comando por línea**. No uses `&&` (en PowerShell 5.1 es un error de sintaxis); si necesitas encadenar, usa `;`.

Para que EAS genere un **APK** instalable (y no un `.aab`), crea `eas.json` en `mobile_react_native/`:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

```powershell
# 1. Entrar a la carpeta de la app
cd mobile_react_native

# 2. Instalar dependencias
npm install

# 3. Verificación estática OBLIGATORIA: debe terminar sin errores antes de compilar
npx tsc --noEmit

# 4. Comprobar que las versiones nativas coinciden con tu SDK de Expo
npx expo install --check

# 5. Servidor de desarrollo (pulsa 'w' para la web o escanea el QR con Expo Go)
npx expo start

# 6. APK en la nube con EAS (requiere cuenta gratuita de Expo)
npx eas-cli login
npx eas-cli build -p android --profile preview
```

*EAS entrega un enlace de descarga del APK.* Alternativa local (requiere Android Studio/SDK instalado): `npx expo run:android --variant release`, que deja el APK en `android/app/build/outputs/apk/release/app-release.apk`. Instálalo en un celular real y confirma que el catálogo carga con la URL de Azure.

---

## 9. Prompt Copy-Paste para tu Agente de IA

> [!IMPORTANT]
> **Copia o adjunta el archivo `.md` completo, no solo este recuadro.** Así tu agente podrá consultar las secciones **§2.1** (descubrimiento de rutas reales), **§4.1** (`normalizarServicioItem`), **§5** (`apiClient` e `Idempotency-Key`), **§6.D** (`CatalogoScreen` completo) y **§7** (reglas de tu vertical).

```text
Hola agente. Trabajamos en el Reto 3 (RDA3) de Integración de Sistemas. Framework asignado: REACT NATIVE (Expo + TypeScript).
Vas a construir una app móvil que es SOLO un cliente HTTP de nuestra API ya desplegada en Azure.

REGLA DE ORO (NO NEGOCIABLE):
1. NO modifiques, formatees ni "arregles" NINGÚN archivo del backend (controladores, rutas, DTOs, entidades, migraciones, .env, Dockerfile, scripts de Azure). No despliegues nada. El backend y sus contratos OpenAPI ya están aprobados con Booking Central (RDA2); cualquier cambio rompe la integración.
2. NO inventes endpoints. Primero LEE (sin editar) el backend del repositorio y escríbeme una tabla con las rutas reales para: listar catálogo, detalle, disponibilidad, crear reserva, listar mis reservas y cancelar (método, ruta, body, forma de la respuesta). Usa solo esas rutas.
3. Crea la app en una carpeta nueva 'mobile_react_native' en la raíz con Expo + TypeScript. La URL base va en EXPO_PUBLIC_API_URL.

PROHIBIDO:
- Carrito de compras (CartContext, useCart, CartService, CartScreen). Cada reserva es individual y directa: un POST con cabecera 'Idempotency-Key' (UUID de expo-crypto) y timeout de 45 s. La clave se genera UNA vez por intento (useRef) y se reutiliza en los reintentos; no la generes en un interceptor.
- Mocks o datos inventados: nada de arrays falsos en un catch, ni precio/cupos por defecto. Si la API devuelve [] muestra "No hay servicios disponibles" con botón Reintentar; si falla, muestra el error con Reintentar.
- Consola de administración, dashboards, métricas o CRUD de inventario. La app es solo para el cliente final.
- Barra de pestañas inferior o botones de secciones inexistentes. Navegación con native-stack: Catálogo → Detalle → Voucher, y "Mis Reservas" en la cabecera.
- Desactivar la autenticación del backend ante un 401 o incrustar claves privadas (service_role, secretos). Usa la URL HTTPS vigente en Azure y, si tu API exige login/Supabase, usa la ANON_KEY vigente de tu web y envía 'Authorization: Bearer <token>'.

OBLIGATORIO:
- normalizarServicioItem tolerante y sin 'any': ids ('id','_id','auto_id','vehicle_id','alojamiento_id','atraccion_id','offer_id'), precios (número, texto u objeto {total|amount}), fotos (lista de textos, lista de {url} o texto) y respuestas [ ] o {data:[ ]}.
- Axios con 'Content-Type' y 'Accept' application/json y 'X-Correlation-Id' por petición; errores mostrando 'detail' del ProblemDetails.
- Catálogo con FlatList + refreshControl (RefreshControl), ListEmptyComponent con Reintentar y sondeo cada 12 s con clearInterval al desmontar, sin borrar datos si falla.
- Mis Reservas: cancelación solo si faltan >= 24 h (el backend tiene la última palabra) y refresco inmediato del estado.
- Voucher con react-native-qrcode-svg usando el código real devuelto por la API.
- Instala paquetes nativos con 'npx expo install'. Sigue la implementación de referencia de las secciones 2.1, 4.1, 5, 6.D y las reglas de mi vertical de la sección 7 de la guía.

ENTREGA: 'npx tsc --noEmit' sin errores, eas.json con buildType apk y APK generado con 'npx eas-cli build -p android --profile preview'. En Windows PowerShell no uses '&&': un comando por línea.
```

---

## 10. Checklist de Aceptación (revísalo antes de entregar)

- [ ] `git status` no muestra cambios fuera de `mobile_react_native/` (el backend está intacto).
- [ ] La tabla de §2.1 está completa y la app usa solo esas rutas.
- [ ] Con la API devolviendo `[]` se ve el estado vacío con **Reintentar** (no datos falsos).
- [ ] Un ítem creado en Azure aparece en la app sin reinstalarla (pull-to-refresh o sondeo).
- [ ] Un doble toque en "Confirmar" crea **una sola** reserva.
- [ ] No existe ningún archivo, contexto o pantalla de carrito ni de administración.
- [ ] `npx tsc --noEmit` termina sin errores y el APK carga datos en un celular real.
