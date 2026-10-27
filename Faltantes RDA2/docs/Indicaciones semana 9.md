# Análisis de Arquitectura y Contratos de Microservicios

Los microservicios deben estar divididos por lógica no por negocio, aunque mi ingeniero ya había validado la arquitectura que teníamos en [ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md](file;file:///c%3A/Users/ASUS/Documents/6to%20Semestre/Integraci%C3%B3n%20Sistemas/proyecto/plantilla%20inicial/docs%20Pa%C3%BAl%20Rosero/architecture/ARQUITECTURA_RDA2_MICROSERVICIOS_PRODUCCION.md) .
Al ser microservicios, cada microservicio debe tener un contrato.
Cada microservicio debe tener autenticación y autorización.
Se debe probar el contrato completo con CONTRACT TESTING (PACT) para comparar el contrato con el schema.
Hay que hacer una validación en tiempo real con AJV(NestJS) de los contratos
Aún se mantienen las inconsistencias con respecto a duplicados debido a los idiomas, ya que técnicamente el contrato nos está pidiendo programar 2 veces los atributos al tener especificados los nombres tanto en inglés como en español. Por lo que se decidió hacerlo todo en inglés porque en el resto de módulos también lo están tratando en inglés.

El ingeniero mencionó que el booking es el encargado de enviar a las páginas web individuales el archivo .proto y el json Schema porque es el booking quien hace la comunicación en el grpc. Recuerda que el Booking envía la actualización de stock a las páginas individuales como REST, mientras ellos nos envían como gRPC. 

Por otro lado, mis compañeros que hacen la página web individual enviaron estos prompts a sus agentes y la respuesta que les dio es preocupante. Analiza tanto las preguntas como las respuestas para poder empezar a blindarlas, corregirlas y hacer que todo esté bien:

Actúa como un integrador que solo puede ver este .proto, sin acceso al código del servidor. Dime qué operaciones puedes inferir, qué preguntas le harías al equipo dueño del servicio, y qué información no puedes deducir solo de este contrato. ¿Qué preguntas te generan ambiguedad? ¿Qué casos límite no quedan claros? Realiza una versión mejorada. 

Dualidad de Idiomas y Duplicidad de Campos (Nombres en Inglés vs. Español) En varios esquemas del contrato, la API define propiedades duplicadas para representar el mismo concepto

Redundancia de Claves en el Checkout (atracciones_id, slot_id y hora) Para crear una reserva (POST/atracciones/reservas), el contrato exige enviar de forma obligatoria atracciones_id, fecha, slot_id y hora. Ambigüedad: El slot_id (ej. slot-20261025-1030) conceptualmente ya codifica la fecha y la hora. Conflicto: ¿Qué ocurre si se envía un slot_id perteneciente a las 10:30 a.m. pero en el campo hora se envía "14:00:00"? ¿Prevalece el identificador de la franja o el texto de la hora?

Divergencia de Rutas en la Documentación (Inconsistencia de Entornos/Servers)

Casos Límite y Comportamientos Inciertos
A. Gestión de Errores en Sagas Distribuidas: 409 Conflict vs. 422 Unprocessable Entity El contrato establece que cuando no hay aforo suficiente se debe retornar un error 409 Conflict con el código OUT_OF_STOCK, lo cual sirve como detonador para las compensaciones LIFO en el orquestador.

Sincronización Híbrida gRPC vs. REST y Bloqueo Concurrente Se indica que el aforo se actualiza en memoria mediante gRPC y se consulta desde la tabla PostgreSQL schema_atracciones.turnos_aforo mediante READ COMMITTED.