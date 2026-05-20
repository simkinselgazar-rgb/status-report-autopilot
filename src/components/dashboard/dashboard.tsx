'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ClientReport, ReportStatus } from '@/lib/dashboard/types';
import type { StatusReportDraft } from '@/lib/reports/types';
import { ClientList } from './client-list';
import { ReportView } from './report-view';

/** List order, the week's work to do floats to the top. */
const STATUS_ORDER: Record<ReportStatus, number> = { draft: 0, insufficient: 1, sent: 2 };
/** Deliberate beat while the report "sends", it's a real client email. */
const SENDING_MS = 1100;
/** Hold on the quiet checkmark before auto-advancing to the next draft. */
const CONFIRM_HOLD_MS = 750;

function firstSelectableId(reports: ClientReport[]): string | null {
  const pending = reports.find((report) => report.status === 'draft');
  return pending?.id ?? reports[0]?.id ?? null;
}

/** Persist a dashboard mutation. Resolves `false` on any failure, the caller decides. */
async function patchReport(
  id: string,
  body: { draft: StatusReportDraft } | { status: ReportStatus },
): Promise<boolean> {
  try {
    const response = await fetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The dashboard shell, two panes, the report state, and the wedge interactions:
 * J/K navigation, inline draft edits, and approve→send→auto-advance.
 *
 * `initialReports` is loaded server-side from the product DB; local state stays
 * optimistic and every mutation is persisted back through the report API.
 */
export function Dashboard({ initialReports }: { initialReports: ClientReport[] }) {
  const [reports, setReports] = useState<ClientReport[]>(initialReports);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    firstSelectableId(initialReports),
  );
  const [sendingId, setSendingId] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...reports].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]),
    [reports],
  );
  const selected = reports.find((report) => report.id === selectedId) ?? null;

  const selectAdjacent = useCallback(
    (direction: 1 | -1) => {
      setSelectedId((current) => {
        if (ordered.length === 0) return null;
        const index = ordered.findIndex((report) => report.id === current);
        const base = index < 0 ? 0 : index;
        const nextIndex = Math.min(ordered.length - 1, Math.max(0, base + direction));
        return ordered[nextIndex]!.id;
      });
    },
    [ordered],
  );

  // J/K move between clients, ignored while editing a line.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const key = event.key.toLowerCase();
      if (key === 'j') {
        event.preventDefault();
        selectAdjacent(1);
      } else if (key === 'k') {
        event.preventDefault();
        selectAdjacent(-1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectAdjacent]);

  const changeDraft = useCallback((id: string, draft: StatusReportDraft) => {
    setReports((current) => current.map((report) => (report.id === id ? { ...report, draft } : report)));
    void patchReport(id, { draft }).then((ok) => {
      if (!ok) console.error(`Failed to persist edit to report ${id}`);
    });
  }, []);

  const approve = useCallback(
    (id: string) => {
      if (sendingId) return;
      setSendingId(id);
      // Persist the send while the deliberate "sending" beat plays out.
      const persisted = patchReport(id, { status: 'sent' });
      window.setTimeout(() => {
        void persisted.then((ok) => {
          if (!ok) {
            console.error(`Failed to send report ${id}`);
            setSendingId(null);
            return;
          }
          // Send confirmed: flip to sent and let the quiet checkmark settle in.
          setReports((current) =>
            current.map((report) =>
              report.id === id
                ? { ...report, status: 'sent', sentAt: new Date().toISOString() }
                : report,
            ),
          );
          setSendingId(null);
          // Let that confirmation land, then the wedge: jump to the next draft.
          window.setTimeout(() => {
            const nextDraft = ordered.find(
              (report) => report.status === 'draft' && report.id !== id,
            );
            if (nextDraft) setSelectedId(nextDraft.id);
          }, CONFIRM_HOLD_MS);
        });
      }, SENDING_MS);
    },
    [ordered, sendingId],
  );

  const undo = useCallback((id: string) => {
    setReports((current) =>
      current.map((report) =>
        report.id === id ? { ...report, status: 'draft', sentAt: null } : report,
      ),
    );
    void patchReport(id, { status: 'draft' }).then((ok) => {
      if (!ok) console.error(`Failed to undo report ${id}`);
    });
  }, []);

  const skip = useCallback(
    (id: string) => {
      const nextDraft = ordered.find((report) => report.status === 'draft' && report.id !== id);
      if (nextDraft) setSelectedId(nextDraft.id);
    },
    [ordered],
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      <ClientList reports={ordered} selectedId={selectedId} onSelect={setSelectedId} />
      <main className="flex-1 overflow-y-auto">
        <ReportView
          report={selected}
          sending={selected !== null && sendingId === selected.id}
          onChangeDraft={(draft) => {
            if (selected) changeDraft(selected.id, draft);
          }}
          onApprove={() => {
            if (selected) approve(selected.id);
          }}
          onUndo={() => {
            if (selected) undo(selected.id);
          }}
          onSkip={() => {
            if (selected) skip(selected.id);
          }}
        />
      </main>
    </div>
  );
}
