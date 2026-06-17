/**
 * FollowUpCard (Feature B4)
 *
 * Shows sent emails awaiting replies. Surfaces on profile page or as a notification.
 * One-click to draft a nudge email.
 */
import { useEffect, useState } from "react";
import { aiApi, type FollowUpRecord } from "../api/client";
import { useRouter } from "next/navigation";

export default function FollowUpCard() {
  const router = useRouter();
  const [followUps, setFollowUps] = useState<FollowUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aiApi
      .followUps()
      .then((data) => setFollowUps(data.follow_ups))
      .catch((err) => {
        console.error("Follow-ups fetch error:", err);
        setError(err.message ?? "Failed to load follow-ups");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-white shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Follow-ups Needed</h3>
        <p className="text-xs text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-300 rounded-lg p-4 bg-white shadow">
        <h3 className="text-sm font-semibold text-red-600 mb-2">Error</h3>
        <p className="text-xs text-red-600">{error}</p>
      </div>
    );
  }

  if (followUps.length === 0) {
    return (
      <div className="border border-gray-300 rounded-lg p-4 bg-white shadow">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Follow-ups</h3>
        <p className="text-xs text-gray-600">All caught up! No pending follow-ups.</p>
      </div>
    );
  }

  return (
    <div className="border border-yellow-300 rounded-lg p-4 bg-yellow-50 shadow">
      <h3 className="text-sm font-semibold text-yellow-800 mb-3">
        {followUps.length} Follow-up{followUps.length > 1 ? "s" : ""} Needed
      </h3>
      <div className="space-y-2">
        {followUps.map((f) => {
          const daysAgo = Math.floor((Date.now() - new Date(f.sentAt).getTime()) / (1000 * 3600 * 24));
          return (
            <div
              key={f.id}
              onClick={() => router.push(`/inbox?thread=${f.threadId}`)}
              className="bg-white border border-yellow-200 rounded p-3 cursor-pointer hover:border-yellow-400"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-800">{f.to}</p>
                <span className="text-xs text-yellow-600 font-bold">{daysAgo}d ago</span>
              </div>
              <p className="text-xs text-gray-600 truncate">{f.subject}</p>
              <p className="text-xs text-gray-500 mt-1">
                Sent {new Date(f.sentAt).toLocaleDateString()} • No reply yet
              </p>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => router.push("/inbox?filter=reply_needed")}
        className="mt-3 w-full bg-yellow-600 hover:bg-yellow-700 text-white text-sm px-4 py-2 rounded"
      >
        Draft nudge emails
      </button>
    </div>
  );
}
