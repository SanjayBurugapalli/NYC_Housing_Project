"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitFeedback } from "@/lib/api";

type Status = "idle" | "loading" | "success" | "error";

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("loading");
    try {
      await submitFeedback({
        message: message.trim(),
        rating: rating ?? null,
        email: email.trim() || null,
        page_context: "map",
      });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h2 id="feedback-title" className="text-base font-semibold text-white">
            Share Feedback
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close feedback"
          >
            ✕
          </button>
        </div>

        {status === "success" ? (
          <div className="px-4 py-8 text-center">
            <p className="text-2xl mb-2">🙏</p>
            <p className="font-semibold text-white">Thank you! Feedback received.</p>
            <p className="mt-1 text-sm text-gray-400">Your input helps improve this tool.</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            {/* Star rating */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-400">
                Overall rating (optional)
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                    onClick={() => setRating(rating === n ? null : n)}
                    className={`text-2xl leading-none transition-colors ${
                      rating != null && n <= rating
                        ? "text-yellow-400"
                        : "text-gray-600 hover:text-yellow-300"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="fb-message"
                className="mb-1.5 block text-xs font-medium text-gray-400"
              >
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="What's working well? What could be better?"
                className="w-full resize-none rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
              <p className="mt-0.5 text-right text-xs text-gray-500">
                {message.length}/1000
              </p>
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="fb-email"
                className="mb-1.5 block text-xs font-medium text-gray-400"
              >
                Email{" "}
                <span className="font-normal text-gray-500">
                  (optional — only if you want a reply)
                </span>
              </label>
              <input
                id="fb-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Error */}
            {status === "error" && (
              <p className="text-xs text-red-400">
                Something went wrong. Please try again.
              </p>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!message.trim() || status === "loading"}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {status === "loading" && (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {status === "loading" ? "Sending…" : "Send Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
