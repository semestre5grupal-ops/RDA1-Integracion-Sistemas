# Init Project ($init-project)

**Shortcut**: `$init-project <project-name>`

**Description**: Initializes a new project from the `docs/` template. Replaces all `{{placeholders}}` with project-specific values.

**Arguments**:
- `[project-name]`: Name of the new project.

## Command

`$init-project <project-name>`

## Instructions

Execute the following steps to initialize a new project:

### 1. Gather project information

Ask the user for the following:

- **Project description**: What does this project do?
- **Tech stack**: What languages, frameworks, and tools does the project use?
- **Golden rules**: What are the non-negotiable rules for this project?
- **Key architecture decisions**: Any notable architectural choices?
- **Development environment**: How is the project run and tested?

### 2. Replace placeholders

Read every file in `docs/` and replace all `{{placeholder}}` patterns:

| Placeholder | Source |
|---|---|
| `{{project-name}}` | From argument |
| `{{project-description}}` | From user |
| `{{tech-stack}}` | From user |
| `{{project-golden-rules}}` | From user |
| `{{architecture-decisions}}` | From user |
| `{{dev-environment}}` | From user |
| `{{agent-roles}}` | Inferred from project needs |
| `{{language-conventions-path}}` | Set after language setup |

### 3. Create language conventions

For each language in the project's tech stack:

1. Ask the user for language-specific conventions, or use well-known best practices.
2. Create a file at `docs/ai_development/languages/<language>/conventions.md`.
3. If conventions already exist (e.g., `docs/ai_development/languages/TEMPLATE.md`), use them as a starting point.

### 4. Initialize active context

Create `docs/context/active-context.md` with the initial project state.

### 5. Verify

Read all files in `docs/` and verify no `{{...}}` placeholders remain unreplaced.

### 6. Present summary

Show the user a summary of what was initialized:

```
Project: {{project-name}}
Stack: {{tech-stack}}
Languages configured: {{languages}}
Active context: ready
Architecture: ready
```

## Notes

- This workflow should only be run once per project, at the very beginning.
- After initialization, run `$prepare` to start your first development session.
- Keep agent definitions generic — they should work across projects.
