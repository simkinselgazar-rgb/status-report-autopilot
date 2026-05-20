/**
 * Microsoft Entra app-only OAuth, the bring-your-own-credentials connect model
 * for Microsoft Teams.
 *
 * The deployer registers an app in Microsoft Entra ID, grants it the Graph
 * application permissions, and pastes its directory (tenant) id, application
 * (client) id, and a client secret into the connect step. This module mints
 * short-lived Graph access tokens from those credentials via the
 * `client_credentials` grant, no redirect, no refresh token; a fresh token is
 * minted as needed.
 */

import { z } from 'zod';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

export interface TeamsCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export class TeamsAuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'TeamsAuthError';
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

/** The Entra v2 token endpoint for a tenant. */
function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

/**
 * Mints a Microsoft Graph access token from Entra app-only credentials. Tokens
 * are short-lived (~1h); callers mint fresh rather than refresh.
 */
export async function mintAccessToken(
  credentials: TeamsCredentials,
  options?: { fetch?: typeof fetch },
): Promise<string> {
  const tenantId = credentials.tenantId?.trim();
  const clientId = credentials.clientId?.trim();
  const clientSecret = credentials.clientSecret?.trim();
  if (!tenantId || !clientId || !clientSecret) {
    throw new TeamsAuthError(
      'A Microsoft tenant id, client id, and client secret are all required.',
    );
  }
  const doFetch = options?.fetch ?? globalThis.fetch;

  let res: Response;
  try {
    res = await doFetch(tokenUrl(tenantId), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: GRAPH_SCOPE,
      }),
    });
  } catch (cause) {
    throw new TeamsAuthError('Could not reach Microsoft to mint an access token.', { cause });
  }

  if (!res.ok) {
    throw new TeamsAuthError(`Microsoft rejected the app credentials (${res.status}).`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (cause) {
    throw new TeamsAuthError('Microsoft returned an unreadable token response.', { cause });
  }

  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new TeamsAuthError('Microsoft token response did not match the expected shape.', {
      cause: parsed.error,
    });
  }
  return parsed.data.access_token;
}
