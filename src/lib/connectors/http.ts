/** Shared helpers for the connector API routes, error shaping + status mapping. */

import { ConnectorError, type ConnectorErrorCode } from './types';

/** A 400 for malformed requests (bad JSON, missing fields). */
export function badRequest(message: string): Response {
  return Response.json({ ok: false, error: { code: 'bad_request', message } }, { status: 400 });
}

/** Maps any thrown connector failure to a JSON error response. */
export function connectorErrorResponse(error: unknown): Response {
  if (error instanceof ConnectorError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: messageFor(error.code) } },
      { status: statusFor(error.code) },
    );
  }
  return Response.json(
    { ok: false, error: { code: 'unknown', message: 'The connector request failed unexpectedly.' } },
    { status: 502 },
  );
}

function statusFor(code: ConnectorErrorCode): number {
  switch (code) {
    case 'auth':
      return 401;
    case 'not_found':
      return 404;
    case 'rate_limited':
      return 429;
    case 'config':
      return 400;
    default:
      return 502;
  }
}

function messageFor(code: ConnectorErrorCode): string {
  switch (code) {
    case 'auth':
      return 'That access token was rejected. Double-check it and try again.';
    case 'not_found':
      return 'We could not find that resource in the connected account.';
    case 'rate_limited':
      return 'The source is rate-limiting us right now. Wait a moment and retry.';
    case 'network':
      return 'We could not reach the source. Check your connection and retry.';
    case 'config':
      return 'The connection request was missing required information.';
    default:
      return 'Something went wrong talking to the source.';
  }
}
