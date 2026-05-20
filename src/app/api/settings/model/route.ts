import { z } from 'zod';

import { getSession, unauthorized } from '@/lib/auth/session';
import { badRequest } from '@/lib/connectors/http';
import { getStoredModelConfig, mergeModelConfig, saveModelConfig } from '@/lib/models/config';
import { ModelConfigError } from '@/lib/models/providers';
import { resolveLanguageModel } from '@/lib/models/resolve';

export const runtime = 'nodejs';

const bodySchema = z.object({
  provider: z.enum(['anthropic', 'google', 'openai', 'openrouter', 'local']),
  modelId: z.string(),
  apiKey: z.string(),
  baseUrl: z.string(),
});

/**
 * POST /api/settings/model
 *
 * Saves the deployer's BYO model choice. A blank API key keeps the stored key
 * for the same provider (the picker never receives the secret). The config is
 * validated by resolving it, a missing key, endpoint, or model id is a 400.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await getSession())) return unauthorized();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest('Expected a JSON request body.');
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Invalid request.');
  }

  const config = mergeModelConfig(parsed.data, await getStoredModelConfig());

  // Resolving builds the provider model and raises ModelConfigError on a
  // missing key / endpoint / model id, the cheap, offline validation gate.
  try {
    resolveLanguageModel(config);
  } catch (error) {
    if (error instanceof ModelConfigError) return badRequest(error.message);
    throw error;
  }

  await saveModelConfig(config);
  return Response.json({ ok: true });
}
