# Indicaciones para la Defensa Técnica (RDA3)

## 1. Puntos Críticos a Identificar y Defender
1. **Identificación de la Arquitectura y Componentes:**
   - Reconocer la arquitectura de 7 capas del proyecto, el patrón **Database-per-Service** (12 esquemas herméticos en PostgreSQL) y la regla de **cero SQL `JOINs` entre dominios**.
   - Saber explicar cómo se combinan el **Proxy** (en el borde perimetral y como sidecar en la malla), el **BFF** (GraphQL en Capa 6) y el **Aggregator** (en el ESB interno para unir datos en memoria sin `JOINs`).
   - Ubicación en archivos físicos de cada subsistema (mapeado en la Sección 2.3 del [`README.md`](file:///README.md#23-mapeo-físico-exhaustivo-de-archivos-de-la-arquitectura-en-src)).

2. **Observabilidad y Trazas Distribuidas (Semana 10):**
   - Dominar el flujo de resolución de incidentes: **Métrica (Grafana) → Traza (Jaeger) → Log (Kibana/Winston)**.
   - Demostrar los **spans manuales** en Jaeger (`validar_reglas_negocio_aforo`, `invocacion_socio_b2b`, `saga_transaccion_journal`, `broker_publicar_evento`).
   - Demostrar el cumplimiento de **SLI, SLO y Error Budget**:
     * *SLO de Reservas:* $\ge 99.0\%$ de éxito y p95 $< 2.5\text{s}$ en 30 días.
     * *Error Budget:* $1\%$ de margen de fallo (100 fallos tolerados por cada 10,000 transacciones).
     * *Política de Feature Freeze:* Si se gasta $> 80\%$ del presupuesto de error, se congelan despliegues para estabilizar conectores.

3. **Plan Maestro de Implementación:**
   - La guía técnica paso a paso con código, configuración de Docker Compose, convenciones semánticas y dashboards se encuentra formalizada en:
     👉 [`RDA3/Indicaciones/PLAN_IMPLEMENTACION_OBSERVABILIDAD_RDA3.md`](file:///RDA3/Indicaciones/PLAN_IMPLEMENTACION_OBSERVABILIDAD_RDA3.md)
