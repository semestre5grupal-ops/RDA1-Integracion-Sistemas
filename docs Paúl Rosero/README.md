# docs/ — Project Documentation Template for AI-Assisted Development

This directory is a **self-documenting template** designed to guide AI agents working on `{{project-name}}`.

## Structure Overview

```
docs/
├── README.md                          ← You are here. Start here.
├── golden-rules.md                    ← Non-negotiable rules (meta + project-specific)
├── product-requirements.md            ← What the product does
├── technical-requirements.md          ← Technical stack and constraints
│
├── context/                           ← Active session state and AI constraints
├── architecture/                      ← Architecture overview and ADRs
├── design_sessions/                   ← Feature design records
└── ai_development/                    ← Agents, language conventions, workflows
```

## For the AI Agent

### On every session start

1. **Read this file first** to understand the documentation structure.
2. **Run `$prepare`** — this loads golden rules, architecture overview, and active context.
3. **Read `context/active-context.md`** — it tells you the current project state and what was done last session.
4. **Load only what you need** — agent files and language conventions are loaded on demand.

### During the session

- Update `context/active-context.md` with decisions, progress, and next steps.
- Follow `golden-rules.md` strictly — they are non-negotiable.
- For complex features, ensure a design session exists before implementing.

### On session end

- Update `context/active-context.md` with what was accomplished and what is pending.
- If the work is complete, run `$deliver`.

## Token Optimization

- README files at each level let the AI navigate without reading everything.
- `active-context.md` avoids re-reading full conversation history — a new AI can catch up instantly.
- Agents and language conventions are loaded on demand, not at startup.
- Each file covers one concern — no duplication.
