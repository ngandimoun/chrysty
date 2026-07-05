'use client';

import { ThemeProvider } from 'next-themes';

import { AstraSessionBootstrap } from '@/components/astra/astra-session-bootstrap';
import { AuthGuard } from '@/components/auth/auth-guard';
import { SessionBootstrap } from '@/components/auth/session-bootstrap';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionBootstrap />
      <AuthGuard>
        <AstraSessionBootstrap />
        {children}
      </AuthGuard>
    </ThemeProvider>
  );
}
