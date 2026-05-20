# Status Report Autopilot: Self-Hoster Setup Guide

A weekly-cadence approval queue for the PM at a digital agency. It reads the work that already happened in Asana / Linear / Slack / Zoom / Microsoft Teams, writes a client-facing narrative in your agency's voice, and ships it three ways: an email to the client, a downloadable PDF, and a public read-only link. Each carries the tone, length, and sign-off you captured during onboarding, and the same paper-and-ink chrome the dashboard uses.

This guide walks through running the app on your own infrastructure end-to-end.

---

## Contents

1. [Before you start](#before-you-start)
2. [Install](#install)
3. [First run](#first-run)
4. [Choose an AI model](#choose-an-ai-model)
5. [Running a local model](#running-a-local-model)
6. [Connect your project tools](#connect-your-project-tools)
7. [Onboard your first client](#onboard-your-first-client)
8. [Email delivery](#email-delivery)
9. [Recurring generation](#recurring-generation)
10. [Updating + maintenance](#updating--maintenance)
11. [Troubleshooting](#troubleshooting)

---

## Before you start

**What you need**

- A machine that runs **Docker** (Docker Desktop on macOS / Windows, or Docker Engine on Linux).
- About **2 GB** of free disk space for the image and the Postgres volume.
- Network access from your machine to whichever AI provider you pick, or local hardware big enough to run an open model (see [Running a local model](#running-a-local-model)).
- An **API key** for one of: Claude (Anthropic), Gemini (Google), ChatGPT (OpenAI), or OpenRouter. Alternatively no key at all and a local OpenAI-compatible endpoint.

**What you do not need**

- A Vercel / Netlify / AWS account.
- A registered Google or Microsoft OAuth app (sign-in is email + password).
- A Stripe account.
- Per-connector OAuth registrations. Every source uses pasted credentials, entered in the app.

---

## Install

```bash
git clone <your-fork-of-status-report-autopilot>.git
cd status-report-autopilot
cp .env.example .env
```

Open `.env` and set the one required variable:

```bash
# Generate with: openssl rand -hex 32
BETTER_AUTH_SECRET=<64-character random hex string>
```

Leave the optional sections (email, cron) blank for now; you can fill them in later. Then bring the stack up:

```bash
docker compose up --build
```

What this does, in order:

1. Pulls `postgres:16-alpine` and starts the database with a named volume so your data survives container restarts.
2. Builds the app image (Node 20-alpine, Next.js production build).
3. Waits for the database to report healthy.
4. Runs `drizzle-kit migrate` against the database. The step is idempotent and safe on every boot.
5. Starts the Next.js server on `http://localhost:3000`.

First build takes a few minutes; subsequent boots are seconds.

---

## First run

Open `http://localhost:3000`. The middleware redirects you to **`/sign-in`**.

**1. Create your account.** Click *Create an account*, enter a name + email + password (8+ characters). The first account you create owns the deployment; teammates can sign up the same way after you share the URL.

**2. Connect an AI model.** A signed-in user with no model configured lands on **`/setup`**. Pick a provider, paste your API key, click *Continue*. The picker resolves the model offline before saving, so a missing key or a typo'd model id surfaces immediately.

**3. Add your first client.** From the dashboard, open **`/onboarding`** and walk the four-step wizard: client name + email, connect at least one source, set a voice (tone + length + sample), set the weekly cadence. The wizard finishes by drafting the previous calendar week's report so the first thing the client sees is the workflow, not an empty queue.

**4. Review and approve.** The dashboard's left pane lists clients and statuses; the right pane shows the draft. Edit inline, hit *Approve & send*. The report emails the client (if Resend is configured) and the queue auto-advances to the next pending draft.

---

## Choose an AI model

The app is **model-agnostic**: bring your own provider and key. The model picker at `/setup` (first run) or `/settings` (later) is the single place this is configured.

| Provider | Best for | Default model | Get a key |
| --- | --- | --- | --- |
| **Claude** | Highest narrative quality. The recommended choice if you're producing client-facing reports. | `claude-sonnet-4-6` | https://console.anthropic.com/settings/keys |
| **Gemini** | Cheapest reliable option. Native JSON-schema enforcement is a plus for the structured-output prompt. | `gemini-3-flash-preview` | https://aistudio.google.com/apikey |
| **ChatGPT** | OpenAI's models. | `gpt-5.1` (editable) | https://platform.openai.com/api-keys |
| **OpenRouter** | One key, many providers. Useful for A/B testing models without managing five accounts. | `anthropic/claude-sonnet-4-6` | https://openrouter.ai/keys |
| **Local model** | No cloud calls. See [Running a local model](#running-a-local-model). | You pick (no default). | (none) |

The model id is always editable. Set whatever specific model you want from that provider. Switching providers later just changes the active row in the `settings` table; nothing else moves.

### Getting an API key

**Claude (Anthropic).**

1. Create an account at https://console.anthropic.com.
2. Add a payment method under **Settings → Billing** and load at least $5 of credit. Anthropic keys do not produce useful output until the account has prepaid credit.
3. Open **Settings → API Keys → Create Key**. Name the key (e.g. `status-report-autopilot`), copy the value. It starts with `sk-ant-`.

**Gemini (Google).**

1. Visit https://aistudio.google.com/apikey. A Google account is required.
2. Click **Create API key** and either create a new Google Cloud project or pick an existing one.
3. Copy the value. It starts with `AIza`. The free tier is generous; you do not need to enable billing for low-volume use, though the paid tier raises the rate limits.

**ChatGPT (OpenAI).**

1. Sign in at https://platform.openai.com.
2. Add a prepaid balance under **Settings → Billing**. OpenAI requires at least $5 of credit before new API keys produce output.
3. Open the dashboard's left rail → **API keys → Create new secret key**. Name the key, leave the default permissions, copy the value. It starts with `sk-proj-` or `sk-`. You can only see the full value once; paste it into the picker immediately or save it somewhere you can copy from.

**OpenRouter.**

1. Sign in at https://openrouter.ai. Google or GitHub sign-in both work.
2. Add credits under **Settings → Credits**. $5 is enough to test a few reports across multiple providers.
3. Open **Settings → Keys → Create Key**. Name it, optionally set a credit limit on the key itself, copy the value. It starts with `sk-or-v1-`.
4. OpenRouter charges a small markup over each underlying provider's cost in exchange for one account that reaches every model on the market. Useful if you want to A/B test Claude against Gemini against an open model without managing three separate billing relationships.

**Local model.** No key needed for an open endpoint that does not authenticate (Ollama, LM Studio defaults). See [Running a local model](#running-a-local-model).

> **Where the key lives.** The API key is stored in the app's own Postgres database (the same database the dashboard runs on), never sent anywhere except the provider you chose. It does not pass through any Simkins & Elgazar service. There is none.

---

## Running a local model

If you'd rather not send any data to a hosted LLM provider, point the picker at an OpenAI-compatible endpoint on your own hardware.

### Backends

| Backend | Best on | Why |
| --- | --- | --- |
| **Ollama** | macOS / Linux / Windows | Simplest install. `ollama serve` runs on `localhost:11434/v1` out of the box, OpenAI-compatible. |
| **LM Studio** | macOS / Windows | GUI for downloading and serving models, OpenAI-compatible server. |
| **mlx-lm / mlx-omni-server** | Apple Silicon (M1+) | Fastest path on Apple hardware. Runs MLX-quantized models with hardware acceleration. |
| **vLLM** | NVIDIA GPU servers | Production-grade serving, batched inference, OpenAI-compatible. |

Any of these expose an `/v1` API that the picker accepts under **Local model** → *Endpoint URL*.

### Hardware tiers

The recommendations below are calibrated for **this specific workload** (turning ~20–100 activity events per client per week into a 250–400-word client-facing report). Reasoning effort is moderate; the model has to follow a JSON schema reliably and not hallucinate event ids.

| Tier | Memory budget | Suitable hardware | Example models | Notes |
| --- | --- | --- | --- | --- |
| **Small** | 6–10 GB | M1 Air 16 GB, RTX 3060 12 GB | Qwen 2.5 7B, Llama 3.1 8B, Phi 3 medium | Works, but schema reliability is the bottleneck. Expect occasional re-runs on malformed JSON. Set `temperature: 0` if your backend exposes it. |
| **Medium (recommended)** | 18–32 GB | M2/M3 Pro 32 GB, M2 Max 32 GB+, RTX 4090 24 GB | **Qwen 2.5 32B** (4-bit MLX), Llama 3.3 70B (heavily quantized) | The sweet spot. Qwen 32B at 4-bit produces schema-valid drafts reliably and runs at usable speed on a single M-series machine. |
| **Large** | 40–80 GB | M3 Ultra 192 GB, dual RTX 6000 Ada, single H100 80 GB | DeepSeek V2.5, Llama 3.1 70B (full precision), Mixtral 8x22B | Diminishing returns for this task. Narrative quality plateaus well below the largest open models, so use this tier only if you already have the hardware. |

### Reliability gotcha: structured output

Most local backends do not enforce JSON schemas during decoding. The narrative agent compensates by injecting the schema into the prompt and parsing the model's text, but that places the burden on the model to follow instructions exactly. Two practical knobs:

- **Pick a model trained for instruction following + JSON output.** Qwen 2.5 32B is the most reliable open model we have measured for this task.
- **If your backend supports it, enable JSON-mode or grammar-constrained decoding.** Ollama, vLLM, and some MLX servers expose this; it eliminates schema-violation failures.

### Pointing the app at your endpoint

In the picker, choose **Local model** and fill:

- **Endpoint URL.** For example `http://localhost:11434/v1` (Ollama default) or `http://<your-host>:1234/v1` (LM Studio default).
- **API key.** Leave blank for backends that don't authenticate; if your endpoint does, paste the key.
- **Model.** The id the endpoint serves, e.g. `qwen2.5:32b-instruct-q4_K_M` for Ollama or `mlx-community/Qwen2.5-32B-Instruct-4bit` for MLX.

If the app and the model are on different machines, the endpoint URL must be reachable from the **app container**. On Docker Desktop that usually means using the machine's LAN IP, not `localhost`.

---

## Connect your project tools

Each connector uses **bring-your-own-credentials**: paste a token (or for Zoom and Teams, an OAuth app's credential triple) in the onboarding wizard. There are no per-deployer OAuth apps to register on the app side.

You can pick **more than one target per source**, multiple Asana projects, multiple Slack channels, multiple Zoom hosts, and so on. The picker is a checkbox list, the report blends activity across every selected target.

> **Least privilege.** Status Report Autopilot only ever reads from your project tools, it never writes. Where a source supports it, scope the credentials to read-only. Per-source notes are inlined below.

### Who does what

Status Report Autopilot is self-hosted. A few different people are involved in setup, and it matters for the connectors:

| Role | Who | What they do |
|---|---|---|
| **Deployer** | You, the agency owner or tech lead | Self-hosts the app (`docker compose up`), configures the AI model, sets `APP_URL`. One-time. |
| **Agency PM** | An account manager at the agency | Uses the dashboard, runs onboarding once per client, approves and sends the weekly report. |
| **Client (or client's IT)** | Your client's contact | Provides credentials for the client's project tools where admin access is required. |

Asana and Linear use **personal tokens**, so an agency PM can usually create them in the client's account on the client's behalf (with permission). Quick.

**Slack, Zoom, and Microsoft Teams each require building or registering an app inside the client's workspace, which needs the client's IT or workspace admin to participate.** This is a vendor limitation, not something the connector can shortcut. Plan a 15-30 minute call with the client's admin to walk through those three together, the steps below are written assuming an admin is in front of the screen.

### Asana

> **Who:** the client, or an agency PM with member access to the client's Asana account. No admin rights needed.

1. In Asana, open **My Settings → Apps → Manage developer apps**.
2. Click **Create new token**.
3. Copy the token (it starts with `0/`).
4. In the wizard's *Asana* row, paste it, pick the workspace, then check the projects to track.

> Asana Personal Access Tokens are full-account credentials, Asana does not let you scope a PAT to read-only. The connector only reads, so the practical hygiene is to (a) create the token specifically for this app, (b) name it so you can recognize it (e.g. `status-report-autopilot`), and (c) revoke it from the same Manage developer apps page when you stop using it. Need real scoping? Use an OAuth app + the OAuth `tasks:read` scope.

### Linear

> **Who:** the client, or an agency PM with member access to the client's Linear workspace. No admin rights needed.

1. Open **Settings → Security and access** in Linear.
2. Under **Personal API keys**, click **Create key**.
3. **Scope the key to read-only.** Linear lets you tick exactly which actions a Personal API key can perform, only check the read scopes (e.g. `read:issues`, `read:projects`, `read:teams`). Do not check any `write:` or `admin:` scopes, the connector never writes.
4. Copy the key (starts with `lin_api_`).
5. Paste in the wizard's *Linear* row, pick the team, then check the projects to track.

### Slack

> **Who:** the client's Slack **workspace admin**. Slack requires permission to create and install apps in the workspace, and only an admin can grant the consent in step 3. Block off ~15 minutes with the admin.

Slack requires a small custom app. There is no shorter path that lets the connector read a channel.

1. Go to https://api.slack.com/apps and click **Create New App → From scratch**. Name it anything.
2. Under **OAuth & Permissions → Scopes → Bot Token Scopes**, add three scopes:
   - `channels:read`
   - `channels:history`
   - `users:read`
3. Click **Install to Workspace** and approve.
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`).
5. Invite the bot to each channel you want to track (`/invite @your-bot-name` from the channel itself). **The bot only sees channels it has been invited to.**
6. Paste the token in the wizard's *Slack* row, then check the channels to track.

> All three scopes above are read-only. **Do not add any `:write` or `:manage` scopes**, the connector never writes to Slack.

### Zoom

> **Who:** the client's Zoom **account owner or admin**. Server-to-Server OAuth apps can only be built by accounts with the right Marketplace privileges. Block off ~20 minutes with the admin.

The connector reads cloud-recording transcripts via the Server-to-Server OAuth grant. You create one Zoom app per Zoom account; the same credentials cover every Zoom user you track from the picker.

1. Go to https://marketplace.zoom.us → **Build App → Server-to-Server OAuth**.
2. Fill basic information (name, company). Activate the app.
3. Under **Scopes**, add:
   - `user:read` (or `user:read:admin` for an account with many users)
   - `cloud_recording:read` (or `cloud_recording:read:admin`)
4. Note the **Account ID**, **Client ID**, and **Client Secret** from the app's *App credentials* page.
5. Paste all three in the wizard's *Zoom* row, then check the users whose recordings this client's reports draw from.

> Both scopes above are read-only. **Do not add any `:write` or `:update` scopes**, the connector never writes to Zoom.

When a recording has a transcript file, the connector pulls the VTT and rides a plain-text excerpt along as the event detail. That is the reason Zoom earns a connector over plain calendar data.

### Microsoft Teams

> **Who:** the client's **Microsoft Entra ID (Azure AD) tenant admin, or someone with the Application Administrator role.** Registering an app, creating a secret, and granting admin consent to the Graph permissions in step 6 each need elevated rights. This one usually means looping in the client's IT department. Block off ~30 minutes.

The Teams connector reads channel messages via Microsoft Graph using app-only (client-credentials) auth.

1. Sign in to https://entra.microsoft.com and open **Applications → App registrations → New registration**.
2. Name the app (e.g. *Status Report Autopilot*), leave the redirect URI blank, click **Register**.
3. Note the **Application (client) ID** and the **Directory (tenant) ID** from the overview page.
4. Open **Certificates & secrets → New client secret**. Copy the **Value** (you can't see it again).
5. Open **API permissions → Add a permission → Microsoft Graph → Application permissions** and add:
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Read.All`
6. Click **Grant admin consent** for your tenant.
7. Paste the tenant id, client id, and secret value in the wizard's *Microsoft Teams* row. Pick a team, then check the channels to track. Channels from a single connection must belong to the same team; add a second Teams connection to track another team's channels.

> All three Graph permissions above end in `.Read` or `.ReadBasic`, they are read-only. **Do not add any `.ReadWrite` or `.Write` permissions**, the connector never writes to Teams or your tenant.

---

## Onboard your first client

With credentials in hand, sign in to the dashboard, click **Set up your first client**, and walk the four-step wizard:

1. **Client identity.** The client's display name (shown in the dashboard) and the email an approved report sends to.
2. **Connect sources.** For each of the five connectors: paste credentials, pick the workspace, check the projects / channels / hosts to track. You can pick more than one per source, the report blends activity across every selected target.
3. **Voice.** Tone (buttoned / professional / warm), length (headlines / balanced / thorough), the sign-off line, and an optional writing sample. The narrative agent mirrors the sample's rhythm and word choice, not its content.
4. **Cadence.** Weekday + time-of-day + timezone for the recurring weekly report. The first draft is generated immediately, the recurring report fires on this slot every week thereafter.

After step 4, the wizard runs the **magic moment**, it pulls every connected source, runs the narrative agent against your configured model, and lands on a first-draft preview. Hit the primary button to save the client and continue to the dashboard.

### The honest-window gotcha

The magic moment looks at the **previous Monday-Friday calendar week**, the same window the weekly recurring report covers. If the connected tools had no real activity in that window, the wizard shows an *"insufficient activity"* screen and **does not** save a half-onboarded client. The report agent never pads a thin week.

In practice this bites in two cases:

- **Onboarding a brand-new client whose tools have only this-week activity.** The previous Mon-Fri is empty, so the magic moment is insufficient. Wait until the next Monday to onboard, or pick a moment when the previous week had real work.
- **Onboarding mid-week against a client whose prior week was genuinely quiet** (a holiday, a launch retrospective, time off). Same outcome.

Recovery options when you hit insufficient:

- **Retry next week.** Close the wizard. Onboard the client again once a meaningful Monday-Friday has passed.
- **Onboard a more active client first.** The first-draft path requires drafted activity for the wizard to persist.

The recurring report path doesn't have this constraint, once a client is on the roster, every week's cadence slot fires its own attempt; insufficient weeks land on the dashboard as honestly-labeled insufficient reports (not lost).

---

## Email delivery

Approval-and-send emails go through **[Resend](https://resend.com)**.

1. Create a Resend account, verify a domain you control.
2. Generate an API key.
3. In `.env`:

   ```bash
   RESEND_API_KEY=re_...
   EMAIL_FROM="Your Agency <reports@yourdomain.com>"
   APP_URL=https://reports.yourdomain.com
   ```

4. `docker compose up -d` to restart the app with the new env.

> Without `RESEND_API_KEY` the app still works. Approving a report marks it sent and skips the email step. The shareable `/r/[token]` link and the PDF download keep working.

`APP_URL` is also used to build the absolute `/r/[token]` link inside the email; set it to the externally-reachable URL of your deployment.

---

## Recurring generation

The app runs its own hourly scheduler. Each tick reads the roster, finds clients whose cadence slot has arrived this week and who don't have a report yet, pulls each source's activity for the prior Monday–Friday week, runs the narrative agent, and writes the draft into the dashboard queue.

You don't have to do anything to enable this; it runs whenever the container is up. The `/api/cron/generate-reports` route is also available for ad-hoc force-runs:

```bash
# Set a CRON_SECRET in .env, then:
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/generate-reports
```

Without `CRON_SECRET` configured the route refuses to run, so generation is never publicly triggerable.

---

## Updating + maintenance

**Pulling a new version.** From the project directory:

```bash
git pull
docker compose up --build
```

The entrypoint applies any new database migrations on boot, so an upgrade is a one-step operation.

**Backing up the database.** The Postgres data lives in the named volume `postgres-data`.

```bash
docker compose exec db pg_dump -U postgres status_report_autopilot > backup.sql
```

Restore later with:

```bash
docker compose exec -T db psql -U postgres status_report_autopilot < backup.sql
```

**Logs.** `docker compose logs -f app` follows the app's logs, including the hourly scheduler's `[scheduler] run complete` summaries.

---

## Troubleshooting

| Symptom | What it usually means |
| --- | --- |
| `BETTER_AUTH_SECRET is required` at boot | The variable isn't set in `.env`. Generate with `openssl rand -hex 32` and put it in `.env` before `docker compose up`. |
| App is up but `/` redirects to `/setup` every time | The `settings` table doesn't have a model row, or the env-fallback model isn't reachable. Save a model on `/setup`. |
| `That access token was rejected` on a connector | The pasted token is wrong, expired, or doesn't carry the required scopes. (Slack especially: re-check the three scopes.) |
| Zoom returns no meetings even though there are recordings | The Server-to-Server app needs `cloud_recording:read` admin scope to see another user's recordings, or you picked a Zoom user with no cloud recordings in the window. |
| Microsoft Graph rejects the credentials | Admin consent wasn't granted, or the secret value is wrong. (Entra shows the secret value once at creation time; you may have copied the secret *id* instead.) |
| The narrative agent returned malformed JSON (local model only) | Your local model is below the size / quality threshold for reliable structured output. See [Reliability gotcha](#reliability-gotcha-structured-output). |
| The dashboard shows old data after a recurring run | The scheduler is hourly; force a run with the `CRON_SECRET` route, or restart the container. |

For anything not in this list, `docker compose logs -f app` and `docker compose logs -f db` are the right places to look.

---

*Status Report Autopilot is an open-source tool released by the Simkins & Elgazar AI Practice. Distributed under the Apache 2.0 license; see `LICENSE`.*
