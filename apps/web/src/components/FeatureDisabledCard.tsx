"use client";

/**
 * FeatureDisabledCard — shown when a user navigates to a page whose
 * required feature is disabled. Links to Profile to request access.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../components/Icon";

interface Props {
  featureKey: string;
  title: string;
  description: string;
  icon: string;
}

export function FeatureDisabledCard({ featureKey, title, description, icon }: Props) {
  const label = featureKey.replace(/_/g, " ");
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-8">
      <div className="relative">
        <Icon name={icon} className="text-7xl" style={{ color: "var(--c-outline-variant)", opacity: 0.5 }} />
        <Icon name="lock" className="text-3xl absolute -bottom-1 -right-1" style={{ color: "var(--c-outline)" }} />
      </div>
      <div>
        <h2 className="font-headline text-2xl mb-2" style={{ color: "var(--c-on-surface)" }}>
          {title}
        </h2>
        <p className="text-sm max-w-sm" style={{ color: "var(--c-on-surface-variant)" }}>
          {description}
        </p>
        <p className="text-xs mt-2" style={{ color: "var(--c-outline)" }}>
          Feature required: <span className="font-semibold capitalize">{label}</span>
        </p>
      </div>
      <Link href="/profile"
        className="btn-primary"
      >
        <Icon name="request_quote" className="text-base" />
        Request Access
      </Link>
    </div>
  );
}
