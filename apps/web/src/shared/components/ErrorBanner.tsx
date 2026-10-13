export function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="error-banner" role="alert">
      {error}
    </div>
  );
}
