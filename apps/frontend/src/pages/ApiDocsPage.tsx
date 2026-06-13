import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { useEffect, useState } from "react";

export function ApiDocsPage() {
  const backendUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
  const specUrl = `${backendUrl}/api-docs/openapi.json`;
  const [specError, setSpecError] = useState(false);

  useEffect(() => { setSpecError(false); }, [specUrl]);

  return (
    <div className="-mx-8 -my-8 flex flex-col" style={{ minHeight: "calc(100vh - 56px)" }}>
      {/* Header bar */}
      <div className="flex items-center gap-3 px-6 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--c-outline-variant)", background: "var(--c-surface-container-low)" }}>
        <span className="material-symbols-outlined text-base" style={{ color: "var(--c-primary)", fontVariationSettings: "FILL 1" }}>api</span>
        <h2 className="font-headline text-lg" style={{ color: "var(--c-on-surface)" }}>API Documentation</h2>
        <span className="badge badge-primary ml-1">v1</span>
        <div className="flex-1" />
        <a href={specUrl} target="_blank" rel="noopener noreferrer"
          className="btn-secondary py-1.5 px-3 text-xs gap-1.5">
          <span className="material-symbols-outlined text-sm">download</span>
          OpenAPI JSON
        </a>
      </div>

      {/* Swagger UI rendered inline */}
      {specError ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16"
          style={{ color: "var(--c-on-surface-variant)" }}>
          <span className="material-symbols-outlined text-4xl" style={{ color: "var(--c-error)" }}>cloud_off</span>
          <p className="text-sm">Could not load API spec from <code className="text-xs">{specUrl}</code></p>
          <p className="text-xs">Make sure the backend is running and <code>VITE_API_URL</code> is set.</p>
        </div>
      ) : (
        <div className="swagger-wrapper flex-1 overflow-auto">
          <SwaggerUI
            url={specUrl}
            docExpansion="list"
            defaultModelsExpandDepth={-1}
            onComplete={() => setSpecError(false)}
          />
        </div>
      )}
    </div>
  );
}
