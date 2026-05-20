export type ConnectorId = 'asana' | 'linear' | 'slack' | 'zoom' | 'teams';
export type Tone = 'buttoned' | 'professional' | 'warm';
export type Length = 'headlines' | 'balanced' | 'thorough';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export type TimeSlot = '7am' | '9am' | '12pm' | '3pm';

/** One credential the user pastes to connect a source. */
export interface CredentialField {
  /** The connection-object key this field fills (e.g. `accessToken`, `accountId`). */
  key: string;
  /** Field label shown in the connect panel. */
  label: string;
  /** Secret values are rendered masked. */
  secret?: boolean;
}

export interface ConnectorMeta {
  id: ConnectorId;
  name: string;
  reads: string;
  /** Whether the connector is live. */
  available: boolean;
  /** The credentials the user pastes to connect this source. */
  credentials: {
    /** Fields to collect, one for a token connector, several for Zoom. */
    fields: CredentialField[];
    /** Where to create or find the credentials. */
    url: string;
    /** One-line how-to shown in the connect panel. */
    hint: string;
  };
}

export const CONNECTORS: readonly ConnectorMeta[] = [
  {
    id: 'asana',
    name: 'Asana',
    reads: 'Tasks, milestones, and who moved what',
    available: true,
    credentials: {
      fields: [{ key: 'accessToken', label: 'Personal Access Token', secret: true }],
      url: 'https://app.asana.com/0/my-apps',
      hint: 'In Asana: My Settings → Apps → Manage developer apps → Create new token.',
    },
  },
  {
    id: 'linear',
    name: 'Linear',
    reads: 'Issues, cycles, and shipped work',
    available: true,
    credentials: {
      fields: [{ key: 'accessToken', label: 'Personal API key', secret: true }],
      url: 'https://linear.app/settings/api',
      hint: 'In Linear: Settings → API → Personal API keys → Create key.',
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    reads: 'Channel updates and flagged blockers',
    available: true,
    credentials: {
      fields: [{ key: 'accessToken', label: 'Bot token', secret: true }],
      url: 'https://api.slack.com/apps',
      hint: 'Create a Slack app, add the channels:read, channels:history and users:read scopes, install it to your workspace, then copy the Bot User OAuth Token (xoxb-…).',
    },
  },
  {
    id: 'zoom',
    name: 'Zoom',
    reads: 'Recorded meetings and their transcripts',
    available: true,
    credentials: {
      fields: [
        { key: 'accountId', label: 'Account ID' },
        { key: 'clientId', label: 'Client ID' },
        { key: 'clientSecret', label: 'Client secret', secret: true },
      ],
      url: 'https://marketplace.zoom.us',
      hint: 'Build a Server-to-Server OAuth app at Zoom Marketplace, add the user:read and cloud_recording:read scopes, then copy its Account ID, Client ID, and Client Secret.',
    },
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    reads: 'Channel posts and team announcements',
    available: true,
    credentials: {
      fields: [
        { key: 'tenantId', label: 'Directory (tenant) ID' },
        { key: 'clientId', label: 'Application (client) ID' },
        { key: 'clientSecret', label: 'Client secret', secret: true },
      ],
      url: 'https://entra.microsoft.com',
      hint: 'Register an app in Microsoft Entra ID, add the Team.ReadBasic.All, Channel.ReadBasic.All and ChannelMessage.Read.All application permissions (grant admin consent), then create a client secret. Copy the Directory ID, Application ID, and the secret value.',
    },
  },
];

/** Fields shared by every connected source, the tracked targets. */
interface ConnectionBase {
  /** Display name of the connected account. */
  accountName: string;
  /** The workspace / team the tracked projects live in. */
  workspaceName: string;
  /** Display names of the tracked projects, parallel to `projectIds`. */
  projectNames: string[];
  /**
   * The tracked projects' ids (Asana gids / Linear project ids / Zoom user
   * ids / Slack channel ids / Teams `teamId|channelId` composites). At least
   * one. A client can track many targets per source.
   */
  projectIds: string[];
}

/** A connected Asana source, a pasted token plus one or more chosen projects. */
export interface AsanaConnection extends ConnectionBase {
  source: 'asana';
  accessToken: string;
}

/** A connected Linear source, a pasted API key plus one or more chosen projects. */
export interface LinearConnection extends ConnectionBase {
  source: 'linear';
  accessToken: string;
}

/** A connected Slack source, a pasted bot token plus one or more chosen channels. */
export interface SlackConnection extends ConnectionBase {
  source: 'slack';
  accessToken: string;
}

/** A connected Zoom source. Server-to-Server credentials plus one or more chosen users. */
export interface ZoomConnection extends ConnectionBase {
  source: 'zoom';
  accountId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * A connected Microsoft Teams source. Entra app-only credentials plus one or
 * more chosen channels. Each `projectIds` entry is a `teamId|channelId`
 * composite (a team id is a GUID and a channel id starts with `19:`, neither
 * contains a `|`).
 */
export interface TeamsConnection extends ConnectionBase {
  source: 'teams';
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/** Any connected source. Discriminated on `source`. */
export type SourceConnection =
  | AsanaConnection
  | LinearConnection
  | SlackConnection
  | ZoomConnection
  | TeamsConnection;

export const TONES: readonly { id: Tone; label: string; note: string }[] = [
  { id: 'buttoned', label: 'Buttoned-up', note: 'Formal, precise' },
  { id: 'professional', label: 'Professional', note: 'Clear and neutral' },
  { id: 'warm', label: 'Warm', note: 'Friendly, human' },
];

export const LENGTHS: readonly { id: Length; label: string; note: string }[] = [
  { id: 'headlines', label: 'Headlines', note: 'The essentials only' },
  { id: 'balanced', label: 'Balanced', note: 'Most teams pick this' },
  { id: 'thorough', label: 'Thorough', note: 'Every detail covered' },
];

export const WEEKDAYS: readonly { id: Weekday; short: string; full: string }[] = [
  { id: 'mon', short: 'Mon', full: 'Monday' },
  { id: 'tue', short: 'Tue', full: 'Tuesday' },
  { id: 'wed', short: 'Wed', full: 'Wednesday' },
  { id: 'thu', short: 'Thu', full: 'Thursday' },
  { id: 'fri', short: 'Fri', full: 'Friday' },
];

export const TIME_SLOTS: readonly { id: TimeSlot; label: string }[] = [
  { id: '7am', label: '7:00 AM' },
  { id: '9am', label: '9:00 AM' },
  { id: '12pm', label: '12:00 PM' },
  { id: '3pm', label: '3:00 PM' },
];

export interface OnboardingState {
  clientName: string;
  /** Client-facing recipient an approved report sends to. */
  clientEmail: string;
  /** Connected sources, a client can connect more than one. */
  connections: SourceConnection[];
  tone: Tone;
  length: Length;
  signoff: string;
  voiceSample: string;
  day: Weekday;
  time: TimeSlot;
  /** IANA timezone the cadence day/time are interpreted in. */
  timezone: string;
}

export const INITIAL_STATE: OnboardingState = {
  clientName: '',
  clientEmail: '',
  connections: [],
  tone: 'professional',
  length: 'balanced',
  signoff: '',
  voiceSample: '',
  day: 'fri',
  time: '9am',
  timezone: 'America/New_York',
};
