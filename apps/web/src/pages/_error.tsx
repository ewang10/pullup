/**
 * Custom error page for the Pages Router fallback.
 * Prevents Next.js from auto-generating an _error page that may
 * encounter React version conflicts during static prerendering.
 */
function ErrorPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Error</h1>
        <p style={{ color: '#6b7280' }}>An unexpected error occurred.</p>
      </div>
    </div>
  );
}

ErrorPage.getInitialProps = () => {
  return {};
};

export default ErrorPage;
