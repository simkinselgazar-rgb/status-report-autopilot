/**
 * The model-provider catalog, the source of truth for the BYO-model picker.
 *
 * The app is model-agnostic: the deployer picks a provider and pastes their own
 * API key. This module is pure data (no DB, no AI SDK imports) so the picker UI
 * can import it on the client.
 */

export type ModelProviderId = 'anthropic' | 'google' | 'openai' | 'openrouter' | 'local';

export interface ModelProvider {
  id: ModelProviderId;
  /** Display label in the picker. */
  label: string;
  /** One-line description shown under the label. */
  blurb: string;
  /** Suggested model id, pre-filled in the picker, always editable. */
  defaultModel: string;
  /** Whether an API key is required. A local endpoint usually needs none. */
  needsKey: boolean;
  /** Whether the deployer supplies the endpoint URL (a local model). */
  needsBaseUrl: boolean;
  /** A fixed base URL for an OpenAI-compatible provider with a known host. */
  fixedBaseUrl?: string;
  /** Where to create an API key. */
  keyUrl?: string;
  /**
   * The provider has no constrained decoding, so structured output is produced
   * by injecting the JSON schema into the prompt and parsing the model's text.
   */
  jsonPromptInjection: boolean;
}

export const MODEL_PROVIDERS: readonly ModelProvider[] = [
  {
    id: 'anthropic',
    label: 'Claude',
    blurb: 'Anthropic. The most reliable narrative quality.',
    defaultModel: 'claude-sonnet-4-6',
    needsKey: true,
    needsBaseUrl: false,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    jsonPromptInjection: false,
  },
  {
    id: 'google',
    label: 'Gemini',
    blurb: 'Google. Fast and inexpensive.',
    defaultModel: 'gemini-3-flash-preview',
    needsKey: true,
    needsBaseUrl: false,
    keyUrl: 'https://aistudio.google.com/apikey',
    jsonPromptInjection: false,
  },
  {
    id: 'openai',
    label: 'ChatGPT',
    blurb: 'OpenAI. GPT models.',
    defaultModel: 'gpt-5.1',
    needsKey: true,
    needsBaseUrl: false,
    keyUrl: 'https://platform.openai.com/api-keys',
    jsonPromptInjection: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    blurb: 'One key, many providers. Use any model id OpenRouter serves.',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    needsKey: true,
    needsBaseUrl: false,
    fixedBaseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    jsonPromptInjection: false,
  },
  {
    id: 'local',
    label: 'Local model',
    blurb: 'Any OpenAI-compatible endpoint. Ollama, LM Studio, vLLM, mlx.',
    defaultModel: '',
    needsKey: false,
    needsBaseUrl: true,
    jsonPromptInjection: true,
  },
];

/** A persisted model choice, what the picker writes and the resolver reads. */
export interface ModelConfig {
  provider: ModelProviderId;
  /** The model id; falls back to the provider's default when blank. */
  modelId: string;
  /** API key, may be blank for a local endpoint. */
  apiKey: string;
  /** Endpoint URL, used only by a local model. */
  baseUrl: string;
}

/** A model that is misconfigured or not yet configured. */
export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigError';
  }
}

/** Looks up a provider by id, raising a {@link ModelConfigError} if unknown. */
export function getProvider(id: ModelProviderId): ModelProvider {
  const provider = MODEL_PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) {
    throw new ModelConfigError(`Unknown model provider: ${id}`);
  }
  return provider;
}
