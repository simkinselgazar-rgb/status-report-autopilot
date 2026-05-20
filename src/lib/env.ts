/**
 * Typed environment access, the single place server code reads `process.env`.
 * Downstream modules import `env` and receive trimmed, typed values.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const env = {
  /** Postgres connection string, agent state + product DB. */
  databaseUrl: read('DATABASE_URL'),
  /**
   * Google Generative AI key. When set, the narrative agent runs the cheap dev
   * model (Gemini Flash) instead of prod Sonnet. Mastra's model router consumes
   * the key itself, this is read only to decide dev-vs-prod.
   */
  googleApiKey: read('GOOGLE_GENERATIVE_AI_API_KEY'),
  /**
   * Local model endpoint. An OpenAI-compatible server (Ollama, LM Studio,
   * vLLM, mlx) on a machine you control. When set, the narrative agent runs
   * the local model in dev, taking precedence over the Google dev model.
   */
  localModelUrl: read('LOCAL_MODEL_URL'),
  /** Model id the local endpoint serves. */
  localModelName: read('LOCAL_MODEL_NAME'),
  /**
   * Resend API key. When unset, approving a report still marks it sent but the
   * client email is skipped, dev works without an email provider configured.
   */
  resendApiKey: read('RESEND_API_KEY'),
  /** Sender identity for report emails. Must be a Resend-verified domain. */
  emailFrom: read('EMAIL_FROM') ?? 'Status Report Autopilot <onboarding@resend.dev>',
  /** Public base URL, builds the absolute `/r/[token]` link inside emails. */
  appUrl: read('APP_URL') ?? 'http://localhost:3000',
  /**
   * Shared secret guarding the recurring-generation cron route. Vercel Cron
   * sends it as a bearer token. The route fails closed when this is unset.
   */
  cronSecret: read('CRON_SECRET'),
  /** Better Auth signing secret. Generate with: openssl rand -hex 32 */
  betterAuthSecret: read('BETTER_AUTH_SECRET'),
} as const;
