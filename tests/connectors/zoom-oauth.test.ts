import { describe, expect, it } from 'vitest';

import { ZoomS2SError, mintAccessToken } from '@/lib/connectors/zoom-oauth';

const CREDS = { accountId: 'acc', clientId: 'cid', clientSecret: 'sec' };

/** A fetch that returns one JSON body, ignoring the request. */
function jsonFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

describe('mintAccessToken', () => {
  it('mints an access token from Server-to-Server credentials', async () => {
    const token = await mintAccessToken(CREDS, {
      fetch: jsonFetch({ access_token: 'zm.minted', expires_in: 3600 }),
    });
    expect(token).toBe('zm.minted');
  });

  it('throws when a credential is missing', async () => {
    await expect(
      mintAccessToken({ accountId: '', clientId: 'c', clientSecret: 's' }),
    ).rejects.toThrow(ZoomS2SError);
  });

  it('throws when Zoom rejects the credentials', async () => {
    await expect(
      mintAccessToken(CREDS, { fetch: jsonFetch({ error: 'invalid_client' }, 400) }),
    ).rejects.toThrow(ZoomS2SError);
  });

  it('throws when the token response is malformed', async () => {
    await expect(
      mintAccessToken(CREDS, { fetch: jsonFetch({ wrong: 'shape' }) }),
    ).rejects.toThrow(ZoomS2SError);
  });
});
