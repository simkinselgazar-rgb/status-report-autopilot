/**
 * Shown when a `/r/[token]` link resolves to nothing, an unknown or revoked
 * token, or a report that hasn't been sent. Calm and branded, not a raw 404.
 */
export default function SharedReportNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
      <div className="max-w-[27rem] text-center">
        <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Status Report Autopilot
        </p>
        <h1 className="mt-3 font-serif text-[1.6rem] leading-tight tracking-[-0.015em] text-ink">
          This report isn&rsquo;t available.
        </h1>
        <p className="mt-3 text-[0.96rem] leading-relaxed text-ink-soft">
          The link may have expired or been revoked, or the report hasn&rsquo;t been sent yet.
          Reach out to whoever shared it for an up-to-date link.
        </p>
      </div>
    </div>
  );
}
