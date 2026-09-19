# Deliver ($deliver)

**Shortcut**: `$deliver`

**Description**: Runs the final delivery workflow to validate and summarize completed work.

## Command

`$deliver`

## Instructions

Execute the following steps to prepare a feature for delivery:

### 1. Spin up an independent review sub-agent

Launch a sub-agent to perform the review. The sub-agent eliminates confirmation bias by reviewing the changes with fresh context — it has no memory of implementation decisions.

The sub-agent must:

1. Run the `$prepare` workflow to load all project docs, ADRs, golden rules, etc.
2. Diff the current branch against the base branch (`main`) using `git diff $(git merge-base HEAD <base-branch>)..HEAD`
3. Read all changed files in full (not just the diff) for complete context
4. Review every change against:
   - `docs/golden-rules.md` (non-negotiable rules)
   - All loaded ADRs and design docs
5. Audit the design record against the actual implementation:
   - Cross-reference every section of the design record against the diff
   - Flag sections that describe behavior not present in the implementation
   - Flag implemented behavior not documented in the design record
   - Flag stale details: wrong file paths, outdated names, incorrect flows
   - Flag formatting issues: misnumbered lists, broken references
   - Flag verbose or redundant content that reduces readability
6. Return a structured review report:
   - **Definition of Done**: pass/fail for each item
   - **Golden Rule Violations**: any violations found
   - **Design Sessions Audit**: discrepancies between design and implementation
   - **Issues**: list of problems with file paths and descriptions
   - **Summary**: overall assessment

### 2. Present review findings to the user

The sub-agent is a reviewer, not an editor. It reports what it found — the user decides what action to take.

- Show the sub-agent's full review report
- Do NOT automatically fix issues or modify files
- The user will decide for each finding whether to:
  - Ask the AI to make the change
  - Fix it manually
  - Dismiss it as acceptable

### 3. Ask the user if the manual review has been performed

**STOP here and wait for the user to confirm the manual review is complete and approved before proceeding.** Do not continue to the next step until the user explicitly confirms.

### 4. Push the feature branch to remote repository

## Quality Gates

This workflow enforces quality gates from:
- `docs/golden-rules.md` (non-negotiable rules)

## Notes

This workflow should align with the same context-loading and quality checks used by `$prepare`.
