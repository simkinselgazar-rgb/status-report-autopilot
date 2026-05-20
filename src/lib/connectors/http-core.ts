/**
 * Shared HTTP plumbing for source connectors.
 *
 * Every connector module reused the same retry loop and the same reporting-
 * window helpers verbatim. They live here once; a connector wraps
 * {@link fetchWithRetry} and maps the settled response's status to its own
 * typed errors, the part that genuinely differs per source.
 */

import { ConnectorError, type ConnectorWindow, type SourceId } from './types';

/** Attempts beyond the first, on 429 / 5xx / transport errors. */
const MAX_RETRIES = 3;
const MAX_RETRY_WAIT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(MAX_RETRY_WAIT_MS, 500 * 2 ** attempt);
}

/** Honours a `Retry-After` header when present, else exponential backoff. */
function retryWaitMs(res: Response, attempt: number): number {
  const header = res.headers.get('Retry-After');
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(MAX_RETRY_WAIT_MS, seconds * 1000);
    }
  }
  return backoffMs(attempt);
}

/**
 * Runs an HTTP request with transport + 429/5xx retry (honouring `Retry-After`).
 * Returns the settled `Response`, the caller maps its status to a typed
 * result. A transport failure that outlasts the retry budget throws a
 * `network` {@link ConnectorError}.
 *
 * `label` is the service's human name, used only in the error message
 * (e.g. "Asana", "Microsoft Graph").
 */
export async function fetchWithRetry(
  source: SourceId,
  label: string,
  request: () => Promise<Response>,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await request();
    } catch (cause) {
      lastError = cause;
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new ConnectorError(source, 'network', `Could not reach ${label}.`, { cause });
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(retryWaitMs(res, attempt));
      continue;
    }
    return res;
  }
  // The loop always returns or throws within its budget; this satisfies the type.
  throw new ConnectorError(source, 'network', `${label} request failed after retries.`, {
    cause: lastError,
  });
}

/** True when an ISO timestamp falls within the reporting window (inclusive). */
export function inWindow(iso: string, window: ConnectorWindow): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= window.since.getTime() && t <= window.until.getTime();
}

/** Rejects a malformed or inverted reporting window with a `config` error. */
export function assertWindow(source: SourceId, window: ConnectorWindow): void {
  const since = window.since instanceof Date ? window.since.getTime() : NaN;
  const until = window.until instanceof Date ? window.until.getTime() : NaN;
  if (Number.isNaN(since) || Number.isNaN(until)) {
    throw new ConnectorError(source, 'config', 'The reporting window needs valid since/until dates.');
  }
  if (since > until) {
    throw new ConnectorError(source, 'config', 'The reporting window "since" must not be after "until".');
  }
}
