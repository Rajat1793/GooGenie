import { Icon } from "../components/Icon";
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
        <Icon name="progress_activity" className="animate-spin text-3xl text-primary/60" />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (error) {
    const isFeatureDisabled = error.toLowerCase().includes("disabled") || error.toLowerCase().includes("feature");
    return (
      <div className="glass-panel rounded-2xl flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
          <Icon name={isFeatureDisabled ? "lock" : "error"} className="text-error text-xl" />
        </div>
        <p className="text-sm font-medium text-error">{error}</p>
        {isFeatureDisabled && (
          <p className="text-xs text-on-surface-variant text-center max-w-xs">
            Ask your admin to enable this feature for your account, or connect your account via Settings.
          </p>
        )}
      </div>
    );
  }

  if (!show && empty) {
    return (
      <div className="empty-state glass-panel rounded-2xl">
        <Icon name="inbox" className="text-3xl" />
        <p className="text-sm">{empty}</p>
      </div>
    );
  }

  return <>{children}</>;
}
