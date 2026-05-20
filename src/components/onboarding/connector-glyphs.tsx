import type { ConnectorId } from '@/lib/onboarding/types';

const SVG = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  'aria-hidden': true,
} as const;

function AsanaMark() {
  return (
    <svg {...SVG}>
      <circle cx="10" cy="5.6" r="2.7" fill="currentColor" />
      <circle cx="5.7" cy="13" r="2.7" fill="currentColor" />
      <circle cx="14.3" cy="13" r="2.7" fill="currentColor" />
    </svg>
  );
}

function LinearMark() {
  return (
    <svg {...SVG}>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="4.2" y1="9" x2="9" y2="4.2" />
        <line x1="4.2" y1="13.4" x2="13.4" y2="4.2" />
        <line x1="8" y1="15.8" x2="15.8" y2="8" />
      </g>
    </svg>
  );
}

function SlackMark() {
  return (
    <svg {...SVG}>
      <g fill="currentColor">
        <rect x="3.6" y="3.6" width="5.6" height="5.6" rx="1.9" />
        <rect x="10.8" y="3.6" width="5.6" height="5.6" rx="1.9" opacity="0.5" />
        <rect x="3.6" y="10.8" width="5.6" height="5.6" rx="1.9" opacity="0.5" />
        <rect x="10.8" y="10.8" width="5.6" height="5.6" rx="1.9" />
      </g>
    </svg>
  );
}

function ZoomMark() {
  return (
    <svg {...SVG}>
      <rect x="2.6" y="6" width="10.4" height="8" rx="2.4" fill="currentColor" />
      <path d="M13.4 8.7 17.4 6.2v7.6l-4-2.5Z" fill="currentColor" />
    </svg>
  );
}

function TeamsMark() {
  return (
    <svg {...SVG}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M6.4 4H13.6A2.4 2.4 0 0 1 16 6.4V13.6A2.4 2.4 0 0 1 13.6 16H6.4A2.4 2.4 0 0 1 4 13.6V6.4A2.4 2.4 0 0 1 6.4 4ZM6.6 6.7H13.4V8.5H10.9V13.3H9.1V8.5H6.6Z"
      />
    </svg>
  );
}

const MARKS: Record<ConnectorId, () => React.ReactElement> = {
  asana: AsanaMark,
  linear: LinearMark,
  slack: SlackMark,
  zoom: ZoomMark,
  teams: TeamsMark,
};

export function ConnectorGlyph({ id }: { id: ConnectorId }) {
  const Mark = MARKS[id];
  return <Mark />;
}
