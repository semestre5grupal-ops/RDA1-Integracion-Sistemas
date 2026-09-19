---
title: "Criterios de calificación - Proyecto Integrador: Booking Prototipo"
evaluation_scale: "Cumple / No cumple"
evaluation_type: "Binaria con condición habilitante"
max_score: 10
enabling_condition: "Si el proyecto no está desplegado en la nube y operativo durante la demostración, el reto no se evalúa y la calificación es 0, independientemente del resto de evidencias."
rubric:
  - id: C01
    criterion: "El sistema está desplegado y accesible públicamente en la nube (requisito obligatorio)"
    mandatory: true
    scores:
      no_cumple: 0
      cumple: 1
  - id: C02
    criterion: "El sistema de administración está funcional (CRUD, gestión operativa, navegación)"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C03
    criterion: "El marketplace web está funcional y permite consulta/publicación/flujo de venta definido"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C04
    criterion: "Las APIs están implementadas y documentadas con OpenAPI/Swagger/Redoc"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C05
    criterion: "La base de datos está operativa y soporta correctamente la solución"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C06
    criterion: "Se evidencia diseño API-first y preparación para futura integración"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C07
    criterion: "Se identificaron y documentaron contratos o endpoints para interoperabilidad futura"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C08
    criterion: "Se incorporó diseño preliminar de eventos o servicios para futura integración (SOA/EDA)"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C09
    criterion: "Se entregó documentación técnica mínima (arquitectura, modelo de datos, APIs)"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
  - id: C10
    criterion: "El estudiante demuestra dominio del código fuente durante la defensa (explica lógica, estructura, decisiones técnicas y responde preguntas)"
    mandatory: false
    scores:
      no_cumple: 0
      cumple: 1
---

# Criterios de calificación

## Proyecto Integrador: Booking Prototipo

- **Escala de evaluación:** Cumple / No cumple
- **Tipo de evaluación:** Binaria con condición habilitante
- **Puntaje máximo:** 10 puntos

## Regla habilitante

> Si el proyecto no está desplegado en la nube y operativo durante la demostración, el reto no se evalúa y la calificación es 0, independientemente del resto de evidencias.

## Rúbrica

| ID | Criterio | Evaluación | Puntos si No cumple | Puntos si Cumple |
|---|---|---|---|---|
| C01 | El sistema está desplegado y accesible públicamente en la nube (requisito obligatorio) | Cumple / No cumple | 0 | 1 |
| C02 | El sistema de administración está funcional (CRUD, gestión operativa, navegación) | Cumple / No cumple | 0 | 1 |
| C03 | El marketplace web está funcional y permite consulta/publicación/flujo de venta definido | Cumple / No cumple | 0 | 1 |
| C04 | Las APIs están implementadas y documentadas con OpenAPI/Swagger/Redoc | Cumple / No cumple | 0 | 1 |
| C05 | La base de datos está operativa y soporta correctamente la solución | Cumple / No cumple | 0 | 1 |
| C06 | Se evidencia diseño API-first y preparación para futura integración | Cumple / No cumple | 0 | 1 |
| C07 | Se identificaron y documentaron contratos o endpoints para interoperabilidad futura | Cumple / No cumple | 0 | 1 |
| C08 | Se incorporó diseño preliminar de eventos o servicios para futura integración (SOA/EDA) | Cumple / No cumple | 0 | 1 |
| C09 | Se entregó documentación técnica mínima (arquitectura, modelo de datos, APIs) | Cumple / No cumple | 0 | 1 |
| C10 | El estudiante demuestra dominio del código fuente durante la defensa (explica lógica, estructura, decisiones técnicas y responde preguntas) | Cumple / No cumple | 0 | 1 |

## Resumen de puntuación

- **Total máximo:** 10 puntos.
- **Cada criterio:** 0 puntos si No cumple; 1 punto si Cumple.
- **Condición habilitante:** C01. Si C01 no cumple, la calificación final es 0 y no se evalúan los demás criterios.