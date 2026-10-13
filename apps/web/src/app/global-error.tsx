'use client';

// Last-resort boundary for errors thrown in the root layout. Must render its own
// <html>/<body> and cannot rely on globals.css, so styles are inline.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0A0C14',
          color: '#F8FAFC',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: 16,
        }}
      >
        <main role="alert" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 8px' }}>AuraFit hit a critical error</h1>
          <p style={{ color: '#A3B0C2', margin: '0 0 24px' }}>
            Please try again. {error.digest ? `Reference: ${error.digest}` : null}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: 44,
              padding: '0 24px',
              borderRadius: 9999,
              border: 0,
              background: '#7C3AED',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
