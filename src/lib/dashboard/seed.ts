/**
 * Seed dashboard data. Stands in for the product DB until persistence lands,
 * shaped exactly like what `/api/reports/generate` produces, so swapping in
 * real data later is a data-source change, not a UI change.
 */

import type { SourceEvent } from '@/lib/connectors/types';
import type { ClientReport } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();

function event(
  id: string,
  kind: SourceEvent['kind'],
  title: string,
  dayOffset: number,
  actor: string,
  detail?: string,
): SourceEvent {
  return {
    id,
    source: 'asana',
    kind,
    title,
    actor,
    timestamp: daysAgo(dayOffset),
    ...(detail ? { detail } : {}),
  };
}

export const SEED_REPORTS: ClientReport[] = [
  {
    id: 'northwind',
    shareToken: '11111111-1111-4111-8111-111111111111',
    clientName: 'Northwind Studio',
    periodLabel: 'Week of June 8–12',
    status: 'draft',
    generatedAt: hoursAgo(3),
    eventsUsed: 6,
    recipient: 'maya@northwindstudio.com',
    sentAt: null,
    insufficientReason: null,
    sourceEvents: [
      event('nw-1', 'task_completed', 'Homepage & product-page design review', 4, 'Dana Holt'),
      event('nw-2', 'task_completed', 'Migrate 240 legacy blog posts to the new CMS', 3, 'Priya Raman'),
      event('nw-3', 'task_updated', 'Homepage front-end build', 1, 'Leo Park', 'Moved to ~70% complete'),
      event('nw-4', 'task_updated', 'Accessibility pass, component library', 2, 'Dana Holt', 'First audit scheduled Thursday'),
      event('nw-5', 'comment', 'About page', 1, 'Leo Park', 'Still waiting on final team headshots'),
      event('nw-6', 'task_created', 'Contact & pricing page copy', 0, 'Priya Raman'),
    ],
    draft: {
      headline:
        "Northwind's new homepage moved into final review this week, keeping the May launch on track.",
      greeting: "Here's where things landed on the site redesign this week.",
      sections: [
        {
          kind: 'shipped',
          items: [
            {
              text: "The homepage and product-page designs cleared internal review, they're ready for your sign-off.",
              sourceEventIds: ['nw-1'],
            },
            {
              text: 'We migrated all 240 legacy blog posts into the new CMS, with every redirect mapped and tested.',
              sourceEventIds: ['nw-2'],
            },
          ],
        },
        {
          kind: 'in_flight',
          items: [
            {
              text: 'The homepage front-end build is roughly 70% complete and on track for review next Tuesday.',
              sourceEventIds: ['nw-3'],
            },
            {
              text: 'An accessibility pass on the shared component library is underway; first results land Thursday.',
              sourceEventIds: ['nw-4'],
            },
          ],
        },
        {
          kind: 'blockers',
          items: [
            {
              text: 'We need final team headshots by Wednesday to keep the About page on schedule.',
              sourceEventIds: ['nw-5'],
            },
          ],
        },
        {
          kind: 'next',
          items: [
            {
              text: 'Homepage build review early next week, then into the contact and pricing pages.',
              sourceEventIds: ['nw-6'],
            },
          ],
        },
      ],
      signoff: 'The Northwind project team',
    },
  },
  {
    id: 'harbor-main',
    shareToken: '22222222-2222-4222-8222-222222222222',
    clientName: 'Harbor & Main',
    periodLabel: 'Week of June 8–12',
    status: 'draft',
    generatedAt: hoursAgo(3),
    eventsUsed: 4,
    recipient: 'james@harborandmain.co',
    sentAt: null,
    insufficientReason: null,
    sourceEvents: [
      event('hm-1', 'milestone_completed', 'Brand identity system, v2 delivered', 2, 'Sofia Reyes'),
      event('hm-2', 'task_completed', 'Q3 campaign concepts, three routes', 4, 'Marcus Lin'),
      event('hm-3', 'task_updated', 'Launch landing page', 1, 'Sofia Reyes', 'Build started, copy in draft'),
      event('hm-4', 'comment', 'Campaign route selection', 1, 'Marcus Lin', 'Needs client pick to proceed'),
    ],
    draft: {
      headline:
        "Harbor & Main's refreshed brand system is finished, and three Q3 campaign routes are ready for your pick.",
      greeting: 'A productive week on the brand and campaign work, a quick rundown below.',
      sections: [
        {
          kind: 'shipped',
          items: [
            {
              text: 'Brand identity system v2 is delivered, type, color, and logo usage now live in one shared reference.',
              sourceEventIds: ['hm-1'],
            },
            {
              text: 'We developed three distinct creative routes for the Q3 campaign, each with sample messaging.',
              sourceEventIds: ['hm-2'],
            },
          ],
        },
        {
          kind: 'in_flight',
          items: [
            {
              text: 'The launch landing page build has started; first copy draft is in progress.',
              sourceEventIds: ['hm-3'],
            },
          ],
        },
        {
          kind: 'blockers',
          items: [
            {
              text: 'Let us know which of the three campaign routes you want to take forward so we can move into production.',
              sourceEventIds: ['hm-4'],
            },
          ],
        },
      ],
      signoff: 'Your team at the studio',
    },
  },
  {
    id: 'cedarline',
    shareToken: '33333333-3333-4333-8333-333333333333',
    clientName: 'Cedarline Co.',
    periodLabel: 'Week of June 8–12',
    status: 'draft',
    generatedAt: hoursAgo(4),
    eventsUsed: 5,
    recipient: 'ops@cedarline.io',
    sentAt: null,
    insufficientReason: null,
    sourceEvents: [
      event('cl-1', 'task_completed', 'Onboarding flow, iOS build', 3, 'Tariq Aziz'),
      event('cl-2', 'task_completed', 'Push-notification permissions screen', 5, 'Hannah Cole'),
      event('cl-3', 'task_updated', 'Offline mode for the order list', 1, 'Tariq Aziz', 'In review'),
      event('cl-4', 'comment', 'TestFlight build', 2, 'Hannah Cole', 'Shared with the client team'),
      event('cl-5', 'task_created', 'Settings & profile screens', 0, 'Tariq Aziz'),
    ],
    draft: {
      headline:
        "Cedarline's app onboarding is complete and a fresh TestFlight build is in your hands.",
      greeting: "Here's the week on the mobile app build.",
      sections: [
        {
          kind: 'shipped',
          items: [
            {
              text: 'The full onboarding flow is built on iOS, including the push-notification permissions screen.',
              sourceEventIds: ['cl-1', 'cl-2'],
            },
            {
              text: "We shared a new TestFlight build with your team, it's ready to try on real devices.",
              sourceEventIds: ['cl-4'],
            },
          ],
        },
        {
          kind: 'in_flight',
          items: [
            {
              text: 'Offline mode for the order list is in review and should land early next week.',
              sourceEventIds: ['cl-3'],
            },
          ],
        },
        {
          kind: 'next',
          items: [
            {
              text: 'We start on the settings and profile screens, then move toward a first end-to-end pass.',
              sourceEventIds: ['cl-5'],
            },
          ],
        },
      ],
      signoff: 'The Cedarline build team',
    },
  },
  {
    id: 'atlas-freight',
    shareToken: '44444444-4444-4444-8444-444444444444',
    clientName: 'Atlas Freight',
    periodLabel: 'Week of June 1–5',
    status: 'sent',
    generatedAt: daysAgo(8),
    eventsUsed: 4,
    recipient: 'dispatch@atlasfreight.com',
    sentAt: daysAgo(7),
    insufficientReason: null,
    sourceEvents: [
      event('af-1', 'task_completed', 'Driver dashboard, route filters', 9, 'Nina Powell'),
      event('af-2', 'task_completed', 'Live ETA widget', 10, 'Owen Brooks'),
      event('af-3', 'task_updated', 'Dispatch console redesign', 8, 'Nina Powell', 'In progress'),
      event('af-4', 'task_created', 'Carrier scorecard report', 7, 'Owen Brooks'),
    ],
    draft: {
      headline:
        "Atlas Freight's driver dashboard shipped with route filters and a live ETA widget.",
      greeting: 'A quick wrap-up of last week on the logistics platform.',
      sections: [
        {
          kind: 'shipped',
          items: [
            {
              text: 'The driver dashboard now has route filters and a live ETA widget, both live for your team.',
              sourceEventIds: ['af-1', 'af-2'],
            },
          ],
        },
        {
          kind: 'in_flight',
          items: [
            {
              text: 'The dispatch console redesign is in progress and on track for next week.',
              sourceEventIds: ['af-3'],
            },
          ],
        },
        {
          kind: 'next',
          items: [
            {
              text: 'We begin the carrier scorecard report once the dispatch console is in review.',
              sourceEventIds: ['af-4'],
            },
          ],
        },
      ],
      signoff: 'The Atlas Freight team',
    },
  },
  {
    id: 'bloom-pediatrics',
    shareToken: '55555555-5555-4555-8555-555555555555',
    clientName: 'Bloom Pediatrics',
    periodLabel: 'Week of June 8–12',
    status: 'insufficient',
    generatedAt: hoursAgo(3),
    eventsUsed: 2,
    recipient: 'admin@bloompediatrics.com',
    sentAt: null,
    insufficientReason: 'Only 2 updates this week, too quiet for a full report.',
    sourceEvents: [
      event('bp-1', 'comment', 'Appointment booking page', 2, 'Grace Tan', 'Quick copy tweak'),
      event('bp-2', 'task_updated', 'Staff bios section', 4, 'Grace Tan', 'Minor edit'),
    ],
    draft: null,
  },
];
