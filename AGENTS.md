# AGENTS.md

This file is for coding agents (Codex/Claude/Cursor/etc.). Keep it strict and actionable.

## Overview

<!-- AGENTSGEN:START section=overview -->
- **Project:** patron-team
- **Stack:** node (npm)
- Keep changes small and verifiable.
<!-- AGENTSGEN:END section=overview -->

<!-- AGENTSGEN:START section=repo_context -->
### Repo context

- Project: patron-team
- Stack: node
- Root: `.`
- Start with:
  - `README.md`
- CI: `.github/workflows/`
<!-- AGENTSGEN:END section=repo_context -->

<!-- AGENTSGEN:START section=guardrails -->
### Guardrails

- Work only within the requested scope and preserve local conventions.
- Prefer focused changes; use 300 changed lines as a review signal, not a hard limit.
- Never discard user files, handwritten content, migrations, or data.
- Never hardcode tokens/keys. Never print secrets; document required environment-variable names.
- Run side-effecting or destructive operations only with existing authorization.
- Before changing these areas, confirm intent unless the current task already authorizes it:
  - schema changes
  - auth/payments/crypto
  - deletions or large refactors
  - new build tooling/CI changes
  - new major dependencies
- A change is complete when behavior, relevant tests, and affected docs agree.
<!-- AGENTSGEN:END section=guardrails -->

<!-- AGENTSGEN:START section=workflow -->
### Workflow

1. Read the nearest instructions and reproduce the current behavior.
2. Implement the smallest coherent change and keep generated output reviewable.
3. Run the narrowest useful check, then the full project checks before finalizing.
4. Update docs and contracts when behavior changes.
5. Report changed behavior, verification, and any material limitation.
<!-- AGENTSGEN:END section=workflow -->

<!-- AGENTSGEN:START section=verification -->
### Verification

- Run the repository's full test suite or the closest documented equivalent.
- If a check cannot run, state why and name the remaining command.
<!-- AGENTSGEN:END section=verification -->

<!-- AGENTSGEN:START section=style -->
### Style (node)

- Match existing naming, formatting, and module boundaries.
- Prefer direct code and explicit errors over new abstractions.
- Validate external input at system boundaries.
- Keep logs free of secrets and personal data.
- Add types or comments where they clarify a public or non-obvious contract.
- Reuse current dependencies unless a new one materially reduces complexity.
<!-- AGENTSGEN:END section=style -->

## Rules Of Engagement

<!-- AGENTSGEN:START section=rules -->
**DO**
- Prefer small diffs.
- Add or update tests when behavior changes.
- Run repo checks before finishing.

**DON'T**
- Do not rewrite unrelated code.
- Do not refactor without confirming intent.
- Do not commit secrets or local env files.

**If uncertain**
- Ask a short clarifying question before making big changes.

**Warnings**
- (none)
<!-- AGENTSGEN:END section=rules -->

## Commands

<!-- AGENTSGEN:START section=commands -->
- **Dev:** `npm run dev`
- **Test:** `npm test`
- **Build:** `npm run build`

- **Run a single test:** (not specified)
- **Where configs live:** `.github/workflows/`, `package-lock.json`, `package.json`
<!-- AGENTSGEN:END section=commands -->

<!-- AGENTSGEN:START section=node -->
## Node project notes

### Common commands
- Install: `npm ci` (or `pnpm i --frozen-lockfile`)
- Tests: `npm test`
- Lint: `npm run lint`
- Build: `npm run build`

### Guardrails
- Don't update lockfiles unless necessary
- Prefer minimal dependency changes
<!-- AGENTSGEN:END section=node -->

## Repo Structure

<!-- AGENTSGEN:START section=structure -->
- **Source:** `src`
- **Config:** `.github/workflows/`, `package-lock.json`, `package.json`
<!-- AGENTSGEN:END section=structure -->

## Output Protocol

<!-- AGENTSGEN:START section=output_protocol -->
When you finish work, include:
- Summary (1-3 bullets)
- Files changed (list paths)
- Verification (exact commands to run)
<!-- AGENTSGEN:END section=output_protocol -->

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
