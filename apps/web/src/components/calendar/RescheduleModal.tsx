/**
 * RescheduleModal (Feature B2)
 *
 * Shows AI-picked reschedule slots + draft email. Triggered from calendar event cards.
 */
import { useEffect, useState } from "react";
import { aiApi, type RescheduleResponse } from "../../api/client";

interface Props {
  eventId: string;
  onClose: () => void;
  onConfirm?: (slot: { start: string; end: string }) => void;
}

export default function RescheduleModal({ eventId, onClose, onConfirm }: Props) {
  const [data, setData] = useState<RescheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    aiApi
      .suggestReschedule(eventId)
      .then(setData)
      .catch((err) => {
        console.error("Reschedule fetch error:", err);
        setError(err.message ?? "Failed to generate reschedule suggestions");
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleConfirm = () => {
    if (selectedSlot === null || !data) return;
    const slot = data.suggestions[selectedSlot];
    if (onConfirm) onConfirm(slot);
    else alert("Reschedule confirmed! (Integration TBD)");
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">Smart Reschedule</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-3xl">&times;</button>
        </div>

        <div className="p-6">
          {loading && <p className="text-gray-600">Analyzing your calendar...</p>}
          {error && <p className="text-red-600">{error}</p>}
          {data && !data.ai_available && (
            <p className="text-gray-600">{data.hint ?? "AI not available"}</p>
          )}
          {data && data.ai_available && (
            <>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700">Original Event</h3>
                <p className="text-sm text-gray-600">{data.original_event.title}</p>
                <p className="text-xs text-gray-500">{new Date(data.original_event.starts_at).toLocaleString()}</p>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Suggested Times</h3>
                {data.suggestions.length === 0 && (
                  <p className="text-gray-600">{data.hint ?? "No free slots found"}</p>
                )}
                <div className="space-y-2">
                  {data.suggestions.map((slot, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedSlot(idx)}
                      className={`border-2 rounded-lg p-3 cursor-pointer transition ${
                        selectedSlot === idx
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      <p className="font-semibold text-gray-800">{slot.label}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(slot.start).toLocaleString()} – {new Date(slot.end).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {data.draft_email && (
                <div className="mb-6 bg-gray-50 border border-gray-300 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Draft Email</h3>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{data.draft_email}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={selectedSlot === null}
                  className={`px-4 py-2 rounded text-white ${
                    selectedSlot === null
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  Confirm Reschedule
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
