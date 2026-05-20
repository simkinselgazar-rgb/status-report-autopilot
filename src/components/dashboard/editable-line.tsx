'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  /** When false, renders static text (e.g. an already-sent report). */
  editable: boolean;
  onCommit: (next: string) => void;
  /** Text styling, shared by the idle view and the edit textarea so they match. */
  className?: string;
  /** Accessible label for the field. */
  label: string;
}

function autosize(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * A line of report prose that the PM can tweak in place, click to edit, blur
 * or Enter to commit, Escape to cancel. No modal: the wedge is fast edits.
 */
export function EditableLine({ value, editable, onCommit, className = '', label }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Re-sync when the underlying value changes (switching reports, external edit).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (editing && el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      autosize(el);
    }
  }, [editing]);

  if (!editable) {
    return <div className={className}>{value}</div>;
  }

  function commit(): void {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) {
      onCommit(next);
    } else {
      setDraft(value);
    }
  }

  function cancel(): void {
    setDraft(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Edit ${label}`}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setEditing(true);
          }
        }}
        className={`${className} -mx-1.5 cursor-text rounded-md px-1.5 outline-none transition-colors duration-150 ease-out hover:bg-sunk focus-visible:bg-sunk focus-visible:ring-2 focus-visible:ring-focus`}
      >
        {value}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      aria-label={label}
      rows={1}
      onChange={(event) => {
        setDraft(event.target.value);
        autosize(event.target);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
      className={`${className} -mx-1.5 block w-[calc(100%+0.75rem)] resize-none overflow-hidden rounded-md bg-ochre-soft px-1.5 outline-none ring-2 ring-focus`}
    />
  );
}
