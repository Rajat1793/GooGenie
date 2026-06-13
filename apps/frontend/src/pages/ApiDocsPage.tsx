export function ApiDocsPage() {
  const backendUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

  return (
    <div className="-mx-8 -my-8 h-[calc(100vh-56px)] flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-6 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--c-outline-variant)", background: "var(--c-surface-container-low)" }}>
        <span className="material-symbols-outlined text-base" style={{ color: "var(--c-primary)", fontVariationSettings: "FILL 1" }}>api</span>
        <h2 className="font-headline text-lg" style={{ color: "var(--c-on-surface)" }}>API Documentation</h2>
        <span className="badge badge-primary ml-1">v1</span>
        <div className="flex-1" />
        <a href={`${backendUrl}/api-docs/openapi.json`} target="_blank" rel="noopener noreferrer"
          className="btn-secondary py-1.5 px-3 text-xs gap-1.5">
          <span className="material-symbols-outlined text-sm">download</span>
          OpenAPI JSON
        </a>
        <a href={`${backendUrl}/api-docs`} target="_blank" rel="noopener noreferrer"
          className="btn-ghost py-1.5 px-3 text-xs gap-1.5">
          <span className="material-symbols-outlined text-sm">open_in_new</span>
          Open in tab
        </a>
      </div>

      {/* Swagger UI iframe */}
      <iframe
        src={`${backendUrl}/api-docs`}
        className="flex-1 w-full border-0"
        title="GooGenie API Docs"
      />
    </div>
  );
}
