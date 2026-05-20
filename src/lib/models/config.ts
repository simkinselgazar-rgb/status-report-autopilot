/**
 * Reads and writes the deployer's BYO model choice.
 *
 * The chosen model lives in the `settings` table (a single row). The picker UI
 * writes it; the narrative agent reads it per generation. When nothing is
 * stored, a dev-only env fallback keeps generation working before the picker
 * has been used, production deployments configure a model in Settings.
 */

import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ModelConfigError, type ModelConfig, type ModelProviderId } from './providers';

/** The single settings row's primary key, the app is single-deployment. */
const SETTINGS_ID = 'app';

/** Reads the stored model config, or `null` when none has been saved. */
export async function getStoredModelConfig(): Promise<ModelConfig | null> {
  const db = getDb();
  const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
  const row = rows[0];
  if (!row || !row.modelProvider) return null;
  return {
    provider: row.modelProvider as ModelProviderId,
    modelId: row.modelId ?? '',
    apiKey: row.modelApiKey ?? '',
    baseUrl: row.modelBaseUrl ?? '',
  };
}

/** Persists the model config, upserts the single settings row. */
export async function saveModelConfig(config: ModelConfig): Promise<void> {
  const db = getDb();
  const fields = {
    modelProvider: config.provider,
    modelId: config.modelId,
    modelApiKey: config.apiKey,
    modelBaseUrl: config.baseUrl,
    updatedAt: new Date(),
  };
  await db
    .insert(settings)
    .values({ id: SETTINGS_ID, ...fields })
    .onConflictDoUpdate({ target: settings.id, set: fields });
}

/**
 * Dev-only fallback, derives a model config from env when nothing is stored,
 * so a fresh dev checkout generates without first visiting Settings.
 */
function modelConfigFromEnv(): ModelConfig | null {
  if (env.localModelUrl) {
    return { provider: 'local', modelId: env.localModelName ?? '', apiKey: '', baseUrl: env.localModelUrl };
  }
  if (env.googleApiKey) {
    return { provider: 'google', modelId: '', apiKey: env.googleApiKey, baseUrl: '' };
  }
  return null;
}

/**
 * Merges a submitted config with what is stored: a blank API key keeps the
 * existing key when the provider is unchanged, so the picker never has to
 * round-trip the secret to the browser. A different provider clears it.
 */
export function mergeModelConfig(submitted: ModelConfig, stored: ModelConfig | null): ModelConfig {
  if (submitted.apiKey.trim()) return submitted;
  if (stored && stored.provider === submitted.provider) {
    return { ...submitted, apiKey: stored.apiKey };
  }
  return submitted;
}

/**
 * True when the deployment has a usable model, either a stored row or a
 * dev env fallback. The first-run setup gate keys on this.
 */
export async function hasConfiguredModel(): Promise<boolean> {
  if (await getStoredModelConfig()) return true;
  return modelConfigFromEnv() !== null;
}

/**
 * The model config the narrative agent should run, the stored choice, else the
 * env fallback. Throws {@link ModelConfigError} when no model is configured.
 */
export async function getActiveModelConfig(): Promise<ModelConfig> {
  const stored = await getStoredModelConfig();
  if (stored) return stored;
  const fromEnv = modelConfigFromEnv();
  if (fromEnv) return fromEnv;
  throw new ModelConfigError('No AI model is configured. Choose one in Settings.');
}
