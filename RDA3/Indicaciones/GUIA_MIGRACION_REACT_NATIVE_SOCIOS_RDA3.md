# ⚛️ Guía Oficial de Migración Móvil en REACT NATIVE para Socios B2B (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Plataforma Integradora:** Booking Central  
> **Framework Asignado:** **React Native (Expo / TypeScript o JavaScript)**  
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
> 1. **PROHIBIDO CREAR UN CARRITO DE COMPRAS (Cart / Carrito):** Esta plataforma NO es una tienda de comercio electrónico tradicional. Cada reserva (un auto, un hotel, un vuelo o una atracción) se realiza de forma **atómica, directa e individual** mediante `POST /reservas` enviando una cabecera única `Idempotency-Key` (UUIDv4) con un timeout de 45 segundos. Crear un carrito (`CartContext`, `CartScreen`, acumulación de ítems) romperá la orquestación de reservas.
> 2. **PROHIBIDO USAR DATOS MOCKEADOS O HARDCODEADOS:** Si una petición HTTP devuelve lista vacía `[]` o un error temporal, **nunca** inyectes datos falsos fijos como salvaguarda permanente. Muestra el estado vacío real con un botón interactivo de "Reintentar". Usar mocks estáticos ocultará los datos reales que tus compañeros y profesores registren en Azure durante la evaluación.
> 3. **PROHIBIDO MIGRAR PANELES DE ADMINISTRACIÓN:** No agregues pantallas de administración, inventario, telemetría o dashboard de métricas. La app es exclusivamente para el cliente/turista final.

---

## 2. Ubicación y Aislamiento en tu Repositorio

Para evitar colisiones con tu código de servidor y garantizar un repositorio limpio:
1. Crea una carpeta dedicada en la raíz de tu repositorio (por ejemplo: `mi_app_rn/` o `mobile_react_native/`).
2. Configura un archivo `.gitignore` dentro de esa carpeta para no subir artefactos temporales:
   ```gitignore
   node_modules/
   .expo/
   dist/
   npm-debug.*
   *.apk
   *.aab
   .env
   ```

---

## 3. Configuración Inicial del Proyecto (Expo Recomendado)

Se recomienda fuertemente el uso de **Expo** por su velocidad de compilación, estabilidad y soporte multiplataforma inmediato sin necesidad de complejas configuraciones nativas de Android Studio:

```bash
# 1. Crear proyecto Expo con plantilla de pestañas o en blanco
npx create-expo-app mobile_react_native --template blank-typescript

# 2. Navegar a la carpeta creada
cd mobile_react_native

# 3. Instalar las dependencias oficiales y probadas
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
npx expo install react-native-svg react-native-qrcode-svg
npm install axios uuid
npm install --save-dev @types/uuid
```

---

## 4. Arquitectura de Código Recomendada

Organiza tu código en `src/` bajo una estructura limpia:

```text
mobile_react_native/
├── package.json
├── App.tsx                    # Punto de entrada con NavigationContainer y StatusBar
└── src/
    ├── api/
    │   └── client.ts          # Instancia Axios con baseURL a Azure y cabeceras de trazabilidad
    ├── types/
    │   └── index.ts           # Interfaces TypeScript (Servicio, Reserva, TimeSlot)
    ├── navigation/
    │   └── AppNavigator.tsx   # StackNavigator (Home, Detalle, Checkout, Reservas, Voucher)
    └── screens/
        ├── HomeScreen.tsx     # Catálogo con imágenes, precios y selector de categorías
        ├── DetailScreen.tsx   # Selector de fechas/turnos y botón "Reservar Ahora"
        ├── MisReservasScreen.tsx # Historial con validación de cancelación (< 24h)
        └── VoucherQrScreen.tsx   # Renderizado de código QR para check-in presencial
```

### 4.1 Tipado e Ingesta Resiliente en TypeScript (`src/types/index.ts`)
Dado que los microservicios de tus compañeros y Booking Central pueden responder con nombres de campo alternativos (snake_case vs camelCase o IDs de MongoDB), normaliza los objetos al recibirlos de la API:

```typescript
export interface ServicioItem {
  id: string;
  nombre: string;
  precio: number;
  imagenUrl?: string;
  cuposDisponibles: number;
}

// Función de mapeo tolerante (anti-crashes por esquemas heterogéneos)
export function normalizarServicioItem(raw: any): ServicioItem {
  // 1. Identificador tolerante
  const idStr = String(
    raw?.id ||
    raw?._id ||
    raw?.auto_id ||
    raw?.vehicle_id ||
    raw?.alojamiento_id ||
    raw?.atraccion_id ||
    raw?.offerId ||
    ''
  );

  // 2. Precio tolerante (soporta número, string u objeto { total: 45 })
  let precioNum = 25.0;
  const rawPrice = raw?.precio ?? raw?.price ?? raw?.precio_diario ?? raw?.precio_por_noche;
  if (typeof rawPrice === 'number') {
    precioNum = rawPrice;
  } else if (typeof rawPrice === 'string' && !isNaN(parseFloat(rawPrice))) {
    precioNum = parseFloat(rawPrice);
  } else if (rawPrice && typeof rawPrice === 'object' && typeof rawPrice.total === 'number') {
    precioNum = rawPrice.total;
  }

  // 3. Extracción de fotos (array de strings, array de objetos { url } o string)
  let fotoUrl: string | undefined;
  if (Array.isArray(raw?.photos) && raw.photos.length > 0) {
    fotoUrl = typeof raw.photos[0] === 'string' ? raw.photos[0] : raw.photos[0]?.url;
  } else {
    fotoUrl = raw?.foto_url || raw?.imagen_url;
  }

  return {
    id: idStr,
    nombre: raw?.nombre || raw?.name || raw?.vehiculo || 'Servicio Turístico',
    precio: precioNum > 0 ? precioNum : 25.0,
    imagenUrl: fotoUrl,
    cuposDisponibles: Number(raw?.cupos_disponibles ?? raw?.stock ?? raw?.available_spots ?? 10),
  };
}
```

---

## 5. Implementación de Servicios y Conectividad HTTP

En `src/api/client.ts`, centraliza la comunicación con tu backend en Azure. **Incluye siempre las cabeceras estándar de trazabilidad (`X-Correlation-Id`, `Idempotency-Key`)**:

```typescript
import axios from 'axios';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// IMPORTANTE: Reemplazar con la URL HTTPS de tu API ya desplegada en Azure
export const BASE_URL = 'https://tu-api-desplegada.azurewebsites.net/api/v3';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Interceptor para inyectar trazabilidad en cada petición
apiClient.interceptors.request.use((config) => {
  config.headers['X-Correlation-Id'] = uuidv4();
  if (config.method === 'post' && !config.headers['Idempotency-Key']) {
    config.headers['Idempotency-Key'] = uuidv4();
  }
  return config;
});

// Métodos de negocio
export const getCatalogo = async () => {
  const response = await apiClient.get('/atracciones'); // o /vehiculos, /alojamientos, etc.
  return response.data;
};

export const crearReserva = async (payload: any) => {
  const response = await apiClient.post('/reservas', payload);
  return response.data;
};

export const cancelarReserva = async (reservaId: string) => {
  const response = await apiClient.post(`/reservas/${reservaId}/cancel`);
  return response.data;
};
```

---

## 6. Reglas de Negocio Esenciales en la App Móvil

### A. Regla Invariante de Cancelación (24h / 48h)
- En `MisReservasScreen.tsx`, **oculta o deshabilita el botón "Cancelar Reserva" si faltan menos de 24 horas** (o 48 horas en atracciones) para la fecha del servicio.
- **Implementación en TypeScript:**
  ```typescript
  const puedeCancelar = (fechaServicioStr: string): boolean => {
    const fechaServicio = new Date(fechaServicioStr);
    const ahora = new Date();
    const diferenciaHoras = (fechaServicio.getTime() - ahora.getTime()) / (1000 * 60 * 60);
    return diferenciaHoras >= 24; // 48 para atracciones reguladas si aplica tu regla
  };
  ```

### B. Emisión de Voucher con Código QR para Check-in Offline
- Utiliza `react-native-qrcode-svg` para mostrar un QR con la información necesaria para el check-in:
  ```tsx
  import QRCode from 'react-native-qrcode-svg';

  <View style={{ alignItems: 'center', padding: 20 }}>
    <QRCode
      value={`BOOKING-RESERVA:${reserva.id}|CLIENTE:${reserva.clienteNombre}`}
      size={220}
      color="#003580"
      backgroundColor="white"
    />
  </View>
  ```

### C. Refresco Inmediato tras Cancelación (Anti-Stale State)
- Al confirmarse la cancelación desde el backend, actualiza el estado local de la reserva a `'CANCELADA'` inmediatamente con `setReservas(...)`, sin obligar al usuario a recargar la app manualmente.

### D. Sincronización en Vivo y Pull-to-Refresh
- Envuelve tu listado de catálogo en `CatalogoScreen.tsx` con `FlatList` y la propiedad `refreshControl` usando el componente nativo `RefreshControl` para permitir al usuario deslizar hacia abajo y refrescar los ítems en tiempo real:
  ```tsx
  import React, { useState, useCallback } from 'react';
  import { FlatList, RefreshControl } from 'react-native';

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargarCatalogo();
    setRefreshing(false);
  }, []);

  <FlatList
    data={servicios}
    renderItem={({ item }) => <TarjetaServicio item={item} />}
    keyExtractor={(item) => item.id}
    refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#003580']} />
    }
  />
  ```
- Opcionalmente, puedes configurar un `setInterval(cargarCatalogo, 12000)` en un `useEffect` para refrescar periódicamente la disponibilidad de cupos desde Azure sin bloquear la experiencia de usuario.

---

## 7. Instrucciones Específicas por Tipo de Socio

Identifica cuál es tu servicio y aplica estas directrices particulares:

### 🎭 Si eres Socio de ATRACCIONES (Gloria, Dilan, Michael, Ariel, Alisson):
- **Time Slots y Aforo:** En `DetailScreen.tsx`, muestra un selector interactivo de fechas que consulte los horarios disponibles (`time_slots`) y pinte botones con la **capacidad restante** en tiempo real.
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
# 1. Ubicarse en la carpeta móvil
cd mobile_react_native

# 2. Instalar dependencias
npm install

# 3. Verificación estática obligatoria de TypeScript (garantiza cero errores de tipos antes de compilar)
npx tsc --noEmit

# 4. Iniciar servidor Expo en modo desarrollo
npx expo start

# 5. Probar en navegador Web
# Presiona 'w' en la terminal de Expo

# 6. Probar en celular Android
# Descarga la app 'Expo Go' de la Play Store y escanea el código QR de la terminal

# 7. Generar archivo instalador APK para entrega del Reto 3
npx eas build -p android --profile preview
```
*(Si no tienes cuenta EAS configurada, también puedes compilar localmente con `npx expo run:android --variant release`).*

---

## 9. Prompt Copy-Paste para tu Agente de IA

Copia el siguiente recuadro y pégaselo directamente a tu asistente de IA (Cascade, Cursor, Copilot, ChatGPT, etc.):

```text
Hola agente. Estamos trabajando en la entrega del Reto 3 (RDA3) de la asignatura Integración de Sistemas.
Nuestro framework asignado para el cliente móvil es REACT NATIVE (Expo con TypeScript).

INSTRUCCIONES OBLIGATORIAS Y REGLA DE ORO:
1. NO MODIFIQUES ningún archivo de nuestro backend existente ni toques controladores, entidades, DTOs ni rutas en Azure. El backend ya está funcionando y aprobado con Booking Central en el RDA2. Cualquier cambio en el backend romperá la integración.
2. Desarrolla la aplicación móvil en una carpeta nueva en la raíz de nuestro repositorio llamada 'mobile_react_native' usando Expo con TypeScript.
3. La aplicación móvil se conectará como cliente HTTP a nuestra API ya desplegada en Azure, utilizando Axios con las cabeceras estándar 'Content-Type: application/json', 'Accept: application/json', 'X-Correlation-Id' e 'Idempotency-Key'.

GUARDRAILS Y ANTI-PATRONES OBLIGATORIOS (LO QUE NO DEBES HACER):
- PROHIBIDO CREAR UN CARRITO DE COMPRAS: Cada reserva se ejecuta de forma directa, atómica e individual enviando una cabecera 'Idempotency-Key' única (UUIDv4) con timeout de 45s. No agregues CartContext ni pantallas de carrito.
- PROHIBIDO USAR DATOS MOCKEADOS: Si la API responde con lista vacía o error, muestra un estado visual amigable con botón de reintento. Nunca inventes listas fijas hardcodeadas en producción.
- PROHIBIDO MIGRAR CONSOLA ADMIN: No agregues paneles de administración, gestión de proveedores ni telemetría. La app es 100% para el cliente final.
- MODELADO RESILIENTE: En 'normalizarServicioItem', tolera identificadores ('id', '_id', 'auto_id', 'vehicle_id', 'alojamiento_id'), precios (número, string u objeto con total) y fotos (array o string) sin lanzar excepciones.

PANTALLAS ESENCIALES A IMPLEMENTAR:
1. Pantalla de Catálogo: Listado responsivo con Pull-to-Refresh (FlatList con RefreshControl), imágenes, títulos, precios en USD y botón de detalle.
2. Pantalla de Detalle: Ficha del servicio con selector de fechas/turnos, aforo restante y botón para confirmar la reserva individual.
3. Pantalla de Mis Reservas: Historial con botón de cancelación (oculto si faltan menos de 24h para el servicio) y actualización reactiva inmediata del estado al cancelar.
4. Pantalla de Voucher QR: Generación vectorial de código QR para check-in usando 'react-native-qrcode-svg'.

Deja el proyecto verificado con 'npx tsc --noEmit' y listo para probarse con 'npx expo start' y compilar con 'npx eas build -p android --profile preview'.
```

