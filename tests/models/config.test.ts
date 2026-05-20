import { describe, expect, it } from 'vitest';

import { mergeModelConfig } from '@/lib/models/config';
import type { ModelConfig } from '@/lib/models/providers';

const submitted: ModelConfig = { provider: 'anthropic', modelId: 'claude-sonnet-4-6', apiKey: '', baseUrl: '' };
const stored: ModelConfig = { provider: 'anthropic', modelId: 'old', apiKey: 'stored-key', baseUrl: '' };

describe('mergeModelConfig', () => {
  it('keeps a freshly submitted key', () => {
    const merged = mergeModelConfig({ ...submitted, apiKey: 'new-key' }, stored);
    expect(merged.apiKey).toBe('new-key');
  });

  it('reuses the stored key when the submitted key is blank and the provider is unchanged', () => {
    expect(mergeModelConfig(submitted, stored).apiKey).toBe('stored-key');
  });

  it('does not reuse the stored key when the provider changed', () => {
    const merged = mergeModelConfig({ ...submitted, provider: 'google' }, stored);
    expect(merged.apiKey).toBe('');
  });

  it('leaves a blank key blank when nothing is stored', () => {
    expect(mergeModelConfig(submitted, null).apiKey).toBe('');
  });
});
