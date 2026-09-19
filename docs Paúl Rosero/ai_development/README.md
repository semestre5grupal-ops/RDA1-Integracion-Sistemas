# ai_development/

Resources for AI agents working on `{{project-name}}`.

## Structure

```
ai_development/
├── agents/       ← Agent role definitions (load on demand)
├── languages/    ← Language-specific conventions (load on demand)
└── workflows/    ← Workflow commands ($prepare, $design-session, etc.)
```

## Usage

- **Agents**: Load the appropriate agent file when you need specialized guidance (architect, engineer, reviewer).
- **Languages**: Load language conventions when writing code in a specific language.
- **Workflows**: Use workflow commands to follow structured processes.
