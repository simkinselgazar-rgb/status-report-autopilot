'use client';

import Link from 'next/link';

import type { ClientReport } from '@/lib/dashboard/types';
import { SECTION_TITLES, type StatusReportDraft } from '@/lib/reports/types';
import { Button, buttonClasses } from '@/components/ui/button';
import { CopyLinkButton } from './copy-link-button';
import { EditableLine } from './editable-line';
import { SourceDrawer } from './source-drawer';
import { StatusPill } from './status-pill';

interface Props {
  report: ClientReport | null;
  /** True while this report's approve→send animation is running. */
  sending: boolean;
  onChangeDraft: (draft: StatusReportDraft) => void;
  onApprove: () => void;
  onUndo: () => void;
  onSkip: () => void;
}

const UNDO_WINDOW_MS = 5 * 60_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function CheckMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.6 7.4 5.4 10.2 11.4 3.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReportHeader({ report }: { report: ClientReport }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line pb-6">
      <div>
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Weekly Status
        </p>
        <h2 className="mt-2 font-serif text-[1.7rem] leading-tight tracking-[-0.018em] text-ink">
          {report.clientName}
        </h2>
        <p className="mt-1 text-[0.92rem] text-ink-soft">{report.periodLabel}</p>
      </div>
      <StatusPill status={report.status} />
    </header>
  );
}

function Shell({ reportId, children }: { reportId: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[44rem] px-6 py-10 sm:px-12">
      {/* Keyed by report id so the light entrance replays on every switch. */}
      <article
        key={reportId}
        className="anim-report rounded-2xl border border-line bg-surface p-8 shadow-[var(--shadow-lifted)] sm:p-10"
      >
        {children}
      </article>
    </div>
  );
}

/** The right pane, the report draft view and its sent / quiet-week variants. */
export function ReportView({ report, sending, onChangeDraft, onApprove, onUndo, onSkip }: Props) {
  if (!report) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <div className="max-w-[28rem] text-center">
          <h2 className="font-serif text-[1.6rem] tracking-[-0.015em] text-ink">No clients yet.</h2>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink-soft">
            Set up your first client and we&rsquo;ll draft last week&rsquo;s report.
          </p>
          <Link href="/onboarding" className={`${buttonClasses()} mt-6`}>
            Set up your first client
          </Link>
        </div>
      </div>
    );
  }

  if (report.status === 'insufficient') {
    return (
      <Shell reportId={report.id}>
        <ReportHeader report={report} />
        <div className="mt-7">
          <p className="font-serif text-[1.3rem] leading-snug tracking-[-0.012em] text-ink">
            A quiet week.
          </p>
          <p className="mt-3 max-w-[58ch] text-[1rem] leading-relaxed text-ink-soft">
            {report.insufficientReason}
          </p>
          <p className="mt-2 max-w-[58ch] text-[0.95rem] leading-relaxed text-ink-faint">
            We won&rsquo;t send a half-confident report, skip this week, or check the source
            data below.
          </p>
        </div>
        <SourceDrawer events={report.sourceEvents} />
        <div className="mt-6 border-t border-line pt-6">
          <Button onClick={onSkip}>Skip this week</Button>
        </div>
      </Shell>
    );
  }

  const draft = report.draft;
  if (!draft) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-[0.95rem] text-ink-faint">
        This report has no content.
      </div>
    );
  }

  const editable = report.status === 'draft';
  const canUndo =
    report.sentAt !== null && Date.now() - new Date(report.sentAt).getTime() < UNDO_WINDOW_MS;

  function setHeadline(text: string) {
    onChangeDraft({ ...draft!, headline: text });
  }
  function setGreeting(text: string) {
    onChangeDraft({ ...draft!, greeting: text });
  }
  function setSignoff(text: string) {
    onChangeDraft({ ...draft!, signoff: text });
  }
  function setItem(sectionIndex: number, itemIndex: number, text: string) {
    onChangeDraft({
      ...draft!,
      sections: draft!.sections.map((section, si) =>
        si !== sectionIndex
          ? section
          : {
              ...section,
              items: section.items.map((item, ii) =>
                ii !== itemIndex ? item : { ...item, text },
              ),
            },
      ),
    });
  }

  return (
    <Shell reportId={report.id}>
      <ReportHeader report={report} />
      <p className="mt-4 text-[0.82rem] text-ink-faint">
        {editable
          ? `Draft generated ${timeAgo(report.generatedAt)} · ${report.eventsUsed} sources`
          : `Generated ${timeAgo(report.generatedAt)} · ${report.eventsUsed} sources`}
      </p>

      <div className="mt-6">
        <EditableLine
          value={draft.greeting}
          editable={editable}
          onCommit={setGreeting}
          className="text-[1rem] leading-relaxed text-ink-soft"
          label="the greeting"
        />
        <div className="mt-4">
          <EditableLine
            value={draft.headline}
            editable={editable}
            onCommit={setHeadline}
            className="font-serif text-[1.24rem] leading-[1.5] tracking-[-0.01em] text-ink"
            label="the headline"
          />
        </div>
      </div>

      <div className="mt-8 space-y-7">
        {draft.sections.map((section, sectionIndex) => (
          <section key={section.kind}>
            <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.13em] text-pine-ink">
              {SECTION_TITLES[section.kind]}
            </h3>
            <ul className="mt-3 space-y-2">
              {section.items.map((item, itemIndex) => (
                <li key={`${section.kind}-${itemIndex}`} className="flex gap-3">
                  <span className="mt-[0.62em] size-[5px] shrink-0 rounded-full bg-pine" />
                  <EditableLine
                    value={item.text}
                    editable={editable}
                    onCommit={(text) => setItem(sectionIndex, itemIndex, text)}
                    className="flex-1 font-serif text-[1.04rem] leading-[1.6] text-ink"
                    label="this line"
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8">
        <EditableLine
          value={draft.signoff}
          editable={editable}
          onCommit={setSignoff}
          className="font-serif text-[1.04rem] text-ink-soft"
          label="the sign-off"
        />
      </div>

      <SourceDrawer events={report.sourceEvents} />

      {editable ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-6">
          <Button onClick={onApprove} disabled={sending}>
            {sending ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />
                Sending…
              </>
            ) : (
              'Approve & send to client'
            )}
          </Button>
          <span className="text-[0.85rem] text-ink-faint">to {report.recipient}</span>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <span className="anim-confirm inline-flex items-center gap-2 text-[0.9rem] font-medium text-pine-ink">
            <CheckMark />
            Sent to {report.recipient}
            {report.sentAt ? ` · ${timeAgo(report.sentAt)}` : ''}
          </span>
          <div className="flex items-center gap-1">
            <CopyLinkButton token={report.shareToken} />
            {canUndo ? (
              <Button variant="ghost" size="sm" onClick={onUndo}>
                Undo
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Shell>
  );
}
