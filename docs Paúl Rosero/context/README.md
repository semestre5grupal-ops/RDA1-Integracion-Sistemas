# context/

This directory holds the **living context** of the project. AI agents use these files to understand constraints, rules, and the current session state without re-reading the entire conversation history.

## Files

| File | Purpose |
|---|---|
| `active-context.md` | Current session state: goal, decisions, progress, next steps. **Updated every session.** |
| `ai-constraints.md` | Non-negotiable constraints for AI behavior (runtime, tools, boundaries). |
| `design-contracts.md` | Layering rules, dependency direction, and determinism principles. |

## Usage

- **Start of session**: Read `active-context.md` to understand where the project stands.
- **During session**: Update `active-context.md` with decisions as they happen.
- **End of session**: Update `active-context.md` with progress and next steps so any AI can pick up later.
