/**
 * The report as a PDF, attached to the approval email and downloadable from
 * the public `/r/[token]` page.
 *
 * Built with `@react-pdf/renderer` (its own renderer, not the DOM / email one).
 * Uses the built-in Times / Helvetica families to keep the editorial serif
 * voice with zero bundled font files.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { ClientReport } from '@/lib/dashboard/types';
import { SECTION_TITLES, type StatusReportDraft } from '@/lib/reports/types';

interface Props {
  clientName: string;
  periodLabel: string;
  draft: StatusReportDraft;
  sentAt: string | null;
}

const COLOR = {
  ink: '#2c2a25',
  inkSoft: '#5c584e',
  inkFaint: '#928d80',
  line: '#e7e2d6',
  pine: '#3c5a48',
  paper: '#fffefb',
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR.paper,
    color: COLOR.ink,
    paddingVertical: 58,
    paddingHorizontal: 56,
    fontFamily: 'Times-Roman',
  },
  eyebrow: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLOR.inkFaint,
  },
  clientName: { fontFamily: 'Times-Roman', fontSize: 24, color: COLOR.ink, marginTop: 8 },
  period: { fontFamily: 'Helvetica', fontSize: 10.5, color: COLOR.inkSoft, marginTop: 5 },
  rule: { borderBottomWidth: 1, borderBottomColor: COLOR.line, marginVertical: 18 },
  greeting: { fontFamily: 'Helvetica', fontSize: 10.5, color: COLOR.inkSoft, lineHeight: 1.5 },
  headline: {
    fontFamily: 'Times-Roman',
    fontSize: 15,
    color: COLOR.ink,
    lineHeight: 1.4,
    marginTop: 10,
  },
  section: { marginTop: 20 },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: COLOR.pine,
    marginBottom: 9,
  },
  item: { flexDirection: 'row', marginBottom: 7 },
  bullet: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLOR.pine,
    marginTop: 6,
    marginRight: 9,
  },
  itemText: { flex: 1, fontFamily: 'Times-Roman', fontSize: 11, color: COLOR.ink, lineHeight: 1.5 },
  signoff: { fontFamily: 'Times-Roman', fontSize: 11, color: COLOR.inkSoft, marginTop: 22 },
  footer: {
    position: 'absolute',
    bottom: 34,
    left: 56,
    right: 56,
    textAlign: 'center',
    fontFamily: 'Helvetica',
    fontSize: 8,
    letterSpacing: 0.3,
    color: COLOR.inkFaint,
  },
});

function formatSentDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ReportPdf({ clientName, periodLabel, draft, sentAt }: Props) {
  return (
    <Document title={`Weekly status, ${clientName}`} author="Status Report Autopilot">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.eyebrow}>Weekly Status</Text>
        <Text style={styles.clientName}>{clientName}</Text>
        <Text style={styles.period}>{periodLabel}</Text>

        <View style={styles.rule} />

        <Text style={styles.greeting}>{draft.greeting}</Text>
        <Text style={styles.headline}>{draft.headline}</Text>

        {draft.sections.map((section) => (
          <View key={section.kind} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{SECTION_TITLES[section.kind]}</Text>
            {section.items.map((item) => (
              <View key={item.text} style={styles.item}>
                <View style={styles.bullet} />
                <Text style={styles.itemText}>{item.text}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.signoff}>{draft.signoff}</Text>

        <Text style={styles.footer} fixed>
          {sentAt ? `Sent ${formatSentDate(sentAt)}  ·  ` : ''}Status Report Autopilot
        </Text>
      </Page>
    </Document>
  );
}

/** Renders an approved report to a PDF buffer. */
export async function renderReportPdf(report: ClientReport): Promise<Buffer> {
  if (!report.draft) {
    throw new Error('Cannot render a PDF for a report with no draft.');
  }
  return renderToBuffer(
    ReportPdf({
      clientName: report.clientName,
      periodLabel: report.periodLabel,
      draft: report.draft,
      sentAt: report.sentAt,
    }),
  );
}
