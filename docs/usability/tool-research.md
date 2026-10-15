# Tool research — AI usability cycle 1

Checked on 15 Oct 2026 against primary docs and this machine. A tool is listed as run only if a command or browser session actually completed.

## Ran

| Tool | What happened |
| --- | --- |
| Existing Vite process | `curl http://127.0.0.1:5173/` returned 200 with the Vite React refresh client. Command already in use: `npm run dev`. Branch audited: `wip/local-changes`. |
| `browser-use` 0.1.13 | Installed for this user with `uv tool install browser-use` (not added to `package.json`). `browser-use --doctor` failed: no Chromium-family browser running on WSL. `new_tab("http://127.0.0.1:5173/")` failed: `chrome-not-running` in `~/.config/browser-harness/tmp/bu-default.log`. Not used for the walk. |
| Cursor browser | Loaded `http://localhost:5173/` (tab title “Fila de Times”). Used for the populated-session audit. That profile already had `teamQueueDB` (7 players, 3 teams, 1 match). Destructive controls were not used there. |
| Playwright Chromium | Already a devDependency. Fresh context via `chromium.launch` so IndexedDB was empty. Scripts lived in `/tmp` and were not added to the repo. `PLAYWRIGHT_BROWSERS_PATH` pointed at the existing browser cache. |
| ui-ux-pro-max search | `python3 ~/.cursor/skills/ui-ux-pro-max/scripts/search.py` with `--domain ux` for focus order, 44px targets, and field errors. No `--persist` and no `--design-system`. |

Criteria taken from those search results:

- Focus indicator at least 2px with about 3:1 contrast against the adjacent color. Do not treat the AAA “fully unobscured” rule as an AA requirement.
- Keyboard order must reach every control. Modal controls need a visible ring.
- Web target size: at least 24 CSS px (WCAG 2.2 AA). Touch guidance used here is 44px on the short side, with 8px between targets.
- Invalid fields need an error next to the field, exposed to assistive tech. A toast alone is not that error.
- Body text at 14px needs 4.5:1. Do not shrink type to fix contrast.

## Not run

These exist as products. None are connected in this session, and none were installed. Each needs an account or API key. Adding one would bill or send the local app to a third party.

| Tool | Primary source | Why it was not run |
| --- | --- | --- |
| UserTesting MCP | [Connect the UserTesting MCP](https://help.usertesting.com/hc/en-us/articles/38351894323229-Connect-the-UserTesting-MCP-to-your-AI-client-Open-beta) — server `https://ai.usertesting.com/mcp` | Open beta. Needs a UserTesting login and workspace permission. Recruits real participants. Not in the session MCP list. |
| Flinchify MCP and CLI | [flinchify-mcp on npm](https://registry.npmjs.org/flinchify-mcp), [flinchify CLI](https://registry.npmjs.org/flinchify) | `npx flinchify-mcp` or `flinchify test`. Needs `FLINCHIFY_API_KEY`. Default budget is paid human testers. |
| GhostUser | [savkevip/ghostuser](https://github.com/savkevip/ghostuser) | CLI and MCP for localhost. Needs `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`. |
| Percio | [Percio agent overview](https://docs.percio.app/agent/overview) | `npm install -g @percio/agent` provides `percio` and `percio-mcp`. Needs `PERCIO_API_KEY`. |

Session analysis in this cycle was the in-session agent driving Cursor’s browser and a fresh Playwright context. That is not a substitute for those panels.

Figma’s guide ([AI usability testing](https://www.figma.com/resource-library/ai-usability-testing/)) is the method: prototype, predictive audits (accessibility, visual hierarchy, logic gaps), then session analysis with screen-specific findings. Figma Make was not used. The running app is the prototype.
