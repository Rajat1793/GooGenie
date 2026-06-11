import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="page-header border-b border-outline-variant/20 mb-7">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 mt-1">{action}</div>}
    </div>
  );
}
