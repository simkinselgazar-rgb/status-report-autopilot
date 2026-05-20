import Link from 'next/link';

import { SignOutButton } from '@/components/auth/sign-out-button';
import type { ClientReport } from '@/lib/dashboard/types';
import { StatusPill } from './status-pill';

interface Props {
  reports: ClientReport[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** The left pane, the PM's book of business and this week's status per client. */
export function ClientList({ reports, selectedId, onSelect }: Props) {
  const pending = reports.filter((report) => report.status === 'draft').length;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-paper">
      <div className="border-b border-line px-6 py-6">
        <p className="text-[0.74rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
          This week
        </p>
        <h1 className="mt-1.5 font-serif text-[1.35rem] leading-tight tracking-[-0.015em] text-ink">
          {pending > 0
            ? `${pending} draft${pending > 1 ? 's' : ''} to review`
            : 'All caught up'}
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {reports.map((report) => {
          const active = report.id === selectedId;
          return (
            <button
              key={report.id}
              type="button"
              onClick={() => onSelect(report.id)}
              aria-current={active}
              className={`flex w-full flex-col items-start gap-1.5 rounded-xl px-3.5 py-3 text-left outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-focus ${
                active ? 'bg-sunk' : 'hover:bg-sunk/55'
              }`}
            >
              <span className="text-[0.95rem] font-medium text-ink">{report.clientName}</span>
              <StatusPill status={report.status} />
            </button>
          );
        })}
      </nav>

      <div className="flex items-center justify-between border-t border-line px-6 py-3">
        <p className="text-[0.78rem] text-ink-faint">
          <kbd className="font-sans font-medium text-ink-soft">J</kbd> /{' '}
          <kbd className="font-sans font-medium text-ink-soft">K</kbd> to move
        </p>
        <div className="flex items-center gap-3.5">
          <Link
            href="/settings"
            className="text-[0.78rem] text-ink-faint underline-offset-2 transition-colors duration-150 ease-out hover:text-ink-soft hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Settings
          </Link>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
