/**
 * RelatedThreadsSidebar (Feature A3)
 *
 * Shows semantically-related past threads (same sender or same topic).
 * Embedded in ThreadPane or as a collapsible card.
 */
import { useEffect, useState } from "react";
import { aiApi, type RelatedThreadsResponse } from "../api/client";
import { useRouter } from "next/navigation";

interface Props {
  threadId: string;
  scope: "same_sender" | "same_topic";
  onClose?: () => void;
}

export default function RelatedThreadsSidebar({ threadId, scope, onClose }: Props) {
  const router = useRouter();
  const [data, setData] = useState<RelatedThreadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    aiApi
      .searchRelated({ thread_id: threadId, scope, limit: 8 })
      .then(setData)
      .catch((err) => {
        console.error("Related threads fetch error:", err);
        setError(err.message ?? "Failed to load related threads");
      })
      .finally(() => setLoading(false));
  }, [threadId, scope]);

  if (loading) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-white shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          {scope === "same_sender" ? "Same Sender" : "Similar Topics"}
        </h3>
        <p className="text-xs text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error || !data || !data.ai_available) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-white shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Related Conversations</h3>
        <p className="text-xs text-gray-600">{error ?? data?.hint ?? "Embeddings not available"}</p>
      </div>
    );
  }

  if (data.related_threads.length === 0) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-white shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Related Conversations</h3>
        <p className="text-xs text-gray-600">No related threads found.</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white shadow max-h-[500px] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {scope === "same_sender" ? "Same Sender" : "Similar Topics"}
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        )}
      </div>
      <div className="space-y-2">
        {data.related_threads.map((t) => (
          <div
            key={t.thread_id}
            onClick={() => router.push(`/inbox?thread=${t.thread_id}`)}
            className="border border-gray-200 rounded p-2 hover:bg-gray-50 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-blue-600 truncate flex-1">{t.from}</p>
              <span className="text-xs text-gray-500 ml-2">{Math.round((t.similarity ?? 0) * 100)}%</span>
            </div>
            <p className="text-sm text-gray-800 font-medium truncate">{t.subject}</p>
            <p className="text-xs text-gray-600 line-clamp-2 mt-1">{t.snippet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
