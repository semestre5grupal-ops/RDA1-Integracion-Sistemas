# Getting Started ($prepare)

**Shortcut**: `$prepare`

**Description**: Reads all files needed to obtain context for development.

## Command

`$prepare`

## Instructions

Execute the following steps to prepare for development:

1. Read the files in the `docs` folder to get an understanding of the state of the project.

2. DO NOT READ any source code. Code should be read on demand depending on the needs of the user and the development flow.

3. You MUST read the `docs/architecture` folder. This is critical and can't be ignored.

4. You MUST read the `docs/golden-rules.md` file. This is critical and can't be ignored.

5. Do not READ all of `docs/ai_development/languages`. Languages must be loaded during development. You do need to know what languages are available though.

6. Read `docs/ai_development/agents/README.md` — it contains a list of available Agents. Do not read or load the individual agents; they should only be used when needed during development.

7. If you find missing information, ask the user.

## Notes

This workflow is optimized to load only what is necessary:
- Agent files are only loaded on demand when necessary.
- Language-specific conventions are only loaded when needed.
- Source code is read on demand when working on specific workflows.
