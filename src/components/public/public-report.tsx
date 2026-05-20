import { SECTION_TITLES, type StatusReportDraft } from '@/lib/reports/types';
import { stagger } from '@/lib/style';

interface Props {
  clientName: string;
  periodLabel: string;
  draft: StatusReportDraft;
  /** ISO, when the report was sent. */
  sentAt: string | null;
  /** Path to the downloadable PDF of this report. */
  pdfHref: string;
}

function formatSentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The shareable report, what the agency's client sees at `/r/[token]`.
 * Read-only, standalone, no app chrome: a quiet branded document.
 */
export function PublicReport({ clientName, periodLabel, draft, sentAt, pdfHref }: Props) {
  return (
    <div className="min-h-dvh bg-paper px-6 py-12 text-ink sm:py-20">
      <div className="anim-settle mx-auto max-w-[40rem]">
        <article
          style={stagger(0)}
          className="rounded-2xl border border-line bg-surface p-8 shadow-[var(--shadow-lifted)] sm:p-11"
        >
          <header className="border-b border-line pb-6">
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Weekly Status
            </p>
            <h1 className="mt-2 font-serif text-[1.7rem] leading-tight tracking-[-0.018em] text-ink">
              {clientName}
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
        </article>

        <div style={stagger(1)} className="mt-6 text-center">
          <a
            href={pdfHref}
            download
            className="text-[0.85rem] font-medium text-pine-ink underline-offset-4 hover:underline"
          >
            Download PDF
          </a>
        </div>

        <p style={stagger(2)} className="mt-3 text-center text-[0.8rem] text-ink-faint">
          {sentAt ? `Sent ${formatSentDate(sentAt)} · ` : ''}Status Report Autopilot
        </p>
      </div>
    </div>
  );
}
