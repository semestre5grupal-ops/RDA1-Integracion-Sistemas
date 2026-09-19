# Design Contracts — {{project-name}}

## Layering Rules

- {{layer-1}} may call {{layer-2}} and {{layer-helpers}} only.
- {{layer-2}} may call {{layer-3}} and {{layer-extensions}}.
- {{layer-3}} must not import {{layer-1}} or {{layer-2}}.

## Determinism Rules

- Application composition is centralized in {{composition-module}}.
- Request handlers should produce explicit status codes and contracts.
- Service functions should be pure in intent and explicit in side effects.
