/**
 * Zoom Server-to-Server OAuth, the bring-your-own-credentials connect model.
 *
 * The deployer creates a Zoom Server-to-Server OAuth app and pastes its
 * account id, client id, and client secret into the connect step. This module
 * mints short-lived access tokens from those credentials via the
 * `account_credentials` grant, no redirect, no refresh token; a fresh token
 * is minted as needed.
 */

import { z } from 'zod';

const TOKEN_URL = 'https://zoom.us/oauth/token';

export interface ZoomS2SCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

export class ZoomS2SError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ZoomS2SError';
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

/**
 * Mints a Zoom access token from Server-to-Server OAuth credentials. Tokens
 * are short-lived (~1h); callers mint fresh rather than refresh.
 */
export async function mintAccessToken(
  credentials: ZoomS2SCredentials,
  options?: { fetch?: typeof fetch },
): Promise<string> {
  const accountId = credentials.accountId?.trim();
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  if (!accountId || !clientId || !clientSecret) {
    throw new ZoomS2SError('A Zoom account id, client id, and client secret are all required.');
  }
  const doFetch = options?.fetch ?? globalThis.fetch;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  let res: Response;
  try {
    res = await doFetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'account_credentials', account_id: accountId }),
    });
  } catch (cause) {
    throw new ZoomS2SError('Could not reach Zoom to mint an access token.', { cause });
  }

  if (!res.ok) {
    throw new ZoomS2SError(`Zoom rejected the Server-to-Server credentials (${res.status}).`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new ZoomS2SError('Zoom returned an unreadable token response.', { cause });
  }

  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new ZoomS2SError('Zoom token response did not match the expected shape.', {
      cause: parsed.error,
    });
  }
  return parsed.data.access_token;
}
