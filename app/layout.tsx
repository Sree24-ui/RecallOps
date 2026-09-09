import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'RecallOps — Evidence before resale',
  description:
    'An autonomous product-safety agent that prevents recalled products from being resold. Evidence-backed recall investigations for electronics inventory.',
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
