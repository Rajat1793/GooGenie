/**
 * SenderProfilePanel (Feature A1)
 *
 * Shows sender intelligence: response times, awaiting-reply count, recent threads.
 * Triggered by clicking a sender's name/email in a thread.
 */
import { useEffect, useState } from "react";
import { aiApi, type SenderStats } from "../api/client";
import { useRouter } from "next/navigation";

interface Props {
  email: string;
  onClose: () => void;
}

export default function SenderProfilePanel({ email, onClose }: Props) {
  const router = useRouter();
  const [stats, setStats] = useState<SenderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    aiApi
      .senderInsights(email)
      .then((data) => setStats(data.stats))
      .catch((err) => {
        console.error("Sender insights fetch error:", err);
        setError(err.message ?? "Failed to load sender insights");
      })
      .finally(() => setLoading(false));
  }, [email]);

  if (loading) {
    return (
      <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-lg w-96 max-h-[600px] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Sender Intelligence</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="border border-red-300 rounded-lg p-6 bg-white shadow-lg w-96">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-red-600">Error</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>
        <p className="text-red-600">{error ?? "No data found"}</p>
      </div>
    );
  }

  const formatHours = (h: number | null) => {
    if (h === null) return "—";
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 24) return `${Math.round(h * 10) / 10} hr`;
    return `${Math.round(h / 24 * 10) / 10} days`;
  };

  return (
    <div className="border border-gray-300 rounded-lg p-6 bg-white shadow-lg w-96 max-h-[600px] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Sender Intelligence</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500">Sender</p>
        <p className="font-semibold text-gray-800">{stats.displayName}</p>
        <p className="text-xs text-gray-600">{stats.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-50 p-3 rounded">
          <p className="text-xs text-gray-600">Total threads</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalThreads}</p>
        </div>
        <div className="bg-yellow-50 p-3 rounded">
          <p className="text-xs text-gray-600">Awaiting reply</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.awaitingMyReply}</p>
        </div>
        <div className="bg-green-50 p-3 rounded">
          <p className="text-xs text-gray-600">My avg response</p>
          <p className="text-lg font-bold text-green-600">{formatHours(stats.avgMyResponseHours)}</p>
        </div>
        <div className="bg-purple-50 p-3 rounded">
          <p className="text-xs text-gray-600">Their avg response</p>
          <p className="text-lg font-bold text-purple-600">{formatHours(stats.avgTheirResponseHours)}</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-500">Last contact</p>
        <p className="text-sm text-gray-800">
          {stats.lastContactDate ? new Date(stats.lastContactDate).toLocaleString() : "Never"}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent threads</h3>
        <div className="space-y-2">
          {stats.recentThreads.map((t) => (
            <div
              key={t.threadId}
              onClick={() => router.push(`/inbox?thread=${t.threadId}`)}
              className="border border-gray-200 rounded p-2 hover:bg-gray-50 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${t.direction === "inbound" ? "text-blue-600" : "text-green-600"}`}>
                  {t.direction === "inbound" ? "↓ Inbound" : "↑ Outbound"}
                </span>
                <span className="text-xs text-gray-500">{new Date(t.date).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-gray-800 truncate mt-1">{t.subject}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
