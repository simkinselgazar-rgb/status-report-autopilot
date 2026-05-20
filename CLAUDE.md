---
date: 2026-05-15
tags: [project, code, nextjs, typescript, open-source, agency]
type: project
status: active
---

# CLAUDE.md. Status Report Autopilot

## Project Overview
**Being repositioned (decided 2026-05-19) from a closed paid SaaS to an open-source, self-hostable build-in-public release**, see Current State + [[Business Function AI Templates/ROADMAP|ROADMAP]]. A weekly-cadence approval queue for agency PMs and project teams: reads project-tool data, meeting transcripts, and team comms; generates per-client client-facing narratives; the PM scans, lightly tweaks, and ships via branded email + PDF + shareable link. Built on patterns mirroring [[Business Function AI Templates/workflow-engine|workflow-engine (P0 #4)]].

**Authoritative spec:** [[Business Function AI Templates/Status Report Autopilot - Design Brief|Design Brief]], every UX/build decision flows from there.

**License:** Being relicensed **Apache 2.0** as part of the open-source repositioning. Until that lands the repo is still proprietary-configured, no `LICENSE` file, `package.json` is `"private": true`, so do not publish yet.

## Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript strict, ESM
- **Styling:** Tailwind v4 (CSS-based config in `globals.css`, no `tailwind.config.ts`)
- **Agent runtime:** `@mastra/core` + `@mastra/pg` + `@ai-sdk/anthropic` (prod) + `@ai-sdk/openai-compatible` (local dev model) (mirrors [[Business Function AI Templates/workflow-engine|workflow-engine]] patterns; shared agents may move into a workflow-engine library later)
- **Persistence:** Postgres, `@mastra/pg` for agent state + Drizzle ORM (`drizzle-orm` / `pg`) for the product DB (`clients`, `reports`). One database; migrations versioned in `drizzle/`.
- **Email:** Resend (`resend`) + `@react-email/components`, the report email template and send live in `src/lib/email/`.
- **PDF:** `@react-pdf/renderer`, the report PDF lives in `src/lib/pdf/` (`serverExternalPackages` keeps it a runtime import).
- **Tests:** Vitest

## Conventions
- **File naming:** `kebab-case.tsx` for components, `PascalCase` for component exports, `camelCase` for utils
- **Routes:** App Router with route groups, `(dashboard)` for the PM-facing app, `(onboarding)` for the wizard, `api/` for server handlers
- **Server components by default.** Mark `'use client'` only when interaction or browser APIs are needed.
- **No `any`.** Use `unknown` + zod (Mastra ships zod) for runtime validation at boundaries.
- **Engine init lives in `src/lib/engine.ts`.** Agents/workflows are wired there once and re-used. Routes never call `new Mastra()` directly.
- **Env vars:** read in `src/lib/env.ts` only; downstream code receives typed config.
- **Imports order:** Node built-ins → external pkgs → `@mastra/*` → `next/*` / `react` → relative, separated by blank lines.

## File Structure
| What | Where | Naming |
|---|---|---|
| Root layout + globals | `src/app/layout.tsx`, `src/app/globals.css` |  |
| Dashboard routes | `src/app/(dashboard)/` | `page.tsx`, `layout.tsx` |
| Onboarding wizard | `src/app/(onboarding)/` | `page.tsx` |
| Public shareable report | `src/app/r/[token]/` | `page.tsx`, `pdf/route.ts` |
| API handlers | `src/app/api/<resource>/route.ts` |  |
| Mastra engine wiring | `src/lib/engine.ts` |  |
| Product DB (Drizzle) | `src/lib/db/` | `schema.ts`, `index.ts`, `queries.ts`, `seed.ts` |
| Email (Resend) | `src/lib/email/` | `report-email.tsx`, `send.tsx` |
| PDF (react-pdf) | `src/lib/pdf/` | `report-pdf.tsx` |
| Typed env access | `src/lib/env.ts` | the only reader of `process.env` |
| Connectors (Asana/Linear/Slack/etc.) | `src/lib/connectors/<name>.ts` | one file per connector |
| Report agent + draft logic | `src/lib/reports/` | `narrative-agent.ts`, `digest-prompt.ts`, `types.ts`, `period.ts`, `recurring.ts` |
| Cron (recurring generation) | `src/app/api/cron/<job>/route.ts` |  |
| Shared UI | `src/components/` | `<Component>.tsx` |
| Tests | `tests/` | `<thing>.test.ts` |

## Testing
- Run all: `npm test`
- Run one: `npm test -- <pattern>`
- Type check: `npm run typecheck`
- Dev server: `npm run dev` (Next.js on :3000)

## Architecture (per design brief)
- **Two-pane dashboard, client-as-primary-unit.** Left pane = clients list with this-week status. Right pane = report draft view with header / narrative body / trailing approve bar.
- **Approve-with-tweaks HITL.** PM scans, edits 1-2 lines inline, hits "Approve & send", **auto-advances** to next pending draft. The auto-advance is the wedge, a whole week ships in one focused 30-min block.
- **Source provenance always one click away.** Never hidden. The collapsible drawer shows the Asana tickets / Slack threads / transcript snippets the AI used.
- **Engine boundary:** This wrapper depends on Mastra primitives that mirror [[Business Function AI Templates/workflow-engine|workflow-engine]]. When workflow-engine publishes a stable shared library, migrate shared agents there. Until then, vertical-specific connectors (Asana, Linear, Slack, Google Calendar, Zoom transcripts) live in this repo.

## Locked Decisions (from brief)
| Fork | Decision |
|---|---|
| Output channel | Branded email + PDF + shareable link |
| Distribution | Open-source, self-hosted, BYO-key (~~per-active-client paid tiers~~, superseded 2026-05-19) |
| HITL model | Approve-with-tweaks (2-5 min PM scan) |
| Brand voice ownership | Agency-as-tenant (per-client overrides a later enhancement) |

## Current State
**Onboarding wizard built 2026-05-15.** Deps installed (Mastra 1.x). The 4-step wizard is live at `/onboarding`, select client → connect sources (mocked) → set voice → pick cadence → magic-moment generated first draft. Editorial paper-and-ink design system in `globals.css` (Literata + Hanken Grotesk, OKLCH palette, pine = connected/settled). Build + typecheck pass.

**Asana connector built 2026-05-16.** First real source integration:
- `src/lib/connectors/types.ts`, source-agnostic contracts: `Connector`, `ConnectorWindow`, `SourceEvent`, `ActivityDigest`, typed `ConnectorError`. The narrative agent will consume `ActivityDigest` without knowing the source.
- `src/lib/connectors/asana.ts`, `createAsanaConnector()`: bearer auth (PAT or OAuth token), cursor pagination, 429/5xx retry with `Retry-After`, zod boundary validation. `verify()` / `listWorkspaces()` / `listProjects()` / `fetchActivity(window)`, the last normalizes tasks + stories into in-window `SourceEvent`s with actor attribution.
- `src/lib/connectors/http.ts`, shared route helpers: `badRequest()` + `connectorErrorResponse()` (maps `ConnectorError` codes to HTTP status + user-facing copy).
- `src/app/api/connectors/asana/{verify,projects}/route.ts`, `POST { accessToken }` → identity, and `POST { accessToken, workspaceGid }` → projects. The HTTP seams the connect step calls.
- `tests/connectors/asana.test.ts` (vitest, 15 tests), verify, auth/bad-response failure, normalization + window filtering, pagination, 429 retry, `listProjects`, route 400s. `vitest.config.ts` adds the `@/` alias.

**Wizard connect step wired 2026-05-16.** The onboarding connect step is now real for Asana:
- `src/components/onboarding/asana-connect.tsx`, inline expandable connect flow (no modal): paste token → verify → pick workspace/project → connected. Local phase state machine; honest error states; smooth `grid-rows` height animation.
- `step-connect-sources.tsx`. Asana row is interactive; Linear/Slack/Google Calendar show a "Soon" tag (honest, not fake-connecting).
- `OnboardingState` now carries `asana: AsanaConnection | null` (replaces the mocked `connectors` record); the step gates on a real connection.

**Narrative agent built 2026-05-16.** The status-report generator:
- `src/lib/reports/types.ts`, the canonical `StatusReportDraft` zod schema (headline, greeting, 4 section kinds with provenance-linked items, signoff) + `ReportVoice` / `NarrativeResult`.
- `src/lib/reports/digest-prompt.ts`, pure, tested: `assessSufficiency` gate (a too-quiet week returns `insufficient` without calling the model), `buildNarrativePrompt`, `finalizeDraft` (canonical section order, duplicate merge, hallucinated-id filtering, agency sign-off override), `formatPeriodLabel`.
- `src/lib/reports/narrative-agent.ts`, the Mastra `Agent` + `generateStatusReport()`. Model routing: prod runs Claude Sonnet 4.6 direct to Anthropic; when `GOOGLE_GENERATIVE_AI_API_KEY` is set (dev), the agent runs Gemini 3 Flash direct to Google for cheap iteration. Mastra's model router resolves each provider's key from env. Registered in `engine.ts`. The app uses no Anthropic-only API features yet (no prompt caching, citations, etc.), model choice is currently free.
- `src/lib/env.ts`, typed `process.env` access; `engine.ts` refactored onto it.
- `src/app/api/reports/generate/route.ts`, `POST { client, period, asana, voice }` → pulls the Asana digest, runs the agent, returns a `drafted` or `insufficient` result.
- `tests/reports/narrative.test.ts` (vitest, 18 tests), sufficiency gate, prompt assembly, draft guards, period labels, route 400s. 33 tests total; build + typecheck pass.

**Onboarding magic-moment wired to real generation 2026-05-17.** The wizard's final step runs a real report:
- `onboarding-wizard.tsx`, step 4 calls `POST /api/reports/generate` with the live `AsanaConnection` + voice; `runGeneration()` maps the response to a `drafted` / `insufficient` / `error` outcome. A 2.6s minimum hold keeps the `Generating` animation from flashing by.
- `generating.tsx`, now visual-only with honest copy (Asana is the only connected source; the last line stays active until the draft lands).
- `first-draft.tsx`, renders the real `StatusReportDraft` (props, not a built mock).
- `generation-notice.tsx` (new), calm `insufficient` / `error` states, each with a way forward.
- `mock-draft.ts` deleted, `StatusReportDraft` is now the only draft type.

**Dashboard built 2026-05-17.** The two-pane review surface (brief §4) at `/`:
- `src/lib/dashboard/{types,seed}.ts`, `ClientReport` + a 5-client in-memory seed (drafts / sent / insufficient) shaped exactly like `/api/reports/generate` output, so swapping in the product DB later is a data-source change, not a UI change.
- `src/components/dashboard/`, `dashboard.tsx` (shell + state + J/K nav + approve→send→auto-advance), `client-list.tsx` (left pane), `report-view.tsx` (header / narrative / approve bar; draft, sent, insufficient, empty states), `editable-line.tsx` (inline click-to-edit, no modal), `source-drawer.tsx` (provenance), `status-pill.tsx`.
- `src/app/(dashboard)/page.tsx` serves `/`; the old placeholder `app/page.tsx` is deleted.
- The wedge is real: approve a draft → send → auto-advance to the next pending draft. Inline edits commit on blur. J/K moves between clients. All browser-verified on the seed data.

**Model routing swapped to direct Google 2026-05-17.** Dev no longer goes through OpenRouter, when `GOOGLE_GENERATIVE_AI_API_KEY` is set the agent runs Gemini 3 Flash direct to Google (Mastra router native). Simpler and marginally cheaper; we gave up OpenRouter's cross-provider A/B since the dev model is settled.

**Design-skills pass on the dashboard 2026-05-17** (impeccable + emil-design-eng + design-taste-frontend):
- Motion (emil): `anim-report`, a fast 240ms entrance on every report switch (kept subtle: seen tens of times a session); the approve wedge is now choreographed, spinner + "Sending…" for ~1.1s → the sent checkmark settles in (`anim-confirm`) → ~0.75s hold → auto-advance.
- impeccable audit: flattened a card-in-card in the insufficient view; added `focus-visible` rings to client-list rows and inline-edit lines.
- taste audit: `h-screen` → `h-dvh` on the shell.

**Product DB built 2026-05-17.** The dashboard now persists. Drizzle ORM + Postgres replaced the in-memory seed:
- `src/lib/db/schema.ts`, two tables. `clients` (name, recipient, the agency voice columns, weekly cadence, an `asana_connection` jsonb) and `reports` (FK to `clients` `ON DELETE CASCADE`; `period_label`, `status`, `generated_at`, `events_used`, `draft` jsonb, `insufficient_reason`, `source_events` jsonb, `sent_at`, timestamps). Migrations versioned in `drizzle/`. PM inline-edits update `reports.draft` in place, no separate edit-history table.
- `src/lib/db/index.ts`, `getDb()`: lazy, `globalThis`-cached `pg` pool (one pool across Next dev hot-reloads; importing the module never connects or throws, so routes/tests import the query layer freely).
- `src/lib/db/queries.ts`, `listReports()` (join → `ClientReport[]`), `updateReportDraft`, `setReportStatus`, and the pure `toClientReport` join→view-model mapper (unit tested without a DB).
- `src/lib/db/seed.ts`, `npm run db:seed` loads the five demo clients/reports from the dashboard fixture. Self-contained (own pool, relative imports) so `tsx` runs it as a plain script.
- `src/app/(dashboard)/page.tsx`, now an async server component (`force-dynamic`) that reads `listReports()` and hands `initialReports` to `<Dashboard>`. Local state stays optimistic.
- `src/app/api/reports/[id]/route.ts`, `PATCH` persists a draft edit or a status move; the dashboard's `changeDraft` / `approve` / `undo` all call it. The approve choreography is unchanged, the send is persisted during the existing "sending" beat.
- Scripts: `db:generate` / `db:migrate` / `db:seed`. Dev Postgres is local Homebrew `postgresql@16`; the committed `.env` connection string (`postgres://postgres:postgres@localhost:5432/status_report_autopilot`) works against it. 41 vitest tests; typecheck + build green; read / approve-survives-reload / inline-edit-persists all browser-verified.

**Onboarding wizard persisted 2026-05-17.** The wizard now writes a real client into the product DB:
- `step-select-client.tsx`, step 1 collects a **client email** alongside the name (`OnboardingState.clientEmail`); Continue gates on a valid email. The DB requires `clients.recipient` and the dashboard's approve→send targets it.
- `POST /api/clients` + `createClientWithReport` (`db/queries.ts`), one transaction inserts the `clients` row + its first `reports` row (status `draft`), so a failed report insert never orphans a client.
- `/api/reports/generate` now also returns `sourceEvents` (the digest events) so the persisted report carries full provenance.
- `onboarding-wizard.tsx`, `finishOnboarding` POSTs the full state + drafted report to `/api/clients`, then `router.push('/')`. `first-draft.tsx`, the magic-moment CTA is now a button with saving + calm `role="alert"` error states (was a bare `<Link>`).
- Scope: only the **drafted** outcome persists, an insufficient first week keeps the retry/restart screen, no half-onboarded client.
- Design pass (emil-design-eng): `buttonClasses()` now transitions `opacity` (disabled buttons ease instead of snapping, visible on the step-1 Continue gate); the finish-error line fades in via `.anim-fade`.
- Browser-verified: step 1's email gate, `POST /api/clients` → 201, and the new client rendering on the dashboard with its onboarded recipient on the approve bar.

**Shareable link built 2026-05-17.** First delivery piece (brief's locked output channel: email + PDF + link):
- `reports.share_token`, a `uuid` capability column, `notNull unique defaultRandom`, distinct from `reports.id` so the public URL never exposes the internal id used by the mutation API. DB-generated; the app never sets it.
- `GET /r/[token]` (`src/app/r/[token]/page.tsx`, `force-dynamic`), the public report. `getReportByShareToken` (uuid-format guard before any DB call); `notFound()` unless the report is `sent`, so a link never leaks an unapproved draft.
- `PublicReport` (`src/components/public/`), a standalone read-only branded document; reuses the report design language from `first-draft.tsx` (Literata, the warm card, `.anim-settle` reveal).
- `CopyLinkButton`, in the dashboard's sent-state, copies `origin + /r/ + shareToken`. `ClientReport` carries `shareToken`.
- Design pass (emil): the copy button has a fixed `min-w` so the "Copy link" → "Link copied" label swap never reflows.
- 47 vitest tests; typecheck + build green. Browser-verified: public page renders for a sent report, 404s for draft/garbage/unknown tokens, copy button copies the correct URL.

**Branded email built 2026-05-17.** Second delivery piece, approving a report now emails the client:
- `src/lib/email/report-email.tsx`, the `ReportEmail` react-email template: a branded editorial document (Georgia serif stack, the paper-and-ink palette as hex) mirroring the on-screen report.
- `src/lib/email/send.tsx`, `sendReportEmail(report)` renders HTML + plain text and sends via Resend. **No `RESEND_API_KEY` → returns `skipped`** so dev works with no email provider; a real Resend failure throws.
- `PATCH /api/reports/[id]`, on `status: sent` it fetches the report (`getReportById`), emails the client, and only calls `setReportStatus('sent')` if the send succeeded (or was skipped). A real send failure → 502 and the report stays a draft to retry.
- Env: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` (the last builds the absolute `/r/[token]` link inside the email).
- 53 vitest tests; typecheck + build green. Verified: the template render (HTML + plain text), the no-key skip path, approve→sent with no key. The actual Resend delivery is unverified, it needs a real API key.

**PDF built 2026-05-17, delivery is complete.** Third and final delivery piece:
- `src/lib/pdf/report-pdf.tsx`, `ReportPdf`, a `@react-pdf/renderer` document (Letter, built-in Times/Helvetica for zero bundled fonts, the paper-and-ink palette) + `renderReportPdf(report)` → PDF `Buffer`.
- `sendReportEmail` now renders the PDF alongside the email and attaches it to the Resend send.
- `GET /r/[token]/pdf` (`src/app/r/[token]/pdf/route.ts`), streams the PDF; 404s unless the report is `sent`, mirroring the public page. `PublicReport` gained a Download PDF link.
- `next.config.ts`, `@react-pdf/renderer` in `serverExternalPackages`.
- 55 vitest tests; typecheck + build green. Browser-verified: the PDF route serves a valid PDF for a sent report and 404s a draft; the public page Download PDF link works. The PDF render itself was visually verified.

All three brief-locked delivery channels now ship: **shareable link + branded email + PDF**.

**Asana OAuth built 2026-05-17.** The connect step is a hosted OAuth flow, the PAT paste is gone:
- `src/lib/connectors/asana-oauth.ts`, `buildAuthorizeUrl(state)`, `exchangeCodeForToken(code)` (zod-validated, injectable fetch), and `popupResultPage` (the HTML the popup ends on, it postMessages the result to the opener, then closes).
- `GET /api/connectors/asana/authorize`, sets a single-use CSRF `state` cookie, redirects to Asana consent. `GET /api/connectors/asana/callback`, validates `state`, exchanges the code, ends the popup.
- `asana-connect.tsx`, "Connect Asana" opens the consent popup; the wizard listens for the postMessage, then runs the existing verify → project-pick steps. A **popup** (not a full-page redirect) is used so the wizard's in-memory state survives the round-trip.
- `AsanaConnection` gained `refreshToken` + `tokenExpiresAt`. Env: `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`; the redirect URL to register on the Asana app is `<APP_URL>/api/connectors/asana/callback`.
- 60 vitest tests; typecheck + build green. Browser-verified the full popup → postMessage → wizard plumbing (it surfaces the "not configured" error, since dev has no Asana app yet). The real token exchange needs a registered Asana app.
- **Deferred:** Asana access tokens expire in ~1h. The refresh token is captured but refresh-on-expiry is not wired, it lands with recurring report generation (which does not exist yet). Onboarding's immediate first report is unaffected.

**Linear connector + harden pass 2026-05-17.**
- `src/lib/connectors/linear.ts`, `createLinearConnector`, the second source integration. Linear's API is GraphQL: cursor pagination, 429/5xx retry, zod validation, token-agnostic auth (personal key sent raw, OAuth token sent as `Bearer`, detected by `lin_oauth_` prefix), and GraphQL-errors-inside-a-200 handling. Maps issues (created/completed) + comments to `SourceEvent`s; implements `Connector` + `listWorkspaces`/`listProjects`. 15 vitest tests (fake fetch). **Connect-step UI (Linear OAuth) is the remaining piece**, the connector module itself is done.
- Branded 404, `src/app/r/[token]/not-found.tsx`: a calm page for dead / unsent report links instead of the raw Next 404.
- Dashboard error boundary, `src/app/(dashboard)/error.tsx`: a DB-connection failure surfaces here with a Try-again retry, not an unstyled crash.
- Cosmetic debt cleared, all three inline `oklch()` literals are now `@theme` tokens: `--color-ochre-ink` (draft pill text), `--color-danger` (error text), `--color-ink-hover` (primary-button hover).
- 75 vitest tests; typecheck + build green. Branded 404 browser-verified.

**Multi-connection model + Linear end-to-end 2026-05-17.** A client can now connect more than one source, and Linear is fully wired:
- **Connection model**, `SourceConnection` is a discriminated union (`AsanaConnection | LinearConnection`, on `source`) in `onboarding/types.ts`. `clients.asana_connection` (single jsonb) → `clients.connections` (jsonb array, `notNull default []`). `OnboardingState.connections: SourceConnection[]`. Connections are embedded jsonb, not a table, a small child-aggregate always read with the client.
- **Linear OAuth**, `linear-oauth.ts` mirrors `asana-oauth.ts`; the popup-page HTML is now the shared `oauth-popup.ts` (`popupResultPage`), which each provider binds to its own message-source + state cookie. `GET /api/connectors/linear/{authorize,callback,verify,projects}`. Env: `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`; redirect URL `<APP_URL>/api/connectors/linear/callback`.
- **Generalized connect UI**, `asana-connect.tsx` became `connector-connect.tsx`: one config-driven component (OAuth popup → verify → workspace/project pick) that drives Asana *and* Linear off `meta.id`. `step-connect-sources` renders it for every available connector; the step gates on `connections.length > 0`.
- **Source-aware generation**, `src/lib/connectors/connection.ts`: `sourceConnectionSchema` (zod, validates connections at API boundaries) + `createConnectorForConnection` (factory). `POST /api/reports/generate` and `/api/clients` take `connections[]`; the generate route builds a digest per connection and the agent blends them (`digests[]` was always multi-source).
- 85 vitest tests; typecheck + build green. Browser-verified: the connect step shows Asana + Linear as connectable, and the Linear popup → postMessage → wizard loop works (surfaces the "not configured" error, no Linear app in dev).

**Slack connector, end-to-end 2026-05-17.** The third source, fully wired:
- `src/lib/connectors/slack.ts`, `createSlackConnector`. Slack's Web API is RPC-over-HTTP: every call returns `200` with an `{ ok, error }` envelope; cursor pagination; Bearer auth; 429/5xx retry. `verify` (`auth.test`), `listProjects` (`conversations.list`. Slack channels are the connector's "projects"), `fetchActivity` (`conversations.history` → messages as `comment` `SourceEvent`s, poster names resolved via `users.list`, bot/system noise skipped).
- `slack-oauth.ts` + `/api/connectors/slack/{authorize,callback,verify,projects}`. OAuth v2 (`oauth.v2.access` answers `200` even on failure, so failure is read from the body). Env: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`.
- `SlackConnection` joined the `SourceConnection` union; `connector-connect.tsx` gained a per-source noun so Slack's picker reads "channel" not "project".
- 100 vitest tests; typecheck + build green. Browser-verified the connect step (Asana + Linear + Slack connectable) and the Slack popup → postMessage loop.
- **Note:** Slack bot tokens can only read a channel's history once the bot is invited to that channel, documented in `.env.example`.

**Google Calendar connector, end-to-end 2026-05-18.** The fourth source, fully wired:
- `src/lib/connectors/google-calendar.ts`. Calendar API v3 (Bearer auth, `pageToken` pagination, retry). `verify` returns a single synthetic workspace (Google has no workspace layer, an account holds calendars directly), `listProjects` lists calendars, `fetchActivity` reads timed events from one calendar as **`meeting`-kind** `SourceEvent`s (cancelled / all-day / out-of-window skipped). `meeting` was added to `SourceEventKind`.
- `google-calendar-oauth.ts` + `/api/connectors/gcal/{authorize,callback,verify,projects}`. Google OAuth (`access_type=offline` + `prompt=consent` for a refresh token; `calendar.readonly` scope). Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- `connector-connect.tsx`'s per-source noun gained `gcal → "calendar"`.
- 115 vitest tests; typecheck + build green. Browser-verified: the connect step shows all four sources connectable and the Google popup → postMessage loop works.

**Zoom connector, end-to-end 2026-05-18.** The fifth source, and the last v1 connector, fully wired:
- `src/lib/connectors/zoom.ts`, `createZoomConnector`. Reads a Zoom user's cloud recordings (`GET /users/{id}/recordings`, calendar-date `from`/`to`, `next_page_token` pagination, Bearer auth, 429/5xx retry). Each recorded meeting becomes a `meeting`-kind `SourceEvent`; when the recording carries a `TRANSCRIPT` file the connector downloads the VTT and rides a plain-text excerpt (timing cues stripped, capped at 1500 chars) along as the event `detail`, the transcript is the reason Zoom earns a connector over plain calendar data. A meeting with no transcript (transcription off) falls back to a duration line; a failed transcript download is non-fatal, a `warnings` entry, then the same fallback. Zoom has no workspace layer, so `verify` returns a single synthetic workspace and `listProjects` returns a single "project", the authenticated user's recordings (a non-admin OAuth token can only see its own).
- `zoom-oauth.ts` + `/api/connectors/zoom/{authorize,callback,verify,projects}`. OAuth; the token endpoint authenticates the client with HTTP Basic (`client_id:client_secret`), not body fields, and returns a refresh token. Env: `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`.
- `ZoomConnection` joined the `SourceConnection` union; `connector-connect.tsx`'s per-source noun gained `zoom → "host"`. The now-dead `'loom'` `SourceId` was replaced by `'zoom'` (Loom dropped from v1).
- 131 vitest tests; typecheck + build green. Browser-verified: the connect step shows all five sources connectable and the Zoom popup → postMessage loop works (surfaces the "not configured" error, no Zoom app in dev).

**Local dev model wired 2026-05-18.** The narrative agent's dev model can now be a local OpenAI-compatible endpoint:
- `resolveModel()` in `narrative-agent.ts`, when `LOCAL_MODEL_URL` is set, the agent runs that endpoint's model via `@ai-sdk/openai-compatible` (`LOCAL_MODEL_NAME` picks the served id); it takes precedence over the Google dev model. Routing precedence: local → Google → Anthropic. Prod (direct Anthropic) is untouched.
- A local OpenAI-compatible endpoint has no constrained decoding, so its native structured-output channel returns nothing. When on the local model the agent passes `structuredOutput.jsonPromptInjection: true`, which makes Mastra inject the schema into the prompt and parse the text itself; Anthropic/Gemini keep their native (more reliable) path.
- Endpoint-verified against a live local model on a developer machine: a hand-built digest produced a schema-valid `StatusReportDraft` with accurate `sourceEventIds` (~20s/generation).

**Recurring report generation built 2026-05-18, the weekly heartbeat.** Until now a client only ever got the onboarding first draft; recurring generation produces a fresh draft each week on the client's cadence. Built across five reviewed phases:
- **Schema + period keys**, `clients.timezone` (IANA) and `reports.periodStart` (the Monday of the covered Mon–Fri week) with a unique `(clientId, periodStart)` index that makes generation idempotent. `src/lib/reports/period.ts`, `previousReportWeek` / `cadenceMoment`, pure timezone math via `Intl` (no date library).
- **Per-client timezone**, onboarding's cadence step has a timezone picker (defaults to the PM's detected zone); the magic-moment now drafts the actual previous calendar week, not a rolling 7 days.
- **Connector token refresh**, `refreshAccessToken()` on the Asana / Google / Zoom OAuth modules (Linear/Slack tokens don't expire). `ensureFreshConnection()` in `connection.ts` refreshes a connection when its token is within 5 min of expiry. Zoom rotates its refresh token, so the rotated one is captured; `updateClientConnections()` persists the rotated set.
- **Orchestrator**, `src/lib/reports/recurring.ts`: `runDueReports(now)` iterates the roster, skip not-due, skip already-reported, else refresh tokens → pull the prior week's activity → run the narrative agent → persist (`createReport`, idempotent). `isDue` is true once the cadence slot passes and stays true all week, so a missed cron tick self-heals. Per-client failures are isolated; the run returns a tallied summary. Dependencies are injectable so the loop is unit-tested with no DB.
- **Cron route**, `GET /api/cron/generate-reports`, guarded by `CRON_SECRET` (fails closed, 503 unconfigured, 401 on a bad token). `vercel.json` schedules it hourly (UTC); per-client timezone logic means each client still fires in their own zone. Scheduler-agnostic, any scheduler sending the bearer token works. `maxDuration` 300s.
- **Dashboard queue bounded**, `listReports()` is newest-first; actionable reports (draft/insufficient) always shown regardless of age, sent reports windowed to 35 days, so the queue can't grow without bound.
- 161 vitest tests; typecheck + build green. Cron route + dashboard browser-verified; `runDueReports` ran live against the seeded DB.

**Auth + billing built 2026-05-18, the app is now multi-tenant and paywalled.** Built across reviewed phases (auth 1a/1b, billing 2a/2b/2c):
- **Auth. Better Auth, self-hosted.** Social-only sign-in (Google + Microsoft); identities + sessions live in this app's Postgres, no third-party identity store. An "agency" is a Better Auth **organization** (the org plugin), the tenant. `src/lib/auth/` holds the server config, the React client, and `getAgencySession()`; `/api/auth/[...all]` serves it. `src/middleware.ts` is an optimistic session-cookie gate (no DB call); the real session + agency check is per-page/route via `getAgencySession()`. New `/sign-in`, `/welcome`, and agency-setup screens.
- **Tenancy scoping.** `clients.agencyId` (FK → `organization.id`, cascade) is the tenant key. `listReports` / `getReportById` / the draft + status mutations are all agency-scoped; the data API routes 401 without an agency session. `getReportByShareToken` stays public (the `/r/` link); the cron's roster queries stay global by design.
- **Billing. Stripe via the Better Auth Stripe plugin.** The agency (organization) is the billed customer. Three tiers gate active clients, **Starter 5 / Growth 15 / Scale unlimited**, each with a 7-day card-upfront trial; `src/lib/billing/plans.ts` is the source of truth. A `/billing` page renders the tiers as one editorial divided rate-card, plus a current-plan panel once subscribed; `/` and `/onboarding` redirect an unsubscribed agency to `/billing`. `POST /api/clients` returns 402 past the tier's client limit (the onboarding wizard surfaces the message); `runDueReports` skips clients whose agency has no usable subscription. The Stripe webhook lands on the auth catch-all (`/api/auth/stripe/webhook`), no new route. Migration `0007` adds the `subscription` table + `stripe_customer_id`. 166 vitest tests.
- **Manual setup before billing goes live:** create three recurring Products in the Stripe dashboard + a webhook endpoint, and set the `STRIPE_*` env vars. Sign-in needs registered Google + Microsoft OAuth apps. The auth-gated surface is unverified end-to-end in dev (no OAuth app configured), verified up to the credential boundary, same as the connectors.

The credentialed paths (the five connector OAuth flows + generation + token refresh, Resend email send, Stripe checkout/webhook, social sign-in) are unverified end to end, they need live keys, so each was verified up to the credential boundary.

**Repositioning to open-source, decided 2026-05-19.** A demand-validation pass (see `../research/demand-validation-2026-05.md`) returned a MODERATE verdict for SRA as a *paid* product, real problem, unproven willingness-to-pay, commoditizing connectors, crowded with DIY builders. Decision: finish SRA and release it open-source as a build-in-public credibility asset, not a paid SaaS. Locked scope:
- **Connectors → bring-your-own-token auth**, no per-deployer OAuth-app registration. Asana/Linear/Slack paste a token (done, sub-phase 3a); Zoom (3b) and **Microsoft Teams** (3c, promoted from v1.1 into v1) use a Server-to-Server credential triple the connector mints tokens from.
- **Model layer → BYO**, an OpenRouter key or a local OpenAI-compatible endpoint; replaces the prod/dev Anthropic-vs-local routing.
- **Stripe billing → parked**, disabled for the OSS release, code kept on a branch for a possible future hosted offering.
- **Auth → single-deployment**, the multi-agency org/tenant layer dropped; team logins kept.
- **Packaging → Docker Compose** (app + Postgres) with an in-app scheduler, so `docker compose up` is the whole install.
- **A one-screen first-run setup UI** (connect the AI model) + a branded setup guide ([[AI Enablement Document Kit]] branding) with local-model hardware recommendations.
- **Apache-2.0 license** + public repo.

The closed-product build documented above is feature-complete and frozen as the starting point for this repositioning.

**Repositioning progress (2026-05-19):**
- **Google Calendar deferred** (commit `5160050`), no clean BYO-token path; dropped from the v1 connector set. The set is now Asana + Linear + Slack + Zoom (+ Teams, pending 3c).
- **3a. Asana/Linear/Slack on token auth** (commit `240c7bc`). OAuth-popup connect replaced by a paste-your-token panel; their OAuth modules + authorize/callback routes deleted; no OAuth-app env vars.
- **3b. Zoom on Server-to-Server auth** (commit `6f14c62`). Zoom drops OAuth for a pasted credential triple (account id / client id / client secret); the connector mints its own tokens. `SourceConnection` is now a divergent union; the **refresh machinery is fully removed** (`ensureFreshConnection`, `oauth-popup.ts`, etc.). The connect UI is a generic multi-field credential form, **no OAuth flow remains anywhere**.
- Connectors no longer use any `*_CLIENT_ID/SECRET` env vars, every credential is pasted in the wizard.

**Next:** continue the repositioning, build order: 3a ✓ → 3b ✓ → **3c Microsoft Teams connector** (next) → BYO model config → park billing + simplify auth → Docker Compose packaging + in-app scheduler → first-run setup UI + branded guide → Apache-2.0 license + public repo → local end-to-end test. See [[Business Function AI Templates/ROADMAP|ROADMAP]] and the task list. v1.1 connectors (ClickUp, Jira, HubSpot, Loom, Google Meet) remain a later enhancement.

## Design System
- Tokens live in `src/app/globals.css` (`@theme`): warm light palette, `paper`, `surface`, `sunk`, `ink`/`ink-soft`/`ink-faint`, `line`, `pine` (connected/done), `ochre`/`focus`.
- Fonts: **Literata** (serif, headings + the report narrative, the product's "voice") + **Hanken Grotesk** (sans. UI chrome), loaded via `next/font` in the root layout.
- Motion: custom `--ease-out`; entrance animations via `.anim-stagger` / `.anim-settle` (onboarding) and `.anim-report` / `.anim-confirm` (dashboard) with per-child `--i` (see `lib/style.ts` `stagger()`); `prefers-reduced-motion` handled.
- This expresses the brief's "calm, editorial, deferential confidence" direction. **Per the global webdev rule, every UI change MUST invoke impeccable + emil-design-eng + a taste skill, before building (impeccable) and after (audit). This is not optional; "the design system already exists" is not an exception.**

## Known Issues
_(none yet)_

## Vault Integration
This project lives inside The Vault. It inherits vault conventions from the parent `CLAUDE.md`:
- Follow Obsidian frontmatter and `[[link]]` conventions for any markdown notes added here
- When you create significant new content in this project, update `Projects/index.md` if a new top-level concern emerges
- Cross-link decisions back to [[Business Function AI Templates/Status Report Autopilot - Design Brief|the design brief]] and to the [[Business Function AI Templates/ROADMAP|ROADMAP]]
- Action items belong in the vault-root `Action Items.md`, not here

## Related
- [[Business Function AI Templates/Status Report Autopilot - Design Brief|Design Brief]], authoritative spec
- [[Business Function AI Templates/workflow-engine|workflow-engine]], platform dependency
- [[Business Function AI Templates/ROADMAP|ROADMAP]], locked sequence
- [[Business Function AI Templates]], parent project
- [[SMB AI Agency Free-Build]], primary GTM channel
- [[Open-Core Commercial Model]], open/closed boundary principle
