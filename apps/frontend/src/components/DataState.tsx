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
      <div className="flex items-center justify-center py-16 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <span className="material-symbols-outlined text-error text-3xl">error</span>
        <p className="text-sm text-error">{error}</p>
      </div>
    );
  }

  if (!show && empty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-3xl">inbox</span>
        <p className="text-sm">{empty}</p>
      </div>
    );
  }

  return <>{children}</>;
}
