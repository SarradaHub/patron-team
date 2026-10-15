# AI usability cycle 1 — Fila de Times

Method: [Figma’s AI usability testing guide](https://www.figma.com/resource-library/ai-usability-testing/) mapped onto the running app. Figma Make was not used.

Audited tree: branch `wip/local-changes`, including uncommitted edits in `src/components/PlayerStats.jsx`, `src/components/RoundStatistics.jsx`, and `src/styles.css`. Those files were not changed by this cycle.

## 1. Setup

- The app was already running. `npm run dev` (Vite 5.4.21) answered `http://127.0.0.1:5173/` with HTTP 200.
- `browser-use` 0.1.13 was installed with `uv tool install browser-use` and did not attach. `browser-use --doctor` reported no Chromium running. The walk used the Cursor browser on the existing tab, plus Playwright Chromium in a fresh profile for any action that writes IndexedDB.
- The Cursor profile already held `teamQueueDB` (7 players, 3 teams, 1 match, 1 round). Import, delete, finalize, injury, and clear-cache were not used there. Theme was switched to dark and restored to light. The viewport override was cleared.
- `VITE_AUTH_PASSWORD_HASH` is unset (no `.env` file). First load skips the login form. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset. Cloud export shows an error toast that names those variables. No secret values were recorded.
- UserTesting, Flinchify, GhostUser, and Percio were not run. Details: [tool-research.md](tool-research.md).

## 2. Interaction inventory

Click counts are from the fresh Playwright profile unless noted. “Cursor” means the populated session, read or opened and cancelled.

| Category | Surface | Entry | Sequence | Clicks | State |
| --- | --- | --- | --- | --- | --- |
| A. Lifecycle | Add player | Controles, name field (focused on load) | Type name, Enter | 0 (Enter) | Present. Toast: `Jogador "…" adicionado à fila!` |
| A | Add with button | Same field | Click Adicionar | 1 | Present |
| A | Empty name | Adicionar | Click with an empty field | 1 | Present control, no feedback |
| A | Goalkeeper-only | Checkbox “Só goleiro”, then Adicionar | Check + click | 2 | Present. Toast names the goalkeeper list |
| A | Edit player | Fila, Editar | Open, change name, Salvar | 2 | Present. Toast: `Jogador atualizado.` |
| A | Cancel edit | Editar, then Cancelar | Open + Cancelar | 2 | Present. Name unchanged |
| A | Delete player | Excluir on the row, or Excluir jogador in the modal | Not completed | — | Present. Uses `window.confirm` in code. Not clicked, so the confirm copy was not captured |
| A | Injury / tired / substitute | Row buttons Lesão, Cansado, Sub | Lesão on an in-field player | 1 | Present. Toast said a substitute entered. `removePlayer` ignores its `substitute` argument (`void substitute` in `src/api/indexeddb.js`) |
| A | Restore | Liberar lesão | Click | 1 | Present. Toast: `Jogador liberado e colocado no fim da fila.` |
| A | Form teams | Formar todos os times possíveis | Set size 2, click | 1 | Present. Toast: `2 times formados (2 jogadores cada)!` |
| A | Form when short | Size 20 with 4 players | Click | 1 | Present. Toast names how many players are missing |
| A | Edit / delete team | Time card, Editar / Excluir | Seen on the populated session | 1 to open | Present. Delete not clicked |
| A | Lock team | Bloquear time | — | — | Not present. `TeamCard` renders it only when `onToggleBlock` is passed. `App.jsx` does not pass it. No “Bloquear” text on screen |
| A | Rebalance | — | — | — | Not present. No control and no label |
| A | Schedule match | Agendar próxima partida | Click after two teams | 1 | Present. Toast tells the organizer to edit stats and finalize |
| A | Timer | 5 min e iniciar, then Zerar | Two clicks | 2 | Present. Start toasts `Cronômetro iniciado.` Zerar removes the clock and does not toast |
| A | Save duration | Salvar duração | Not clicked | — | Present. `handleSetMatchTimerDuration` refreshes data and does not toast |
| A | Match stats | Stats | Open, Escape, Cancelar | 2 | Present |
| A | Edit scheduled match | Editar on the match card | Open, Escape, Fechar | 2 | Present. Close label is Fechar, not Cancelar |
| A | Win | Time A venceu, then confirm | Two clicks | 2 | Present. Confirm dialog, then `Partida finalizada.` |
| A | Draw | Empate, then Cancelar | Two clicks | 2 | Present as a confirm dialog in this dataset |
| A | Draw tiebreaker | After Empate when one waiting team qualifies | — | — | Not reached. Code opens `DrawTiebreakerModal` only in that case |
| A | Delete match | Excluir on the card | Not clicked | — | Present. `window.confirm` in code |
| A | Rename round | Nome da rodada, blur or Enter | Not changed on the populated session | 0 extra | Present. Commits on blur |
| A | New round | Nova rodada | — | — | Not present. `RoundSelector` only renames. A second round appears only after a legacy import |
| A | Switch round | Round select | — | — | Not present with a single round. The select renders only when more than one round exists |
| B. Navigation | Tabs | Fila e partidas, Estatísticas da rodada, Estatísticas globais | One click each | 1 | Present. URL stays `/` |
| B | Back / forward | Browser Back after a tab click | Back | 0 in-app | Not present as in-app history. Back left the origin (`about:blank`) |
| B | Deep link | `http://127.0.0.1:5173/fila` | Open | 0 | HTTP 200 and the same screen. The path does not select a section |
| B | Breadcrumbs | — | — | — | Not present |
| C. Lists | Name filter | Estatísticas globais | Type `zzz-none`, then a real name | 0 (typing) | Present. Miss copy: `Nenhum jogador encontrado com esse nome.` Hit showed 1 row |
| C | Sort | Column header Gols, and round-stats headers | Click | 1 | Present. A “Ordenar por” select exists in the DOM and is shown only under 960px (`display: none` above that) |
| C | Pagination, infinite scroll | — | — | — | Not present |
| C | Bulk select / bulk actions | — | — | — | Not present |
| C | Row actions | Editar, Excluir, Lesão, Cansado, Sub, Stats, result buttons | See A | 1 each | Present. Many controls share the accessible name Editar or Excluir |
| C | Column visibility, density, saved views | — | — | — | Not present |
| D. Forms | Required vs optional | Login inputs are `required`. Player name is not | Empty Adicionar | 1 | Player name fails silently. Login was not reachable (see Sair) |
| D | Field error | — | — | — | Not present for the player name. Bad JSON uses `window.alert` |
| D | Autosave | Round name on blur. Timer minutes on blur | Not fully clicked | — | Present for those two fields only |
| D | Dirty-state / unsaved guard | — | — | — | Not present. No `beforeunload` handler |
| D | Multi-step | Result confirm, draw confirm | 2 | 2 | Present. Tiebreaker step not reached |
| D | File import | Importar dados | Bad JSON file | 1 + native alert | Present |
| D | Date/time picker, autocomplete | — | — | — | Not present. Duration is a number of minutes |
| E. Feedback | Loading | “Carregando rodada…” | Seen only before the round exists | — | Text only. No skeleton |
| E | Empty field | No teams yet | After a failed form | — | `Nenhum time em campo. Forme times em Controles.` |
| E | Empty filter | Global stats | See C | — | Present |
| E | Error recovery | Enviar para nuvem | Click | 1 | Toast: `Erro ao exportar: Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.` |
| E | Success toast | Add, form, schedule, finalize, injury, restore | See A | — | Present for those. Absent for Zerar, Salvar duração, and goal +/- (goal +/- was seen, not clicked) |
| E | Undo | — | — | — | Not present |
| E | Confirm before destroy | Clear cache | Open, Cancelar | 2 | Accessible `alertdialog`. Maintenance and bad JSON use native `confirm` / `alert`. Match results use `ConfirmDialog` |
| F. Overlays | Edit player, edit team (seen), edit match, match stats, confirm, tiebreaker (not reached) | Buttons above | Open | 1 | Present except tiebreaker, which did not open |
| F | Drawer, popover, command palette | — | — | — | Not present. Tooltips are native `title` on some row buttons |
| F | Escape | Any open modal | Escape | 0 | Does not close. Edit player, stats, and edit-match all stayed open |
| F | Focus trap | Edit player | Tab | — | Focus left the dialog within 10 tabs. 64 controls outside, 6 inside |
| F | Scroll lock | Edit player open | — | — | `body` overflow stayed `visible` |
| F | Backdrop click | Edit player | — | — | Backdrop has no click handler |
| G. Keyboard | Tab order | Native | Tab | — | Present, and it does not stay inside a modal |
| G | Enter | Add player, round name | Enter | 0 | Present |
| G | Shortcuts / command palette | — | — | — | Not present. No discoverable shortcut UI |
| G | Focus ring | Inputs | Stylesheet | — | Inputs use `outline: none` and a 2px shadow at 15% green. Composite over white is about rgb(221, 236, 225), far below 3:1. The ring is 2px, so the fix is a darker ring, not a thinner one. Button focus was not measured: the isolated page was blank after Sair |
| H. Responsive | 1280, 768, 390 | Set viewport | — | — | No horizontal overflow (`scrollWidth` matched the width). At 390 the tabs wrap to two lines. At 768 they stay on one line |
| H | Theme | Modo escuro / Modo claro | 1 click each | 1 | Present. Restored to light on the populated session |
| H | Roles | Single organizer | — | — | No second role. Gate is off when `VITE_AUTH_PASSWORD_HASH` is unset |
| H | Sair | Header | Click | 1 | Present, and it blanks the document. See findings |
| H | Session expiry | — | — | — | Not present. Session is `sessionStorage` with no timer |
| H | Offline | DevTools offline, then reload | On a healthy page | — | Service worker registers from `index.html`. After reload the title remained and `[data-testid=controls-panel]` was gone |

## 3. Audit results

### Accessibility

Measured on the populated session.

| Surface | Size | Contrast | Note |
| --- | --- | --- | --- |
| Body / headings, light | 16px / 20px | 16.1:1 on white | Passes |
| Primary button and active tab, light | 14px | 5.08:1, white on `#1a7f37` | Passes AA. Do not shrink the 14px label |
| Inactive tab, light | 14px | 6.19:1 | Passes |
| Active tab, dark | 14px | 3.21:1, white on rgb(46, 164, 79) | Fails AA 4.5:1. Darken the green or the pairing. Keep 14px |
| Sair, light | 12.8px, 44px tall | 4.66:1 | Passes 4.5:1. Do not shrink the label |
| Stat +/− buttons | 12px, 34×44 | White on `#1a7f37` (same 5.08:1 family) | Width is above the 24px AA floor and below a 44px touch target. Do not reduce the 12px label |
| Só goleiro checkbox | 13×13 | Label text 16.1:1 at 13.6px | Target is under 24px. Enlarge the hit area. Keep the label size |
| Theme toggle | 51×32 | Not the contrast problem | Height is under 44px |

Keyboard: the name field is focused on load, which makes Enter the short path. There is no `<label>` for that field (`add-player` input has no `id`). The accessible name is the placeholder. Global filter is the same pattern (`Filtrar por nome...`).

### Visual hierarchy

Five-second read of the populated queue at desktop width: the green tab “Fila e partidas” and the match result buttons (Time A venceu, Time B venceu, Empate) are the strongest blocks. Adicionar and Formar todos os times possíveis sit in the left column and are real primary actions for an empty queue, but on a live round the center card wins the eye.

First click a new organizer would make on that screen: a result button, not Adicionar. That is one extra conceptual step when the job is still “put people in the queue”. On the empty isolated profile the left column is the only strong action, and Enter works with zero clicks.

Round stats: the green header row is the landmark. Sort is on the headers. There is no second primary button, which matches a read-only table. All zeros while a match is only scheduled matches the caption that stats come from finalized matches.

Global stats: the filter is the first field, then the table. The +/− controls are the row action. They are easy to miss at 34px wide.

Edit player: the title and Salvar are clear. Excluir jogador sits in the same row as Salvar, so the destructive action shares the primary row.

### Logic gaps

- Sair is a dead end. One click, then an empty document. Console: `Rendered fewer hooks than expected. This may be caused by an accidental early return statement.` The return that shows `LoginScreen` is in `src/App.jsx` before `useCallback` / `useMemo` hooks that run only while authenticated. Reload is the recovery. Login after that click was not reachable.
- Empty Adicionar does nothing. No toast, no inline error, player count stays 0.
- Escape does not dismiss modals. The agent pressed Escape, the dialog stayed, and Tab moved focus into the page behind it. Closing took a second click (Cancelar or Fechar).
- Back is not section history. Tab clicks do not change the URL, so Back leaves the app.
- `/fila` does not deep-link. The server returns the same app.
- Zerar updates the controls and does not confirm. Salvar duração has no success toast in code (not clicked).
- Lesão on an in-field player produced `Lesão registrado — substituto entrou…`. Cansado and Sub pass different `substitute` flags, and the API discards that flag. The two labels do not encode two behaviors.
- Confirms are three different mechanisms: `ConfirmDialog` (results, clear cache), `window.confirm` (maintenance, deletes), `window.alert` (bad JSON, same team selected twice in the match editor).
- Cloud export’s error toast is specific and names the env vars. That path is in good shape.

### Nielsen, by screen

Scores are pass or fail for this screen only.

**Queue and Controles**

1. Status — pass. Counts, “Agendada”, and the toast after add/form/schedule are visible.
2. Match to the world — pass. Labels are the pelada’s own words.
3. User control — fail. Back exits. Zerar has no confirm and no toast.
4. Consistency — fail. Fechar vs Cancelar. Native dialogs vs the in-app confirm.
5. Error prevention — fail. Empty name is silent. Excluir sits beside Salvar in the player modal.
6. Recognition — fail. Several buttons named only Editar or Excluir. The agent could not tell match edit from player edit without extra reading.
7. Flexibility — pass for Enter-to-add. Fail for shortcuts: none are shown because none exist.
8. Minimalist design — fail on a live round. Result buttons, form-teams, and add compete. Not a request to remove them in this cycle.
9. Error recovery — pass for “not enough players” and for the Supabase toast. Fail for the empty name.
10. Help — pass for the short lines under each control section.

**Edit player**

3. User control — fail. Escape and the backdrop do nothing. Cancelar works (1 extra click after the failed Escape).
5. Error prevention — fail. Excluir jogador is in the edit dialog.
7. Flexibility — fail. Focus does not stay inside the dialog.

**Round stats**

1. Status — pass. The caption says finalized matches are the source, and the zeros match a scheduled-only round.
6. Recognition — pass. Sort state is on the header (`maior` / `menor` in a visually hidden span plus the mark).
8. Minimalist design — pass. One table, no competing primary button.

**Global stats**

5. Error prevention — pass for a filter miss: `Nenhum jogador encontrado com esse nome.`
6. Recognition — fail. The filter’s name is its placeholder.
9. Error recovery — not failed. Goal +/− was not clicked, so success feedback for that control was not observed. The code updates the number and does not toast.

**Match card**

1. Status — pass. Score, Agendada, and the confirm step before a win.
3. User control — pass for Cancelar on Empate (returns without finalizing). Fail for Escape on Stats and on Editar partida.

### Agent path vs optimal path

| Task | Optimal | Agent | Delta |
| --- | --- | --- | --- |
| Add one player | Type + Enter while the field is focused | Same in the fresh profile | 0 |
| Empty add | Should be blocked with an inline error | 1 click, no message | 1 wasted click |
| Edit a player and dismiss | 1 click Editar, 1 click Cancelar | Editar, Escape (no effect), Tab until focus escaped, Cancelar | +1 click and a keyboard loop |
| Form teams and schedule | 1 + 1 | Same once the size field was blurred | 0 |
| Finalize a win | Result + confirm | Same | 0 |
| Change tab and go back | 1 click, Back returns | 1 click, Back left the site | Failure, not an extra click |
| Sair | 1 click to a login form | 1 click to a blank page | Dead end. Reload required |

## 4. Triage

> *This was generated by AI during triage.*

No issue tracker is configured, so nothing was filed. Category is bug or enhancement. State would be `ready-for-agent` for the crash and the contrast failure, because both are localized. The rest can wait.

| Finding | Category | Severity | Effort | Cost |
| --- | --- | --- | --- | --- |
| Sair blanks the app (hooks after the early return in `App.jsx`) | bug | Critical | Small | 1 click, then a reload. Resolved: those hooks now run before the login return in `src/App.jsx`, so Sair renders the login form. |
| Dark active tab 3.21:1 at 14px | bug | High | Small | Contrast. Keep 14px. Resolved: the dark active tab uses its own `#1a7f37` fill. The 14px label stays. Shared green text tokens were left alone. |
| Modal Escape, focus leak, no scroll lock | bug | High | Medium | +1 click to close, plus a keyboard loop. Resolved: a shared frame closes the top dialog on Escape, wraps Tab inside it, and locks page scroll while it is open. A confirm ignores the backdrop. |
| Back leaves the app; paths are not sections | enhancement | High | Medium | One Back is a dead end |
| Offline reload drops the controls while the title remains | bug | High | Medium | One reload |
| Empty name is silent | bug | Medium | Small | 1 wasted click. Resolved: empty Adicionar shows `Informe o nome do jogador.` next to the field. |
| Lesão / Cansado / Sub do not follow the `substitute` flag | bug | Medium | Medium | One click does more than the Lesão label says. Resolved: the queue has Cansado and Sub, not Lesão. Cansado on a field player asks who enters. Sub swaps that queue place and leaves the player available. |
| Duplicate Editar / Excluir names | bug | Medium | Small | Hesitation before the first click. Resolved: each accessible name includes the player, team, match, or goalkeeper it acts on. The visible words stay Editar and Excluir. |
| Placeholder-only name and filter fields | bug | Medium | Small | No size change required. Add a visible label at the current size. Resolved: Nome and Filtrar por nome are visible at the input size. Placeholders stay. |
| 13px checkbox; 34×44 stat buttons; 32px theme toggle | enhancement | Medium | Small | Touch. Do not shrink labels. Resolved: the checkbox row, stat buttons, and theme toggle now have a 44px hit area. Label sizes stay. |
| Input focus ring under 3:1 | bug | Medium | Small | Keep the 2px thickness. Darken the ring. Resolved: the ring is a solid 2px, `#1a7f37` in light and `#2ea44f` in dark. |
| Mixed alert / confirm / dialog | enhancement | Medium | Medium | Inconsistent recovery. Resolved: deletes and maintenance use the in-app confirm, with the same sentences. The two alerts are error toasts with the same sentences. |
| Zerar and duration save give no toast | enhancement | Low | Small | Zerar still changes the control. Resolved: Zerar toasts `Cronômetro zerado.` and Salvar duração toasts `Duração salva.` |
| Not present: new round, lock, rebalance, bulk, pagination, undo, command palette, session expiry, tiebreaker in this dataset | enhancement | Low | — | Inventory only. Not a defect by itself |

## 5. Next action

Fix the logout crash. Move the hooks that currently sit below the `if (!autenticado) return` in `src/App.jsx` above that return, so Sair renders the login screen instead of an empty document. Do it in a follow-up. This cycle does not change that file.

Resolved: the hooks in `src/App.jsx` now run before that return, so Sair renders the login form.

That is a broken exit, not a click-count problem. There is no click-reduction plan in this repo or in the notes searched for this cycle. Do not start one until Sair works.

Repeat the cycle with [rerun-spec.md](rerun-spec.md).
