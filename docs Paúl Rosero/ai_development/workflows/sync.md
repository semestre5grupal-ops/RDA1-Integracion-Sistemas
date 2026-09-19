# Sincronización de Contexto Estudiantil ($sync)

**Shortcut**: `$sync`

**Description**: Flujo de trabajo obligatorio antes de iniciar cualquier sesión de desarrollo o tomar decisiones arquitectónicas en el Booking Prototipo. Garantiza que la Inteligencia Artificial mantenga la memoria del proyecto, respete el sílabo y audite los pasos.

## Command

`$sync`

## Instructions

Ejecuta los siguientes pasos en orden ESTRICTO antes de escribir código o proponer cambios:

1. **Leer la Teoría y Sílabo**:
   - Analiza siempre qué "Reto" estamos cursando revisando mentalmente (o consultando el archivo si es necesario) `c:\Users\ASUS\Documents\6to Semestre\Integración Sistemas\RDA1\teoria\Proyecto de la asignatura.pdf`.
   - Verifica si la tarea solicitada viola las reglas de la asignatura (ej. hacer microservicios en el Reto 1, o guardar productos externos en nuestra base de datos).

2. **Leer el Contexto Activo**:
   - Lee `docs Paúl Rosero/context/active-context.md` para recordar QUIÉN está pidiendo el cambio (tu rol en Atracciones) y el estado actual del integrador.

3. **Revisar Requerimientos**:
   - Lee `docs Paúl Rosero/product-requirements.md` y `docs Paúl Rosero/technical-requirements.md` para garantizar que la tecnología propuesta (NestJS, Docker, React) sea la correcta.

4. **Consultar Diseño de Base de Datos**:
   - Si se requiere alterar la base de datos, revisa el archivo de diseño aprobado (Artefacto: `diseño_base_de_datos.md`). Recuerda: 8 tablas core, sin catálogos locales.

5. **Planificar y Confirmar**:
   - Una vez analizado todo lo anterior, presenta tu conclusión y espera confirmación del usuario ANTES de escribir código.

## Notes

Este flujo asegura que la IA no pierda la "memoria" de que estamos construyendo un **Integrador** (Booking Prototipo) que consume APIs externas y no un monolito tradicional de inventario.
