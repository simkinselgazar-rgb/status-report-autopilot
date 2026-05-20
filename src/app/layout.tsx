import type { Metadata } from 'next';
import { Hanken_Grotesk, Literata } from 'next/font/google';
import './globals.css';

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin'],
  variable: '--font-literata',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Status Report Autopilot',
  description:
    'Weekly client status reports drafted by AI, approved by you, sent in 30 minutes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${hanken.variable} ${literata.variable}`}>
      <body>{children}</body>
    </html>
  );
}
