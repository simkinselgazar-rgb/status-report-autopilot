import { describe, expect, it } from 'vitest';

import { TeamsAuthError, mintAccessToken } from '@/lib/connectors/teams-oauth';

const CREDS = { tenantId: 'tid', clientId: 'cid', clientSecret: 'sec' };

/** A fetch that returns one JSON body, ignoring the request. */
function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('mintAccessToken', () => {
  it('mints an access token from Entra app-only credentials', async () => {
    const token = await mintAccessToken(CREDS, {
      fetch: jsonFetch({ access_token: 'graph.minted', expires_in: 3600 }),
    });
    expect(token).toBe('graph.minted');
  });

  it('throws when a credential is missing', async () => {
    await expect(
      mintAccessToken({ tenantId: '', clientId: 'c', clientSecret: 's' }),
    ).rejects.toThrow(TeamsAuthError);
  });

  it('throws when Microsoft rejects the credentials', async () => {
    await expect(
      mintAccessToken(CREDS, { fetch: jsonFetch({ error: 'invalid_client' }, 401) }),
    ).rejects.toThrow(TeamsAuthError);
  });

  it('throws when the token response is malformed', async () => {
    await expect(
      mintAccessToken(CREDS, { fetch: jsonFetch({ wrong: 'shape' }) }),
    ).rejects.toThrow(TeamsAuthError);
  });
});
