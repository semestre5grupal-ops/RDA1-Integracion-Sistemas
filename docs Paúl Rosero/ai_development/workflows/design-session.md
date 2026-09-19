# Design Session ($design-session)

**Shortcut**: `$design-session <feature-name>`

**Description**: Starts a focused design workflow for a specific feature.

**Agent:** `@architect`
**Reviewer:** `@architect-reviewer`

**Arguments:**
- `[feature-name]`: (Optional) Name of the feature. Defaults to `active-design`.

**Context Dependencies:**
Load the following context dependencies for the current development session.
- `@docs/golden-rules.md`
- `@docs/technical-requirements.md`

## Command

`$design-session <feature-name>`

## Instructions

1. **Adopt Persona:** Load instructions from `@docs/ai_development/agents/architect.md`.
2. **Setup:**
   - Determine filename: `@docs/design_sessions/[design-name].md`.
   - Check if file exists. If yes, read it. If no, create it using `@docs/design_sessions/TEMPLATE.md`.
3. **Context Interview (Interactive):**
   - **Action:** Ask the user: *"What are the requirements for [design-name]? Please describe the input data, scoring rules, and expected output."*
   - **Action:** Wait for user input.
   - **Action:** Iteratively refine the design in the markdown file based on user answers.
4. **Review:**
   - Validate the draft against `@docs/golden-rules.md`.
   - Ensure NO scope creep is proposed.
5. **Finalize:**
   - Ask: *"Is this design ready for implementation?"*
   - **STOP.** Do not write code yet.

## Notes

This workflow should align with the same context-loading and scope discipline used by `$prepare`.
