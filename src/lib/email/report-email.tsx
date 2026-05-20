/**
 * The branded client-facing report email.
 *
 * Email HTML can't load the app's web fonts, so it leans on a Georgia serif
 * stack to keep the editorial voice. Colors mirror the paper-and-ink palette
 * as hex. Rendered to HTML + plain text by `send.tsx`.
 */

import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';

import { SECTION_TITLES, type StatusReportDraft } from '@/lib/reports/types';

interface Props {
  clientName: string;
  periodLabel: string;
  draft: StatusReportDraft;
  /** Absolute URL of the public `/r/[token]` report. */
  shareUrl: string;
}

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const s = {
  page: { backgroundColor: '#f6f3ec', margin: 0, padding: '40px 0' },
  card: {
    backgroundColor: '#fffefb',
    border: '1px solid #e7e2d6',
    borderRadius: '14px',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '40px',
  },
  eyebrow: {
    fontFamily: SANS,
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#928d80',
    margin: 0,
  },
  clientName: {
    fontFamily: SERIF,
    fontSize: '26px',
    lineHeight: '1.2',
    color: '#2c2a25',
    margin: '8px 0 0',
  },
  period: { fontFamily: SANS, fontSize: '14px', color: '#5c584e', margin: '4px 0 0' },
  rule: { borderColor: '#e7e2d6', margin: '24px 0' },
  greeting: { fontFamily: SANS, fontSize: '15px', lineHeight: '1.6', color: '#5c584e', margin: 0 },
  headline: {
    fontFamily: SERIF,
    fontSize: '20px',
    lineHeight: '1.45',
    color: '#2c2a25',
    margin: '14px 0 0',
  },
  section: { margin: '28px 0 0' },
  sectionTitle: {
    fontFamily: SANS,
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#3c5a48',
    margin: '0 0 10px',
  },
  bulletCell: {
    width: '18px',
    verticalAlign: 'top',
    fontFamily: SERIF,
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#3c5a48',
  },
  itemCell: { verticalAlign: 'top', paddingBottom: '9px' },
  itemText: { fontFamily: SERIF, fontSize: '16px', lineHeight: '1.6', color: '#2c2a25', margin: 0 },
  signoff: { fontFamily: SERIF, fontSize: '16px', color: '#5c584e', margin: '28px 0 0' },
  link: { fontFamily: SANS, fontSize: '14px', fontWeight: 600, color: '#3c5a48', textDecoration: 'none' },
  footer: {
    fontFamily: SANS,
    fontSize: '12px',
    color: '#928d80',
    textAlign: 'center',
    margin: '20px auto 0',
  },
} satisfies Record<string, React.CSSProperties>;

export function ReportEmail({ clientName, periodLabel, draft, shareUrl }: Props) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{draft.headline}</Preview>
      <Body style={s.page}>
        <Container style={s.card}>
          <Text style={s.eyebrow}>Weekly Status</Text>
          <Heading as="h1" style={s.clientName}>
            {clientName}
          </Heading>
          <Text style={s.period}>{periodLabel}</Text>

          <Hr style={s.rule} />

          <Text style={s.greeting}>{draft.greeting}</Text>
          <Text style={s.headline}>{draft.headline}</Text>

          {draft.sections.map((section) => (
            <Section key={section.kind} style={s.section}>
              <Text style={s.sectionTitle}>{SECTION_TITLES[section.kind]}</Text>
              {section.items.map((item) => (
                <Row key={item.text}>
                  <Column style={s.bulletCell}>&bull;</Column>
                  <Column style={s.itemCell}>
                    <Text style={s.itemText}>{item.text}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          ))}

          <Text style={s.signoff}>{draft.signoff}</Text>

          <Hr style={s.rule} />

          <Link href={shareUrl} style={s.link}>
            View this report online &rarr;
          </Link>
        </Container>

        <Text style={s.footer}>Sent via Status Report Autopilot</Text>
      </Body>
    </Html>
  );
}
