import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Try the PullUp mobile app' },
  description:
    'Open the PullUp rider and driver app on your phone with Expo Go. No app store needed.',
  openGraph: {
    title: 'Try the PullUp mobile app',
    description: 'Open the PullUp rider and driver app on your phone with Expo Go. No app store needed.',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
