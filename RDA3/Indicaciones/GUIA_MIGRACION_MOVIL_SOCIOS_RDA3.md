# 🧭 Índice Maestro de Guías de Migración Móvil para Socios B2B (RDA3)

> **Asignatura:** Integración de Sistemas — 6to Semestre  
> **Plataforma Integradora:** Booking Central  
> **Destinatarios:** Socios Federados de **Atracciones, Autos, Alojamientos y Vuelos**  
> **Documento:** `RDA3/Indicaciones/GUIA_MIGRACION_MOVIL_SOCIOS_RDA3.md`  

---

## 🎯 Distribución de Guías por Framework Asignado

Para facilitar el trabajo a cada equipo y evitar confusiones en los agentes de IA de los socios, las directrices técnicas han sido **divididas en 3 guías independientes y autocontenidas**.

Envía a tu compañero **únicamente el archivo correspondiente a su framework sorteado**:

| Framework Asignado | Guía Oficial Específica | Archivo Markdown para Copiar y Enviar |
| :--- | :--- | :--- |
| **Flutter** (Dart) | Guía Completa de Flutter | [GUIA_MIGRACION_FLUTTER_SOCIOS_RDA3.md](GUIA_MIGRACION_FLUTTER_SOCIOS_RDA3.md) |
| **React Native** (Expo / TS) | Guía Completa de React Native | [GUIA_MIGRACION_REACT_NATIVE_SOCIOS_RDA3.md](GUIA_MIGRACION_REACT_NATIVE_SOCIOS_RDA3.md) |
| **Microsoft .NET MAUI** (C#) | Guía Completa de .NET MAUI | [GUIA_MIGRACION_MAUI_SOCIOS_RDA3.md](GUIA_MIGRACION_MAUI_SOCIOS_RDA3.md) |

---

## ⚠️ La Regla de Oro Común para Todos los Socios

> [!CAUTION]
> ### 🛑 REGLA INVIOLABLE: CERO MODIFICACIONES EN EL BACKEND
> - **El backend de tus microservicios y los contratos OpenAPI v3 con Booking Central NO SE TOCAN.**
> - En el Reto 2 (RDA2) se calibró exitosamente la integración de red, los adaptadores ACL, las máquinas de estado de cancelación (regla de 24 horas), la disponibilidad de cupos dinámicos y la consistencia transaccional.
> - El **Reto 3 (RDA3)** consiste **única y exclusivamente en migrar la experiencia visual del cliente final hacia una aplicación móvil** (Android APK / Web).
> - La consola de administración, métricas y telemetría operativa **se mantiene en la web**.
> - La aplicación móvil es simplemente un **cliente consumidor** que hace llamadas HTTP a la API que ya está desplegada en Azure.

---

## 📩 Cómo Utilizar Estas Guías con tus Compañeros

1. Pregúntale a tu compañero de equipo socio (o revisa el sorteo de la cátedra) cuál de los 3 frameworks le correspondió (**Flutter, React Native o .NET MAUI**).
2. Abre la guía correspondiente en esta misma carpeta y compártele el contenido.
3. Tu compañero solo debe **copiar el texto de la guía y pegárselo a su agente de IA** (Cascade, Cursor, Copilot, ChatGPT, etc.).
4. Su agente de IA sabrá exactamente qué carpetas crear, qué paquetes instalar, qué pantallas implementar y qué comandos correr para compilar el APK sin tocar su servidor.
