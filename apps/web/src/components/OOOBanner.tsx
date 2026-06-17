/**
 * OOOBanner (Feature A5)
 *
 * Shows when composing a reply to a sender who sent an OOO auto-reply.
 * One-click button to schedule a follow-up reminder in calendar.
 */
import { useEffect, useState } from "react";
import { aiApi } from "../api/client";

interface Props {
  senderEmail: string;
  onScheduleFollowUp?: (returnDate: string | null) => void;
}

export default function OOOBanner({ senderEmail, onScheduleFollowUp }: Props) {
  const [ooo, setOoo] = useState<{ isOOO: boolean; returnDate: string | null; autoReplySnippet: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    aiApi
      .checkOOO(senderEmail)
      .then(setOoo)
      .catch((err) => {
        console.error("OOO check error:", err);
        setOoo(null);
      })
      .finally(() => setLoading(false));
  }, [senderEmail]);

  if (loading || !ooo || !ooo.isOOO) return null;

  const handleScheduleFollowUp = () => {
    if (onScheduleFollowUp) {
      onScheduleFollowUp(ooo.returnDate);
    } else {
      // Default: alert user to manually schedule (calendar API integration TBD).
      alert(`Sender is OOO. ${ooo.returnDate ? `Returns ${ooo.returnDate}.` : ""} Consider scheduling a follow-up.`);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-semibold text-yellow-800">Sender is out of office</h3>
          {ooo.returnDate && (
            <p className="text-sm text-yellow-700 mt-1">Expected return: {ooo.returnDate}</p>
          )}
          {ooo.autoReplySnippet && (
            <p className="text-xs text-yellow-600 mt-2 italic">&ldquo;{ooo.autoReplySnippet}&rdquo;</p>
          )}
          <button
            onClick={handleScheduleFollowUp}
            className="mt-3 bg-yellow-600 hover:bg-yellow-700 text-white text-sm px-4 py-2 rounded"
          >
            Schedule follow-up reminder
          </button>
        </div>
      </div>
    </div>
  );
}
