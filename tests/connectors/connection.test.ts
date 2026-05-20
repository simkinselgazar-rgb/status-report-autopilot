import { describe, expect, it } from 'vitest';

import { createConnectorForConnection, sourceConnectionSchema } from '@/lib/connectors/connection';
import type { SourceConnection } from '@/lib/onboarding/types';

const target = {
  accountName: 'Acme',
  workspaceName: 'Acme HQ',
  projectName: 'Site redesign',
  projectId: 'P1',
};

const asana: SourceConnection = { source: 'asana', accessToken: 'tok', ...target };
const linear: SourceConnection = { source: 'linear', accessToken: 'tok', ...target };
const slack: SourceConnection = { source: 'slack', accessToken: 'tok', ...target };
const zoom: SourceConnection = {
  source: 'zoom',
  accountId: 'acc',
  clientId: 'cid',
  clientSecret: 'sec',
  ...target,
};
const teams: SourceConnection = {
  source: 'teams',
  tenantId: 'tid',
  clientId: 'cid',
  clientSecret: 'sec',
  ...target,
  projectId: 't1|19:abc@thread.tacv2',
};

describe('sourceConnectionSchema', () => {
  it('accepts a valid asana connection', () => {
    expect(sourceConnectionSchema.safeParse(asana).success).toBe(true);
  });

  it('accepts a valid linear connection', () => {
    expect(sourceConnectionSchema.safeParse(linear).success).toBe(true);
  });

  it('accepts a valid slack connection', () => {
    expect(sourceConnectionSchema.safeParse(slack).success).toBe(true);
  });

  it('accepts a valid zoom connection', () => {
    expect(sourceConnectionSchema.safeParse(zoom).success).toBe(true);
  });

  it('accepts a valid teams connection', () => {
    expect(sourceConnectionSchema.safeParse(teams).success).toBe(true);
  });

  it('rejects an unknown source', () => {
    expect(sourceConnectionSchema.safeParse({ ...asana, source: 'jira' }).success).toBe(false);
  });

  it('rejects a token connection with no project', () => {
    expect(sourceConnectionSchema.safeParse({ ...asana, projectId: '' }).success).toBe(false);
  });

  it('rejects a token connection with no access token', () => {
    expect(sourceConnectionSchema.safeParse({ ...asana, accessToken: '' }).success).toBe(false);
  });

  it('rejects a zoom connection missing a credential', () => {
    expect(sourceConnectionSchema.safeParse({ ...zoom, clientSecret: '' }).success).toBe(false);
  });

  it('rejects a teams connection missing a credential', () => {
    expect(sourceConnectionSchema.safeParse({ ...teams, tenantId: '' }).success).toBe(false);
  });
});

describe('createConnectorForConnection', () => {
  it('builds an asana connector for an asana connection', () => {
    expect(createConnectorForConnection(asana).source).toBe('asana');
  });

  it('builds a linear connector for a linear connection', () => {
    expect(createConnectorForConnection(linear).source).toBe('linear');
  });

  it('builds a slack connector for a slack connection', () => {
    expect(createConnectorForConnection(slack).source).toBe('slack');
  });

  it('builds a zoom connector for a zoom connection', () => {
    expect(createConnectorForConnection(zoom).source).toBe('zoom');
  });

  it('builds a teams connector for a teams connection', () => {
    expect(createConnectorForConnection(teams).source).toBe('teams');
  });
});
