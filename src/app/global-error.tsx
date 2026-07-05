'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" translate="no" className="notranslate h-full">
      <body className="notranslate flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center font-sans text-foreground">
        <h1 className="text-xl font-semibold">Application error</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Chrysty hit an unexpected error. If your browser is translating this page,
          turn off auto-translate and reload — translation can break the app.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">Error ID: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
