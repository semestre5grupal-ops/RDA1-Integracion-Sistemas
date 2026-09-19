# Golden Rules — {{project-name}}

These rules are **NON-NEGOTIABLE**. They protect the integrity of the project and enforce deterministic AI workflows, architectural correctness, and reproducibility.

If any rule is violated: **STOP** implementation and review the project requirements.

---

## Meta Rules (Apply to Every Project)

### Rule 1: Always Run `$prepare` at Session Start

Every AI session must begin by loading project context.

Why this exists:
- Ensures the AI has the latest rules, architecture, and active context.
- Prevents decisions based on stale or incomplete information.

Mandatory:
- Run `$prepare` before any code changes.
- Read `context/active-context.md` to understand current state.

### Rule 2: Keep Context Updated

The project's living context must reflect the current state.

Why this exists:
- Enables any AI to pick up where another left off.
- Prevents duplicate work and contradictory decisions.

Mandatory:
- Update `context/active-context.md` after significant changes.
- Log architectural and design decisions.

### Rule 3: Follow the Architecture

All code must respect the architecture defined in `docs/architecture/`.

Why this exists:
- Prevents entropy and maintains separation of concerns.
- Ensures consistency across the codebase.

Mandatory:
- Read `docs/architecture/README.md` before designing or implementing.
- Create ADRs for significant decisions.

### Rule 4: Design Before Implementation (Complex Features)

Complex features require an approved design session before any code is written.

Why this exists:
- Prevents rework and misaligned implementations.
- Ensures all stakeholders agree on the approach.

Mandatory:
- Run `$design-session <feature-name>` for complex features.
- Get user approval before implementing.

### Rule 5: Run `$deliver` Before Completing Work

Before marking work as complete, run the delivery workflow to verify quality.

Why this exists:
- Catches issues early.
- Ensures Definition of Done is met.

Mandatory:
- Run `$deliver` at the end of each feature.
- Address all issues found by the review.

---

## Project Rules ({{project-name}})

{{project-golden-rules}}

---

## Final Principle

Prefer explicitness over magic, simplicity over cleverness, and deterministic processes over improvisation. Every change MUST improve clarity, maintainability, and correctness.
