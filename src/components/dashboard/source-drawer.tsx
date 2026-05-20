'use client';

import { useState } from 'react';

import type { SourceEvent, SourceEventKind } from '@/lib/connectors/types';

const KIND_LABEL: Record<SourceEventKind, string> = {
  task_completed: 'Completed',
  task_created: 'Created',
  milestone_completed: 'Milestone',
  comment: 'Comment',
  task_updated: 'Updated',
  meeting: 'Meeting',
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The provenance drawer, the Asana activity the agent drew the report from.
 * Per the brief, source data is always one click away, never hidden.
 */
export function SourceDrawer({ events }: { events: SourceEvent[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-[0.85rem] font-medium text-ink-soft transition-colors hover:text-ink"
        aria-expanded={open}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={`transition-transform duration-200 ease-out ${open ? 'rotate-90' : ''}`}
        >
          <path
            d="M4.5 2.5 8 6l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {open ? 'Hide source data' : 'View source data'}
        <span className="text-ink-faint">
          · {events.length} {events.length === 1 ? 'item' : 'items'} from Asana
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <ul className="mt-3 space-y-2.5">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3 text-[0.85rem] leading-relaxed">
                <span className="mt-0.5 inline-flex shrink-0 rounded bg-sunk px-1.5 py-0.5 text-[0.7rem] font-medium text-ink-soft">
                  {KIND_LABEL[event.kind]}
                </span>
                <span className="min-w-0">
                  <span className="text-ink">{event.title}</span>
                  <span className="text-ink-faint">
                    {event.actor ? ` · ${event.actor}` : ''} · {shortDate(event.timestamp)}
                  </span>
                  {event.detail ? (
                    <span className="block text-ink-soft">{event.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
