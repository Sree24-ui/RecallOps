import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'RecallOps — Evidence before resale',
  description:
    'Official US recall notices and evidence-backed investigations for your electronics inventory.',
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
