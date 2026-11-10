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
      <div className="absolute inset-0 bg-white/60" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative w-full max-w-md card-float rounded-[26px] shadow-hard-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="feedback-title" className="text-base font-semibold text-ink">
            Share Feedback
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-surface hover:text-ink focus:outline-none "
            aria-label="Close feedback"
          >
            ✕
          </button>
        </div>

        {status === "success" ? (
          <div className="px-4 py-8 text-center">
                        <p className="font-semibold text-ink">Thank you! Feedback received.</p>
            <p className="mt-1 text-sm text-muted">Your input helps improve this tool.</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-ink-2 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            {/* Star rating */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">
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
                        ? "text-grade-d"
                        : "text-line hover:text-ink"
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
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Message <span className="text-grade-f">*</span>
              </label>
              <textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="What's working well? What could be better?"
                className="w-full resize-none rounded-lg border border-[1.5px] border-ink bg-white px-3 py-2 text-sm text-ink placeholder-hint focus:border-ink focus:outline-none focus:ring-0"
                required
              />
              <p className="mt-0.5 text-right text-xs text-muted">
                {message.length}/1000
              </p>
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="fb-email"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                Email{" "}
                <span className="font-normal text-muted">
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
                className="w-full rounded-lg border border-[1.5px] border-ink bg-white px-3 py-2 text-sm text-ink placeholder-hint focus:border-ink focus:outline-none focus:ring-0"
              />
            </div>

            {/* Error */}
            {status === "error" && (
              <p className="text-xs text-grade-f">
                Something went wrong. Please try again.
              </p>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface hover:text-ink transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!message.trim() || status === "loading"}
                className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-bold text-white hover:bg-ink-2 disabled:opacity-50 transition-colors"
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
