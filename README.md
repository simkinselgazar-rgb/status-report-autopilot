# Status Report Autopilot

A self-hosted weekly client-report tool for digital agencies. It reads the work that already happened in **Asana, Linear, Slack, Zoom, and Microsoft Teams**, drafts a client-facing narrative in your agency's voice, and ships it three ways: an email to the client, a downloadable PDF, and a public read-only link.

One PM. Thirty minutes a week. The whole roster shipped.

## Quickstart

You need Docker and one environment variable.

```bash
git clone https://github.com/simkinselgazar-rgb/status-report-autopilot.git
cd status-report-autopilot
cp .env.example .env

# Add the one required value to .env:
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" >> .env

docker compose up --build
```

Visit http://localhost:3000, create an account, connect your AI model, and add your first client. The full walkthrough is in [SETUP.md](./SETUP.md). The same content is available as a printable PDF in [docs/](./docs/).

## What's in the box

- **Five connectors out of the box.** Asana, Linear, Slack, Zoom (with transcript reading), Microsoft Teams. Bring-your-own-token auth on every one; no per-deployer OAuth app to register.
- **Five AI providers, pick whichever.** Anthropic Claude, Google Gemini, OpenAI ChatGPT, OpenRouter, or any OpenAI-compatible local endpoint (Ollama, LM Studio, vLLM, mlx). Your key, your provider, stored only in your own database.
- **Three delivery channels.** Branded email through Resend, downloadable PDF, and a public read-only link. Each carries the tone, length, and sign-off captured during onboarding.
- **A weekly heartbeat.** An hourly in-app scheduler picks up clients on their cadence and drafts the previous calendar week's report. The PM reviews, edits inline, and approves; the queue auto-advances.
- **One-command install.** `docker compose up` brings up Postgres, runs migrations, and starts the app. No Vercel, no AWS, no Stripe, no OAuth-app registration on the app side.

## Stack

- **Next.js 16** (App Router, TypeScript strict, Tailwind v4)
- **Mastra** agent runtime for the narrative generation
- **Drizzle ORM + Postgres** for the product database
- **Better Auth** for email + password sign-in
- **Resend** for outgoing email; **`@react-pdf/renderer`** for the PDF; **Puppeteer** is *not* a runtime dependency

## License

Apache 2.0. See [LICENSE](./LICENSE).

Built and released by the [Simkins & Elgazar AI Practice](https://ai.simkinselgazar.com).
