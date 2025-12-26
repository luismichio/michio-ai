import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Michio | Man on a Journey',
  description: 'A journal for the wandering soul.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
