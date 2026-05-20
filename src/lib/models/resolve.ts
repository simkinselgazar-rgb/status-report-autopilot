/**
 * Turns a stored {@link ModelConfig} into a live AI SDK language model.
 *
 * Every provider is reached with the deployer's own key: the dedicated SDK for
 * Anthropic / Google / OpenAI, and the OpenAI-compatible SDK for OpenRouter and
 * any local endpoint. The narrative agent consumes the result without knowing
 * which provider produced it.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

import { getProvider, ModelConfigError, type ModelConfig } from './providers';

/** A resolved model plus how it produces structured output. */
export interface ResolvedModel {
  /** An AI SDK language model, passed straight to the Mastra agent. */
  model: ReturnType<ReturnType<typeof createOpenAICompatible>>;
  /** True when the schema must be prompt-injected rather than enforced natively. */
  jsonPromptInjection: boolean;
}

/** Builds the AI SDK language model described by a {@link ModelConfig}. */
export function resolveLanguageModel(config: ModelConfig): ResolvedModel {
  const provider = getProvider(config.provider);
  const modelId = config.modelId.trim() || provider.defaultModel;
  if (!modelId) {
    throw new ModelConfigError('A model id is required for this provider.');
  }
  const apiKey = config.apiKey.trim();
  if (provider.needsKey && !apiKey) {
    throw new ModelConfigError(`${provider.label} needs an API key.`);
  }
  const baseUrl = config.baseUrl.trim();
  if (provider.needsBaseUrl && !baseUrl) {
    throw new ModelConfigError(`${provider.label} needs an endpoint URL.`);
  }

  const model = buildModel(config.provider, { modelId, apiKey, baseUrl, fixedBaseUrl: provider.fixedBaseUrl });
  return { model, jsonPromptInjection: provider.jsonPromptInjection };
}

function buildModel(
  provider: ModelConfig['provider'],
  parts: { modelId: string; apiKey: string; baseUrl: string; fixedBaseUrl?: string },
): ResolvedModel['model'] {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: parts.apiKey })(parts.modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: parts.apiKey })(parts.modelId);
    case 'openai':
      return createOpenAI({ apiKey: parts.apiKey })(parts.modelId);
    case 'openrouter':
      return createOpenAICompatible({
        name: 'openrouter',
        baseURL: parts.fixedBaseUrl ?? 'https://openrouter.ai/api/v1',
        apiKey: parts.apiKey,
      })(parts.modelId);
    case 'local':
      return createOpenAICompatible({
        name: 'local',
        baseURL: parts.baseUrl,
        // mlx / Ollama rigs often don't authenticate; the SDK still wants a value.
        apiKey: parts.apiKey || 'not-needed',
      })(parts.modelId);
  }
}
