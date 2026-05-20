'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  MODEL_PROVIDERS,
  getProvider,
  type ModelProvider,
  type ModelProviderId,
} from '@/lib/models/providers';
import { stagger } from '@/lib/style';

/** The persisted model, as the page hands it down, never carries the API key. */
export interface SavedModel {
  provider: ModelProviderId;
  modelId: string;
  baseUrl: string;
  /** Whether a key is on file, the key itself never reaches the browser. */
  hasKey: boolean;
}

interface Props {
  initial: SavedModel | null;
  /**
   * When set, a successful save navigates here instead of showing the inline
   * "Saved" confirmation, used by the first-run setup screen to advance the
   * user into the app.
   */
  redirectAfterSave?: string;
}

const NETWORK_ERROR = "We couldn't reach the server, check your connection and try again.";

const FIELD_CLASSES =
  'mt-2 h-11 w-full rounded-xl border border-line bg-sunk px-4 text-[0.95rem] text-ink ' +
  'transition-[border-color,background-color] duration-150 ease-out hover:border-line-strong ' +
  'focus:border-line-strong focus:bg-surface focus:outline-2 focus:outline-offset-2 focus:outline-focus';

/**
 * The BYO-model picker, a form-only surface: five provider rows (radio
 * selection); selecting one reveals its credential fields (API key, model id,
 * and an endpoint URL for a local model); Save posts to `/api/settings/model`.
 *
 * The page wrapping this component owns its own header chrome. With
 * {@link Props.redirectAfterSave} set the picker advances on save instead of
 * showing the inline confirmation.
 */
export function ModelPicker({ initial, redirectAfterSave }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedModel | null>(initial);
  const [provider, setProvider] = useState<ModelProviderId | null>(initial?.provider ?? null);
  const [modelId, setModelId] = useState(initial?.modelId ?? '');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = provider ? getProvider(provider) : null;
  const isSavedProvider = saved?.provider === provider;
  const keyOnFile = Boolean(isSavedProvider && saved?.hasKey);

  function pick(next: ModelProvider) {
    setError(null);
    setJustSaved(false);
    setProvider(next.id);
    const restoring = saved?.provider === next.id;
    setModelId(restoring && saved ? saved.modelId || next.defaultModel : next.defaultModel);
    setApiKey('');
    setBaseUrl(restoring && saved ? saved.baseUrl : '');
  }

  const canSave =
    !!selected &&
    !saving &&
    (!selected.needsKey || apiKey.trim().length > 0 || keyOnFile) &&
    (!selected.needsBaseUrl || baseUrl.trim().length > 0);

  async function save() {
    if (!provider || !selected || !canSave) return;
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await fetch('/api/settings/model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, modelId: modelId.trim(), apiKey, baseUrl: baseUrl.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || !data.ok) {
        setError(data.error?.message ?? "We couldn't save the model. Please try again.");
        setSaving(false);
        return;
      }
      setSaved({
        provider,
        modelId: modelId.trim() || selected.defaultModel,
        baseUrl: baseUrl.trim(),
        hasKey: apiKey.trim().length > 0 || keyOnFile,
      });
      setApiKey('');
      if (redirectAfterSave) {
        // Stay in the "saving" state across navigation so the button doesn't
        // flicker back to "Save model" before the next page paints.
        router.push(redirectAfterSave);
        return;
      }
      setJustSaved(true);
      setSaving(false);
    } catch {
      setError(NETWORK_ERROR);
      setSaving(false);
    }
  }

  return (
    <div className="anim-stagger">
      <section
        style={stagger(0)}
        className="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <ul className="divide-y divide-line">
          {MODEL_PROVIDERS.map((candidate) => {
            const active = provider === candidate.id;
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => pick(candidate)}
                  aria-pressed={active}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-150 ease-out hover:bg-sunk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <Radio selected={active} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.95rem] font-medium text-ink">
                      {candidate.label}
                    </span>
                    <span className="block text-[0.84rem] leading-relaxed text-ink-faint">
                      {candidate.blurb}
                    </span>
                  </span>
                  {saved?.provider === candidate.id ? (
                    <span className="shrink-0 rounded-lg bg-pine-soft px-2.5 py-1 text-[0.74rem] font-semibold text-pine-ink">
                      In use
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            selected ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            {selected ? (
              <div key={selected.id} className="border-t border-line p-6 anim-fade sm:p-7">
                {selected.needsBaseUrl ? (
                  <Field label="Endpoint URL">
                    <input
                      type="text"
                      value={baseUrl}
                      autoFocus
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="http://localhost:11434/v1"
                      className={FIELD_CLASSES}
                    />
                  </Field>
                ) : null}

                <Field
                  label={selected.needsKey ? 'API key' : 'API key (optional)'}
                  className={selected.needsBaseUrl ? 'mt-4' : ''}
                >
                  <input
                    type="password"
                    value={apiKey}
                    autoFocus={!selected.needsBaseUrl}
                    autoComplete="off"
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      keyOnFile
                        ? 'Saved. Paste a new key to replace it.'
                        : `Paste your ${selected.label} API key`
                    }
                    className={FIELD_CLASSES}
                  />
                  {selected.keyUrl ? (
                    <a
                      href={selected.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-[0.8rem] font-medium text-ink-soft underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
                    >
                      Create a key &rarr;
                    </a>
                  ) : null}
                </Field>

                <Field label="Model" className="mt-4">
                  <input
                    type="text"
                    value={modelId}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => setModelId(event.target.value)}
                    placeholder={selected.defaultModel || 'The model id your endpoint serves'}
                    className={FIELD_CLASSES}
                  />
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-ink-faint">
                    Keep the suggested model, or set any id {selected.label} serves.
                  </p>
                </Field>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div style={stagger(1)} className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving…' : redirectAfterSave ? 'Continue' : 'Save model'}
        </Button>
        {justSaved ? (
          <span className="inline-flex items-center gap-1.5 text-[0.88rem] font-medium text-pine-ink anim-confirm">
            <CheckMark />
            Saved, new reports use this model.
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[0.86rem] leading-relaxed text-danger anim-fade">
          {error}
        </p>
      ) : null}

      {selected ? null : (
        <p style={stagger(2)} className="mt-3 text-[0.82rem] leading-relaxed text-ink-faint">
          Choose a provider above to enter its credentials.
        </p>
      )}
    </div>
  );
}

// --- small parts -----------------------------------------------------------

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-[0.82rem] font-medium text-ink-soft">{label}</label>
      {children}
    </div>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors duration-150 ease-out ${
        selected ? 'border-pine' : 'border-line-strong'
      }`}
    >
      <span
        className={`size-2 rounded-full bg-pine transition-transform duration-150 ease-out ${
          selected ? 'scale-100' : 'scale-0'
        }`}
      />
    </span>
  );
}

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.5 6 11l5.5-7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
