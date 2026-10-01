import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Try the PullUp mobile app' },
  description:
    'See the PullUp rider and driver app, and try it when a public version is available.',
  openGraph: {
    title: 'Try the PullUp mobile app',
    description: 'See the PullUp rider and driver app, and try it when a public version is available.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
