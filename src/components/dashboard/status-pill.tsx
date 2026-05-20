import type { ReportStatus } from '@/lib/dashboard/types';

const STYLES: Record<ReportStatus, { label: string; className: string }> = {
  draft: { label: 'Draft ready', className: 'bg-ochre-soft text-ochre-ink' },
  sent: { label: 'Sent', className: 'bg-pine-soft text-pine-ink' },
  insufficient: { label: 'No data yet', className: 'bg-sunk text-ink-faint' },
};

export function StatusPill({ status }: { status: ReportStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[0.74rem] font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}
