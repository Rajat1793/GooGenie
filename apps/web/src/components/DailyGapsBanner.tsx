/**
 * DailyGapsBanner (Feature B5)
 *
 * Shows at the top of the inbox or calendar when there are 90+ min gaps today.
 * Suggests tackling "reply-needed" inbox during free time.
 */
import { useEffect, useState } from "react";
import { aiApi } from "../api/client";
import { useRouter } from "next/navigation";

export default function DailyGapsBanner() {
  const router = useRouter();
  const [data, setData] = useState<{
    gaps: Array<{ start: string; end: string; durationMinutes: number }>;
    reply_needed_count: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    aiApi
      .dailyGaps()
      .then(setData)
      .catch((err) => console.error("Daily gaps fetch error:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data || data.gaps.length === 0 || data.reply_needed_count === 0 || dismissed) {
    return null;
  }

  const firstGap = data.gaps[0];
  const gapStart = new Date(firstGap.start);
  const gapLabel = gapStart.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-300 rounded-lg p-4 mb-4 shadow">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-6 w-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-semibold text-blue-800">You have {data.gaps.length} free block{data.gaps.length > 1 ? "s" : ""} today</h3>
          <p className="text-sm text-blue-700 mt-1">
            {firstGap.durationMinutes} min gap starting at {gapLabel} — perfect for tackling {data.reply_needed_count} emails awaiting replies!
          </p>
          <div className="flex space-x-2 mt-3">
            <button
              onClick={() => router.push("/inbox?filter=reply_needed")}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded"
            >
              Tackle {data.reply_needed_count} replies
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 text-sm px-4 py-2 rounded"
            >
              Maybe later
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-4 text-gray-500 hover:text-gray-700 text-2xl"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
