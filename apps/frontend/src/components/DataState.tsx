interface Props {
  loading?: boolean;
  error?: string | null;
  empty?: string;
  show?: boolean;
  children: React.ReactNode;
}

export function DataState({ loading, error, empty, show = true, children }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary/60">progress_activity</span>
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel rounded-2xl flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
          <span className="material-symbols-outlined text-error text-xl">error</span>
        </div>
        <p className="text-sm font-medium text-error">{error}</p>
        <p className="text-xs text-on-surface-variant">Check that the backend is running on port 4000</p>
      </div>
    );
  }

  if (!show && empty) {
    return (
      <div className="empty-state glass-panel rounded-2xl">
        <span className="material-symbols-outlined text-3xl">inbox</span>
        <p className="text-sm">{empty}</p>
      </div>
    );
  }

  return <>{children}</>;
}
