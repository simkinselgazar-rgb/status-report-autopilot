import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ModelPicker } from '@/components/settings/model-picker';
import { getSession } from '@/lib/auth/session';
import { getStoredModelConfig } from '@/lib/models/config';
import { stagger } from '@/lib/style';

/** Reads the stored model on every request, never prerendered. */
export const dynamic = 'force-dynamic';

/**
 * /settings, the BYO-model picker. The stored API key never reaches the
 * browser: only a `hasKey` flag is passed down.
 */
export default async function SettingsPage() {
  if (!(await getSession())) redirect('/sign-in');

  const stored = await getStoredModelConfig();

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-16 text-ink">
      <div className="mx-auto w-full max-w-[40rem]">
        <div className="anim-stagger">
          <Link
            href="/"
            style={stagger(0)}
            className="inline-flex items-center gap-1.5 text-[0.82rem] text-ink-faint underline-offset-2 transition-colors duration-150 ease-out hover:text-ink-soft hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span aria-hidden="true">←</span> Dashboard
          </Link>

          <header style={stagger(1)} className="mt-5">
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
              Settings
            </p>
            <h1 className="mt-2.5 font-serif text-[2.1rem] leading-[1.12] tracking-[-0.02em] sm:text-[2.4rem]">
              AI model
            </h1>
            <p className="mt-3.5 max-w-[52ch] text-[1.02rem] leading-relaxed text-ink-soft">
              Reports are written by the model you choose. Bring your own provider and API key.
              The key is stored only in this app&rsquo;s own database, never sent anywhere else.
            </p>
          </header>
        </div>

        <div className="mt-8">
          <ModelPicker
            initial={
              stored
                ? {
                    provider: stored.provider,
                    modelId: stored.modelId,
                    baseUrl: stored.baseUrl,
                    hasKey: stored.apiKey.length > 0,
                  }
                : null
            }
          />
        </div>
      </div>
    </main>
  );
}
