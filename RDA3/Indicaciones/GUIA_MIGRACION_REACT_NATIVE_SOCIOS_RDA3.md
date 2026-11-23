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

```bash
# 1. Ubicarse en la carpeta móvil
cd mobile_react_native

# 2. Iniciar servidor Expo en modo desarrollo
npx expo start

# 3. Probar en navegador Web
# Presiona 'w' en la terminal de Expo

# 4. Probar en celular Android
# Descarga la app 'Expo Go' de la Play Store y escanea el código QR de la terminal

# 5. Generar archivo instalador APK para entrega del Reto 3
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
2. Desarrolla la aplicación móvil en una carpeta nueva en la raíz de nuestro repositorio llamada 'mobile_react_native' usando Expo.
3. La aplicación móvil se conectará como cliente HTTP a nuestra API ya desplegada en Azure, utilizando Axios con las cabeceras estándar 'Content-Type: application/json', 'X-Correlation-Id' e 'Idempotency-Key'.
4. La aplicación debe contener las siguientes pantallas esenciales:
   - Pantalla de Catálogo: Listado con tarjetas, imágenes, precios en USD y botón de detalle.
   - Pantalla de Detalle: Ficha del servicio con selector de fechas/turnos y botón para confirmar la reserva.
   - Pantalla de Mis Reservas: Historial de reservas con botón de cancelación (oculto si faltan menos de 24 horas para el servicio) y actualización reactiva inmediata del estado al cancelar.
   - Pantalla de Voucher QR: Generación vectorial de código QR para check-in usando 'react-native-qrcode-svg'.
5. Deja el proyecto listo y funcional para probarse con 'npx expo start' y generar el APK con 'npx eas build -p android --profile preview'.
```

