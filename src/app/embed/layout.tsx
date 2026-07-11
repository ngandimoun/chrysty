import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chrysty Live',
  description: 'Embedded Chrysty Live companion',
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
