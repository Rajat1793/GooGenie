"use client";

/**
 * Standalone Snippets page. Hosts the existing <SnippetsPanel/> on its own
 * route so the Profile page can stay focused on identity + access info.
 */
import { PageHeader } from "../components/PageHeader";
import { SnippetsPanel } from "../components/SnippetsPanel";
import { useFeatures } from "../contexts/FeatureContext";
import { FeatureDisabledCard } from "../components/FeatureDisabledCard";

export function SnippetsPage() {
  const { hasFeature } = useFeatures();
  return (
    <div>
      <PageHeader
        title="Snippets"
        subtitle="Reusable email shortcuts — type ;hotkey then Tab in Compose to expand."
      />
      {hasFeature("snippets") ? (
        <SnippetsPanel />
      ) : (
        <FeatureDisabledCard
          featureKey="snippets"
          title="Snippets"
          description="Save reusable text snippets and expand them with a hotkey while composing."
          icon="code_blocks"
        />
      )}
    </div>
  );
}
