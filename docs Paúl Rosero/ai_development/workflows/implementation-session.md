# Implementation Session ($implementation-session)

**Shortcut**: `$implementation-session <feature-name>`

**Description**: Runs an implementation-focused workflow for a specific feature.

**Arguments:**
- `[feature-name]`: Name of the feature as specified in the created design session doc. The feature name will be found in `docs/design_sessions`.

**Preconditions:**
- The `[feature-name]` must exist with an equivalent design session doc.
- The user must have approved the design in the previous step (design session).

**Context Dependencies:**
Load the following context dependencies for the current development session.
- The design doc in `docs/design_sessions` based on the `feature-name`.
- `@docs/golden-rules.md`
- `@docs/architecture/README.md`
- `@docs/ai_development/languages/README.md`

## Command

`$implementation-session <feature-name>`

## Instructions

Execute the following steps to implement a feature:

1. Activate the appropriate development agents based on the work involved.

2. Find and read the design session in `docs/design_sessions/` by looking for a file matching the feature name.

3. Initialize development environment:
   - Install dependencies as needed.
   - Set up required services based on specified technical requirements.

4. Implement the design:
   - If there is an `Implementation Details` section, follow the implementation plan to implement the design as specified in the design record.
     - If anything is missing from the implementation plan that is in the design, ask the user for input.
   - If there is no implementation plan, implement the design as specified in the design session doc.
   - Follow all rules in `docs/golden-rules.md`.
   - Follow the architecture in `docs/architecture/` and `docs/technical-requirements.md`.
   - Use appropriate language conventions from `docs/ai_development/languages/` if applicable.

5. Handle ambiguity:
   - If there is any ambiguity in the design, DO NOT get creative.
   - Instead, ask the user for clarification.

## Notes

This workflow should align with the same context-loading and scope discipline used by `$prepare`.
