import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/cron/generate-reports/route';

function cronRequest(headers?: Record<string, string>): Request {
  return new Request('http://test/api/cron/generate-reports', { headers });
}

describe('GET /api/cron/generate-reports', () => {
  it('rejects a request with no authorization header', async () => {
    const res = await GET(cronRequest());
    expect(res.status).toBe(401);
  });

  it('rejects a request with the wrong bearer token', async () => {
    const res = await GET(cronRequest({ authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
  });
});
