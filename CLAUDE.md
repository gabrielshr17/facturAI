# CLAUDE.md — facturAI

Project-level notes. The global `~/.claude/CLAUDE.md` (architecture/workflow/quality rules) applies here too — this file only adds what's specific to facturAI, and calls out where the global template's generic assumptions don't fit this project's actual design.

## Where this project intentionally differs from the global template

The global CLAUDE.md's §1 ("Stack & Architecture") describes a generic always-online SPA + cloud backend + Controller–Service pattern. **facturAI is local-first by design, not by omission** — see `plan.md` ("Flujo de datos y modos"):

- **Default mode: 100% local, offline.** The client (Tauri desktop or PWA) talks directly to its own SQLite (`packages/core`'s `SqlDriver` abstraction). There is no backend call on the critical path, and there shouldn't be — a cashier ringing up a sale must never depend on network availability.
- **`packages/api` (Fastify) is optional, Fase 2 only.** It exists for the multi-cashier/multi-device cloud-sync mode (Supabase Auth + Postgres + PowerSync). Global rule "no critical business rule may exist only on the client" does not apply to the default local mode — the client *is* the authority there. It does apply once Fase 2 sync is active (see `packages/api/README.md` for what's wired vs. still scaffold).
- **No Controller–Service split** — `packages/core` holds domain logic + repos agnostic of transport; `packages/ui` holds screens shared by web/desktop; there's no per-platform controller layer because there's usually no server in the loop.
- Global §7 ("no binaries in the database") is a known gap, not an oversight: `comprobante_archivo.contenido_base64` stores files inline to match the local SQLite schema 1:1 until real Storage upload is implemented (see comment in `packages/api/db/schema.sql`).

## Design system

`design-guidelines.md` (repo root) is this project's DESIGN.md — established before this global file existed, so it's not named `DESIGN.md`, but it serves the same role and takes precedence for UI/UX questions here (keyboard-first, degrade-don't-block, chrome-before-content rules specific to a Dominican POS/cashier context). `packages/ui/src/estilos.ts` and `estilos-globales.css` are the only sources of style tokens — no ad hoc hex values in screens.

## Already compliant with the global rules

- Icons: `lucide-react` throughout, no emoji-as-icon.
- Branding: custom SVG mark (`packages/ui/src/componentes/Marca.tsx`), not a generic icon.
- Git workflow: work happens on descriptive feature branches (e.g. `brand-mark-and-facturai-rename`), not directly on `main`.
- Secrets: `.env` files are gitignored in every package that has one (`api`, `web`, `desktop`); nothing hardcoded.
- TypeScript everywhere; no comments except where a non-obvious constraint/workaround needs one (this codebase's existing convention already matches the global "self-explanatory code" rule, slightly relaxed for genuine gotchas).

## Linting & formatting

ESLint (flat config, `eslint.config.mjs` at repo root) + Prettier are set up across all 5 packages:

- `pnpm lint` / `pnpm lint:fix` — ESLint (typescript-eslint + react + react-hooks recommended sets; `@typescript-eslint/no-explicit-any` is an **error** per the global rule).
- `pnpm format` / `pnpm format:check` — Prettier (`.prettierrc.json`, 120-char width to match this codebase's existing style).
- `react-hooks/set-state-in-effect` (a new/experimental v7 rule aimed at the React Compiler) is downgraded to `warn` — as configured it flags dozens of legitimate, working patterns (resetting state at the top of a debounced-search effect, etc.) as hard errors. Don't re-promote it to `error` without actually rewriting those effects first.
- **The existing codebase was never run through Prettier before this setup** — a first `pnpm format` across everything currently uncommitted/pre-existing code would touch ~96 files in one mechanical diff. Do that as its own isolated commit (after committing whatever's in progress), not mixed into unrelated work.
- A `PostToolUse` hook (`.claude/settings.json` → `.claude/hooks/lint-on-edit.mjs`) runs `eslint --fix` on every `.ts`/`.tsx` file Claude writes or edits, scoped to just that file (not a full-repo lint on every keystroke). On Windows, the hook uses `execSync` (shell) rather than `execFileSync` — the latter fails with `ENOENT` on `npx` there since it doesn't resolve the `.cmd` shim.

## MCP servers

Only a subset of the global list is relevant to facturAI (no Figma/Canva/Google Workspace/Pencil integration planned here):

- **Supabase MCP** — configured (`claude mcp add supabase -s local ...`, project-scoped to `--project-ref=ncbpbhfryoybdesckkpp`). Uses a **personal access token** (account-wide credential, different from the project's anon/service_role keys already in `.env` files) — stored in `local` scope (`.claude.json`, gitignored, this machine only), never committed. Has write access to the `facturai` Supabase project, not just read.
- **GitHub MCP** — configured (`@modelcontextprotocol/server-github`, `local` scope, `GITHUB_PERSONAL_ACCESS_TOKEN` env var — a classic PAT with repo scope). `gh` CLI isn't installed on this machine either, so this MCP is genuinely additive, not redundant.
- Both are `local`-scope (`.claude.json`, this machine only) since the credentials are personal, not project-shared — re-run the `claude mcp add` commands above (with a fresh token) on any other machine.

## Not yet set up

- **No pre-commit secrets scanner** (Gitleaks/Trufflehog) installed yet.

## Commands (this repo uses pnpm workspaces, not npm)

```bash
pnpm install                          # workspace setup
pnpm --filter @sfr/web dev            # web dev server (localhost:5173)
pnpm --filter @sfr/desktop dev        # Tauri desktop dev
pnpm --filter @sfr/api dev            # Fase 2 backend (localhost:3001), optional
pnpm -r test                          # unit tests (vitest) across all packages
pnpm -r typecheck                     # tsc --noEmit across all packages
pnpm --filter @sfr/desktop build      # produces MSI + NSIS installers under src-tauri/target/release/bundle
```
