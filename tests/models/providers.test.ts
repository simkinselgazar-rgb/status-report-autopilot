import { describe, expect, it } from 'vitest';

import { MODEL_PROVIDERS, ModelConfigError, getProvider } from '@/lib/models/providers';

describe('model providers', () => {
  it('exposes the five BYO providers', () => {
    expect(MODEL_PROVIDERS.map((provider) => provider.id)).toEqual([
      'anthropic',
      'google',
      'openai',
      'openrouter',
      'local',
    ]);
  });

  it('only the local provider needs no key and supplies its own endpoint', () => {
    const local = getProvider('local');
    expect(local.needsKey).toBe(false);
    expect(local.needsBaseUrl).toBe(true);
    for (const provider of MODEL_PROVIDERS) {
      if (provider.id === 'local') continue;
      expect(provider.needsKey).toBe(true);
      expect(provider.needsBaseUrl).toBe(false);
    }
  });

  it('only the local provider uses prompt-injected structured output', () => {
    for (const provider of MODEL_PROVIDERS) {
      expect(provider.jsonPromptInjection).toBe(provider.id === 'local');
    }
  });

  it('throws on an unknown provider', () => {
    // @ts-expect-error, exercising the runtime guard with a bad id
    expect(() => getProvider('mistral')).toThrow(ModelConfigError);
  });
});
