import { describe, expect, it } from 'vitest';

import { ModelConfigError, type ModelConfig } from '@/lib/models/providers';
import { resolveLanguageModel } from '@/lib/models/resolve';

/** A complete model config, overridable per test. */
function config(over: Partial<ModelConfig>): ModelConfig {
  return { provider: 'anthropic', modelId: 'm', apiKey: 'k', baseUrl: '', ...over };
}

describe('resolveLanguageModel', () => {
  it('resolves an Anthropic model with native structured output', () => {
    const resolved = resolveLanguageModel(config({ provider: 'anthropic', modelId: 'claude-sonnet-4-6' }));
    expect(resolved.model.modelId).toBe('claude-sonnet-4-6');
    expect(resolved.jsonPromptInjection).toBe(false);
  });

  it('resolves a Google model', () => {
    const resolved = resolveLanguageModel(config({ provider: 'google', modelId: 'gemini-3-flash-preview' }));
    expect(resolved.model.modelId).toBe('gemini-3-flash-preview');
    expect(resolved.jsonPromptInjection).toBe(false);
  });

  it('resolves an OpenAI model', () => {
    const resolved = resolveLanguageModel(config({ provider: 'openai', modelId: 'gpt-5.1' }));
    expect(resolved.model.modelId).toBe('gpt-5.1');
    expect(resolved.jsonPromptInjection).toBe(false);
  });

  it('resolves an OpenRouter model through the OpenAI-compatible SDK', () => {
    const resolved = resolveLanguageModel(
      config({ provider: 'openrouter', modelId: 'anthropic/claude-sonnet-4-6' }),
    );
    expect(resolved.model.modelId).toBe('anthropic/claude-sonnet-4-6');
    expect(resolved.jsonPromptInjection).toBe(false);
  });

  it('resolves a local model with prompt-injected structured output', () => {
    const resolved = resolveLanguageModel(
      config({ provider: 'local', modelId: 'qwen', apiKey: '', baseUrl: 'http://localhost:1234/v1' }),
    );
    expect(resolved.model.modelId).toBe('qwen');
    expect(resolved.jsonPromptInjection).toBe(true);
  });

  it('falls back to the provider default model id when blank', () => {
    const resolved = resolveLanguageModel(config({ provider: 'anthropic', modelId: '' }));
    expect(resolved.model.modelId).toBe('claude-sonnet-4-6');
  });

  it('throws when a key-required provider has no key', () => {
    expect(() => resolveLanguageModel(config({ provider: 'anthropic', apiKey: '' }))).toThrow(
      ModelConfigError,
    );
  });

  it('throws when a local model has no endpoint URL', () => {
    expect(() =>
      resolveLanguageModel(config({ provider: 'local', apiKey: '', baseUrl: '', modelId: 'qwen' })),
    ).toThrow(ModelConfigError);
  });

  it('throws when a local model has no model id', () => {
    expect(() =>
      resolveLanguageModel(
        config({ provider: 'local', apiKey: '', baseUrl: 'http://localhost:1234/v1', modelId: '' }),
      ),
    ).toThrow(ModelConfigError);
  });
});
