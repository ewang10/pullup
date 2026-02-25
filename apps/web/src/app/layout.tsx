/**
 * Root layout for the PullUp web application.
 * Configures global fonts, metadata, and provides the base HTML structure
 * with WCAG-compliant skip navigation for keyboard accessibility.
 */
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'PullUp - Venue Dashboard',
  description: 'Manage your venue deals, view analytics, and handle billing with PullUp.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} min-h-screen`}>
        <a href="#main-content" className="skip-nav">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
