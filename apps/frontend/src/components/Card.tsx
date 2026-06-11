import type { ReactNode } from "react";

interface Props {
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}

export function Card({ header, children, className = "", padded = true }: Props) {
  return (
    <div className={`glass-panel rounded-2xl overflow-hidden ${className}`}>
      {header && (
        <div className="px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
          {header}
        </div>
      )}
      <div className={padded ? "p-6" : ""}>{children}</div>
    </div>
  );
}
