import { SECTION_TITLES, type StatusReportDraft } from '@/lib/reports/types';
import { buttonClasses } from '@/components/ui/button';
import { stagger } from '@/lib/style';

interface Props {
  clientName: string;
  draft: StatusReportDraft;
  periodLabel: string;
  eventsUsed: number;
  /** Persists the client + this first report, then hands off to the dashboard. */
  onFinish: () => void;
  finishing: boolean;
  error: string | null;
}

/** The onboarding magic moment, the first real generated report. */
export function FirstDraft({
  clientName,
  draft,
  periodLabel,
  eventsUsed,
  onFinish,
  finishing,
  error,
}: Props) {
  const client = clientName.trim() || 'Your client';
  const sourceNote =
    eventsUsed === 1
      ? 'Drafted from 1 activity event across your connected tools.'
      : `Drafted from ${eventsUsed} activity events across your connected tools.`;

  return (
    <div className="w-full max-w-[40rem] anim-settle">
      <div style={stagger(0)} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center rounded-lg bg-pine-soft px-2.5 py-1 text-[0.8rem] font-medium text-pine-ink">
          Draft ready
        </span>
        <span className="text-[0.9rem] text-ink-faint">
          No one was nagged. No one was chased.
        </span>
      </div>

      <article
        style={stagger(1)}
        className="mt-5 rounded-2xl border border-line bg-surface p-8 shadow-[var(--shadow-lifted)] sm:p-10"
      >
        <header className="border-b border-line pb-6">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Weekly Status
          </p>
          <h1 className="mt-2 font-serif text-[1.7rem] leading-tight tracking-[-0.018em] text-ink">
            {client}
          </h1>
          <p className="mt-1 text-[0.92rem] text-ink-soft">{periodLabel}</p>
        </header>

        <div className="mt-6">
          <p className="text-[1rem] leading-relaxed text-ink-soft">{draft.greeting}</p>
          <p className="mt-4 font-serif text-[1.24rem] leading-[1.5] tracking-[-0.01em] text-ink">
            {draft.headline}
          </p>
        </div>

        <div className="mt-8 space-y-7">
          {draft.sections.map((section) => (
            <section key={section.kind}>
              <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.13em] text-pine-ink">
                {SECTION_TITLES[section.kind]}
              </h2>
              <ul className="mt-3 space-y-2.5">
                {section.items.map((item) => (
                  <li
                    key={item.text}
                    className="flex gap-3 font-serif text-[1.04rem] leading-[1.6] text-ink"
                  >
                    <span className="mt-[0.62em] size-[5px] shrink-0 rounded-full bg-pine" />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 font-serif text-[1.04rem] text-ink-soft">{draft.signoff}</p>
        <p className="mt-6 border-t border-line pt-4 text-[0.8rem] text-ink-faint">{sourceNote}</p>
      </article>

      <div
        style={stagger(2)}
        className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="max-w-[34ch] text-[0.95rem] leading-relaxed text-ink-soft">
          Built from your live project data. Doing this by hand takes most teams{' '}
          <span className="whitespace-nowrap text-ink">12&ndash;15 hours a week</span>.
        </p>
        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <button
            type="button"
            onClick={onFinish}
            disabled={finishing}
            className={buttonClasses()}
          >
            {finishing ? 'Saving your client…' : 'Take me to my dashboard'}
          </button>
          {error ? (
            <p role="alert" className="anim-fade text-[0.83rem] leading-relaxed text-ink-soft">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
