# Spec: repeat the AI usability cycle

> Classified locally. No issue tracker is configured in this repo (`docs/agents/` is not on disk), so this spec is not published to GitHub.

## Problem Statement

An organizer using Fila de Times can lose the session, miss a control, or get no feedback, and the team has no short procedure to catch that again after a UI change.

## Solution

Re-run one cycle against the local app: walk every interaction that is actually on screen, record click counts, and write findings. Do not change UI, tokens, copy, or business logic as part of the cycle.

## User Stories

1. As an organizer, I want a local command that serves the current working tree, so that the cycle audits the build I have.
2. As an organizer, I want the cycle to use a browser profile that does not already hold my pelada, so that import, delete, and clear-cache cannot wipe it.
3. As an organizer, I want every control on the queue screen tried or marked absent, so that missing actions are visible.
4. As an organizer, I want add-player by Enter and by the Adicionar button recorded with a click count, so that a later change can be compared.
5. As an organizer, I want an empty name submission to be recorded, so that a silent failure stays visible.
6. As an organizer, I want edit, cancel, and save of a player recorded, so that the modal path stays measurable.
7. As an organizer, I want Escape and Tab tried while a modal is open, so that focus and dismiss stay measurable.
8. As an organizer, I want form-teams, schedule, timer start, and timer clear recorded, so that the match setup path stays measurable.
9. As an organizer, I want win and draw confirmation recorded, so that destructive results stay behind a confirm step.
10. As an organizer, I want injury and restore recorded, so that queue row actions stay measurable.
11. As an organizer, I want both stats tabs, the name filter, and a column sort recorded, so that list behavior stays measurable.
12. As an organizer, I want Back and a non-root URL recorded, so that history and deep links stay measurable.
13. As an organizer, I want Sair recorded, so that a blank screen after logout is caught.
14. As an organizer, I want cloud export, bad JSON import, and clear-cache cancel recorded, so that error and confirm copy stay measurable.
15. As an organizer, I want light and dark contrast of the active tab recorded at 14px, so that a contrast regression is caught without shrinking type.
16. As an organizer, I want 1280, 768, and 390 widths checked for horizontal overflow, so that a layout regression is caught.
17. As an organizer, I want offline reload recorded, so that a service worker that keeps the title but drops the controls is caught.
18. As an organizer, I want absent controls listed (new round, lock, rebalance, bulk select, pagination, undo, command palette), so that the inventory does not invent them.

## Implementation Decisions

- Prototype is the Vite app from `npm run dev`. Do not build a Figma prototype for this cycle.
- Audit the current working tree. Do not revert unrelated edits.
- Browser evidence comes from a fresh profile. The Cursor browser profile at `http://localhost:5173/` may already contain `teamQueueDB`. Do not import, delete, finalize, or clear cache there.
- `browser-use` is optional. On WSL it failed without a running Chromium. Cursor’s browser plus Playwright Chromium (already in devDependencies) are enough. Do not add an npm dependency for the cycle.
- Do not add UserTesting, Flinchify, GhostUser, or Percio. They need `FLINCHIFY_API_KEY`, `PERCIO_API_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or a UserTesting login. See [tool-research.md](tool-research.md).
- Env names only, never values: `VITE_AUTH_USER`, `VITE_AUTH_PASSWORD_HASH`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. When `VITE_AUTH_PASSWORD_HASH` is unset, the gate is skipped on first load.
- Heuristic checks stay at the current type size. A contrast fix must not shrink the 14px tab label or the 12px stat buttons. Focus rings stay at least 2px.
- Write the cycle notes under `docs/usability/`. Do not file tracker issues until a tracker exists.

## Testing Decisions

A good check observes the screen after a user action: a toast, a dialog, a changed list, or a blank page. It does not assert private function names.

- Manual, this cycle: contrast math, five-second / first-click notes, Nielsen notes per screen, and any flow that needs the already-populated Cursor profile.
- Automated already: Cucumber under `bdd/features/` covers login, the queue, forming a team, scheduling, tabs, injury, and export at the happy path. `npm test` is the unit gate. Neither replaces the contrast, keyboard, or logout crash checks.
- Automated later, only if a follow-up task says so: one Playwright test that clicks Sair and expects the login form instead of an empty document. That test is out of scope for the cycle itself.

Commands:

```sh
npm run dev
npm test
```

Isolated browser, when Playwright is used:

```sh
PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"
```

## Out of Scope

- UI, token, copy, or business-logic changes.
- New MCP servers or new npm dependencies.
- Publishing findings to GitHub.
- A click-reduction redesign. No click-reduction plan is in this repo.
- Wiping an existing `teamQueueDB` in a browser the organizer already uses.

## Further Notes

Cycle 1 results are in [ai-usability-cycle-1.md](ai-usability-cycle-1.md). The first action after this cycle is the logout crash, not a visual redesign.
