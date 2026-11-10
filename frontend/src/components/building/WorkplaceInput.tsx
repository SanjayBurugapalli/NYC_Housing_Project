"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { autocompleteAddress } from "@/lib/api";
import type { Workplace } from "@/types/building";

/**
 * Work-address field with NYC GeoSearch type-ahead. Picking a suggestion (or
 * submitting, which takes the top match) hands a geocoded Workplace to
 * `onSelect`.
 *
 * variant "field"  — standalone bordered input + Go button (building card)
 * variant "inline" — borderless input for a parent that draws the frame
 */
export function WorkplaceInput({
  id,
  onSelect,
  defaultValue = "",
  placeholder = "Address or station",
  variant = "field",
  autoFocus = false,
}: {
  id: string;
  onSelect: (workplace: Workplace) => void;
  defaultValue?: string;
  placeholder?: string;
  variant?: "field" | "inline";
  autoFocus?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(defaultValue);
  const [options, setOptions] = useState<Workplace[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    setText(defaultValue);
    dirty.current = false;
  }, [defaultValue]);

  // Debounced type-ahead; only after the user has typed (not for the saved value).
  useEffect(() => {
    const q = text.trim();
    if (!dirty.current || q.length < 3) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      autocompleteAddress(q, controller.signal)
        .then((opts) => {
          setOptions(opts);
          setActive(-1);
          setOpen(opts.length > 0);
        })
        .catch(() => {
          // aborted or offline — leave the field usable
        });
    }, 220);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [text]);

  const choose = (opt: Workplace) => {
    setText(opt.label);
    dirty.current = false;
    setOpen(false);
    setOptions([]);
    setError(null);
    onSelect(opt);
  };

  const submit = async () => {
    if (active >= 0 && options[active]) return choose(options[active]);
    if (options[0]) return choose(options[0]);
    const q = text.trim();
    if (q.length < 3) {
      setError("Type a street address, a landmark or a station.");
      return;
    }
    setBusy(true);
    try {
      const opts = await autocompleteAddress(q);
      if (opts[0]) choose(opts[0]);
      else setError("We couldn't find that in NYC. Try a street address.");
    } catch {
      setError("Address lookup is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const input = (
    <input
      id={id}
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      value={text}
      autoFocus={autoFocus}
      autoComplete="off"
      placeholder={placeholder}
      onChange={(e) => {
        dirty.current = true;
        setText(e.target.value);
        setError(null);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => setTimeout(() => setOpen(false), 120)}
      onFocus={() => options.length && setOpen(true)}
      className={
        variant === "field"
          ? "h-[46px] min-w-0 flex-1 rounded-xl border-2 border-ink bg-white px-3 text-sm font-medium text-ink focus:border-ink focus:ring-0"
          : "h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-semibold text-ink focus:ring-0"
      }
    />
  );

  return (
    <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 gap-1.5">
        {input}
        {variant === "field" && (
          <button type="button" onClick={submit} disabled={busy} className="btn-ink h-[46px] px-3.5">
            {busy ? "…" : "Go"}
          </button>
        )}
      </div>
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="card-float absolute left-0 right-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-2xl p-1 shadow-hard-sm"
        >
          {options.map((opt, i) => (
            <li
              key={`${opt.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(opt);
              }}
              className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium ${i === active ? "bg-surface" : "hover:bg-surface"}`}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs font-semibold text-grade-f" role="alert">{error}</p>}
    </div>
  );
}
