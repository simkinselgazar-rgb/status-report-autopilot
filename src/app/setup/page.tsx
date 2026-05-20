import { redirect } from 'next/navigation';

import { ModelPicker } from '@/components/settings/model-picker';
import { getSession } from '@/lib/auth/session';
import { hasConfiguredModel } from '@/lib/models/config';
import { stagger } from '@/lib/style';

/** Checks the stored model on every request, never prerendered. */
export const dynamic = 'force-dynamic';

/**
 * /setup, the one-screen first-run gate. A signed-in user with no configured
 * model lands here from `/` or `/onboarding` and connects a model before
 * anything else. Once a model is configured the page sends them home; the
 * recurring config home is `/settings`.
 */
export default async function SetupPage() {
  if (!(await getSession())) redirect('/sign-in');
  if (await hasConfiguredModel()) redirect('/');

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 py-16 text-ink">
      <div className="mx-auto w-full max-w-[40rem]">
        <div className="anim-stagger">
          <header style={stagger(0)}>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
              Get started
            </p>
            <h1 className="mt-2.5 font-serif text-[2.1rem] leading-[1.12] tracking-[-0.02em] sm:text-[2.4rem]">
              Connect an AI model
            </h1>
            <p className="mt-3.5 max-w-[52ch] text-[1.02rem] leading-relaxed text-ink-soft">
              Status Report Autopilot is model-agnostic. Pick your AI provider and paste your own
              API key. The key is stored only in this app&rsquo;s own database. You can change
              this anytime under Settings.
            </p>
          </header>
        </div>

        <div className="mt-8">
          <ModelPicker initial={null} redirectAfterSave="/" />
        </div>
      </div>
    </main>
  );
}
