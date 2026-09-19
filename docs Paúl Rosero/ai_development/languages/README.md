# Language Guidelines Index

This folder contains language-specific development guidance for contributors and AI agents.

The goal is to provide a lightweight entry point so agents can quickly discover what language standards are available, then load only the relevant language docs during implementation.

## Structure

Each language has its own subfolder with a `conventions.md` file:

```
languages/
├── README.md          ← You are here
├── TEMPLATE.md        ← Template for adding new languages
└── <language>/
    └── conventions.md ← Language-specific guidance
```

## Agent Usage Notes

1. Read this file first to discover available language packs.
2. Load only the language folder needed for the current task.
3. Prefer concise, deterministic conventions when generating or modifying code.
4. If no language guidance exists for a requested stack, ask for direction before inventing standards.

## Adding a New Language

When adding a new language, use `TEMPLATE.md` as a starting point and create a dedicated subfolder with:

- A language conventions guide (`conventions.md`)
- Optional summary docs for quick consumption

Keep guidance practical, implementation-oriented, and easy for both humans and agents to apply.
