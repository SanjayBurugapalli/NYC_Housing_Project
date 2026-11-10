"use client";

import { useState, type ComponentType, type RefObject } from "react";
import { useStore } from "@/lib/store";
import { GRADE_META, scoreToGrade, titleCase, toGrade } from "@/lib/grades";
import type { BuildingDetail, ScoreBreakdown } from "@/types/building";
import { GradeTile } from "@/components/ui/GradeTile";
import {
  BugIcon,
  BuildingIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  CloseIcon,
  FlameIcon,
  ScaleIcon,
  SpeakerIcon,
  type IconProps,
} from "@/components/ui/icons";

// --- Sub-scores ---

const isOpen = (status: string | null | undefined) => !!status && !/close|dismiss|resolv|complied/i.test(status);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function monthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface SubScore {
  key: keyof ScoreBreakdown;
  label: string;
  Icon: ComponentType<IconProps>;
  score: number;
  note: string;
}

function subScores(d: BuildingDetail): SubScore[] {
  const sb = d.score_breakdown;
  const hpdOpen = d.violations.filter((v) => v.source === "HPD" && isOpen(v.status));
  const openC = hpdOpen.filter((v) => v.severity === "C").length;
  const openB = hpdOpen.filter((v) => v.severity === "B").length;
  const openCases = d.litigations.filter((l) => isOpen(l.status)).length;
  const latestRodent = d.rodent_inspections[0];
  const rodentFailed = latestRodent && /active|fail/i.test(latestRodent.result ?? "");

  const none = "Nothing on record";
  return [
    {
      key: "heat_hot_water",
      label: "Heat & hot water",
      Icon: FlameIcon,
      score: sb.heat_hot_water,
      note: sb.heat_hot_water_count ? `${plural(sb.heat_hot_water_count, "complaint")} in 5 years` : none,
    },
    {
      key: "hpd_severity",
      label: "Housing code violations",
      Icon: ClipboardIcon,
      score: sb.hpd_severity,
      note:
        openC || openB
          ? [openC ? `${openC} open Class C` : null, openB ? `${openB} Class B` : null].filter(Boolean).join(", ")
          : sb.hpd_severity_count
            ? `${plural(sb.hpd_severity_count, "violation")}, none open`
            : none,
    },
    {
      key: "litigation",
      label: "Lawsuits",
      Icon: ScaleIcon,
      score: sb.litigation,
      note: openCases
        ? `${plural(openCases, "active HPD case")}`
        : d.litigation_count
          ? `${plural(d.litigation_count, "past case")}`
          : none,
    },
    {
      key: "pest_rodent",
      label: "Pests & rodents",
      Icon: BugIcon,
      score: sb.pest_rodent,
      note: rodentFailed
        ? `Failed inspection, ${monthYear(latestRodent.date)}`
        : sb.pest_rodent_count
          ? `${plural(sb.pest_rodent_count, "report")} in 5 years`
          : none,
    },
    {
      key: "structural_safety",
      label: "Structural & safety",
      Icon: BuildingIcon,
      score: sb.structural_safety,
      note: sb.structural_safety_count ? `${plural(sb.structural_safety_count, "DOB violation")}` : none,
    },
    {
      key: "noise",
      label: "Noise",
      Icon: SpeakerIcon,
      score: sb.noise,
      note: sb.noise_count ? `${plural(sb.noise_count, "complaint")} in 5 years` : none,
    },
  ].sort((a, b) => a.score - b.score) as SubScore[];
}

function SubScoreRow({ s, last }: { s: SubScore; last: boolean }) {
  const g = scoreToGrade(s.score);
  const pct = Math.max(0, Math.min(100, s.score));
  return (
    <div className={`flex items-center gap-3 border-t-[1.5px] border-line py-2.5 ${last ? "border-b-[1.5px]" : ""}`}>
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border-2 border-ink">
        <s.Icon size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-sm font-bold">{s.label}</span>
          <span className="text-xs text-muted">{s.note}</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border-[1.5px] border-ink">
          <div
            className="h-full"
            style={{ width: `${pct}%`, background: GRADE_META[g].bg, borderRight: pct < 100 ? "1.5px solid #12141A" : undefined }}
          />
        </div>
      </div>
      <span className="w-[34px] shrink-0 text-right font-display text-xl font-extrabold">{Math.round(s.score)}</span>
      <GradeTile grade={g} size="xs" label={`Sub-grade ${g}`} />
    </div>
  );
}

// --- Paper trail ---

interface TrailRow {
  id: string;
  date: string | null;
  title: string;
  meta: string;
  status: "Open" | "Closed" | string | null;
}

function dateCell(iso: string | null): [string, string] {
  if (!iso) return ["—", ""];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [iso, ""];
  return [d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), String(d.getFullYear())];
}

function clip(s: string | null | undefined, n = 110): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function sentence(s: string | null | undefined): string {
  const t = clip(s);
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
}

function trails(d: BuildingDetail): { key: string; label: string; noun: string; rows: TrailRow[] }[] {
  const tabs = [
    {
      key: "complaints",
      label: "Complaints",
      noun: "complaints",
      rows: d.complaints.map((c) => ({
        id: c.id,
        date: c.date,
        title: sentence(c.descriptor ? `${c.type}, ${c.descriptor}` : c.type) || "Complaint",
        meta: [c.source, c.status ? titleCase(c.status) : null].filter(Boolean).join(" · "),
        status: c.closed_date || !isOpen(c.status) ? "Closed" : "Open",
      })),
    },
    {
      key: "violations",
      label: "Violations",
      noun: "violations",
      rows: d.violations.map((v) => ({
        id: v.id,
        date: v.date,
        title: sentence(v.description || v.type) || "Violation",
        meta: [v.source, v.severity ? `Class ${v.severity}` : null].filter(Boolean).join(" · "),
        status: isOpen(v.status) ? "Open" : "Closed",
      })),
    },
    {
      key: "lawsuits",
      label: "Lawsuits",
      noun: "lawsuits",
      rows: d.litigations.map((l) => ({
        id: l.id,
        date: l.date,
        title: sentence(l.case_type) || "Housing court case",
        meta: ["HPD litigation", l.judgment ? `judgment: ${l.judgment.toLowerCase()}` : null].filter(Boolean).join(" · "),
        status: isOpen(l.status) ? "Open" : "Closed",
      })),
    },
    {
      key: "evictions",
      label: "Evictions",
      noun: "evictions",
      rows: d.evictions.map((e) => ({
        id: e.id,
        date: e.executed_date,
        title: e.apartment_no ? `Eviction, apartment ${e.apartment_no}` : "Eviction",
        meta: ["City marshal", e.eviction_type ? e.eviction_type.toLowerCase() : null].filter(Boolean).join(" · "),
        status: null,
      })),
    },
    {
      key: "rodents",
      label: "Rodent inspections",
      noun: "rodent inspections",
      rows: d.rodent_inspections.map((r) => ({
        id: r.id,
        date: r.date,
        title: sentence(r.result) || "Inspection",
        meta: ["Health Dept", r.type ? r.type.toLowerCase() : null].filter(Boolean).join(" · "),
        status: null,
      })),
    },
    {
      key: "fire",
      label: "Fire code",
      noun: "fire code violations",
      rows: d.fdny_violations.map((f) => ({
        id: f.id,
        date: f.date,
        title: sentence(f.description || f.violation_type) || "Fire code violation",
        meta: ["FDNY", f.status ? titleCase(f.status) : null].filter(Boolean).join(" · "),
        status: null,
      })),
    },
  ];
  // The four core tabs always show (a zero is information); the rest only when present.
  return tabs.filter((t, i) => i < 4 || t.rows.length > 0);
}

const PREVIEW = 4;

function PaperTrail({ data }: { data: BuildingDetail }) {
  const tabs = trails(data);
  const [tab, setTab] = useState(tabs[0].key);
  const [expanded, setExpanded] = useState(false);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const rows = expanded ? current.rows : current.rows.slice(0, PREVIEW);

  return (
    <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3">
      <h3 className="m-0 font-display text-[21px] font-extrabold tracking-[-0.02em]">The paper trail</h3>
      <div role="tablist" aria-label="Records" className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`trail-tab-${t.key}`}
            aria-selected={t.key === current.key}
            aria-controls="trail-panel"
            onClick={() => {
              setTab(t.key);
              setExpanded(false);
            }}
            className={`h-11 rounded-full border-[1.5px] border-ink px-3.5 text-[13px] ${
              t.key === current.key ? "bg-ink font-bold text-white" : "bg-white font-semibold text-ink hover:bg-surface"
            }`}
          >
            {t.label} {t.rows.length}
          </button>
        ))}
      </div>
      <div id="trail-panel" role="tabpanel" aria-labelledby={`trail-tab-${current.key}`} className="flex flex-col">
        {rows.length === 0 ? (
          <p className="m-0 border-y-[1.5px] border-line py-4 text-sm text-muted">
            No {current.noun} in the last five years.
          </p>
        ) : (
          rows.map((r, i) => {
            const [md, y] = dateCell(r.date);
            return (
              <div key={r.id} className={`flex gap-3 border-t-[1.5px] border-line py-3 ${i === rows.length - 1 ? "border-b-[1.5px]" : ""}`}>
                <span className="w-[62px] shrink-0 text-xs font-semibold text-muted">
                  {md}
                  <br />
                  {y}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{r.title}</div>
                  {r.meta && <div className="text-[13px] text-muted">{r.meta}</div>}
                </div>
                {r.status && (
                  <span
                    className={`self-start rounded-full border-[1.5px] border-ink px-2 py-0.5 text-[11px] font-bold ${
                      r.status === "Open" ? "bg-grade-c" : ""
                    }`}
                  >
                    {r.status}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        {current.rows.length > PREVIEW ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-[44px] items-center text-sm font-bold underline underline-offset-2"
          >
            {expanded ? "Show fewer" : `Show all ${current.rows.length} ${current.noun}`}
          </button>
        ) : (
          <span />
        )}
        <a href="/#grade" className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-ink underline underline-offset-2">
          How scoring works
        </a>
      </div>
    </div>
  );
}

export function DeepFace({
  data,
  onClose,
  closeRef,
}: {
  data: BuildingDetail;
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const setCardView = useStore((s) => s.setCardView);
  const grade = toGrade(data.grade, "F");
  const scores = subScores(data);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
        <GradeTile grade={grade} size="deep" rotate={-4} shadow="xs" />
        <div className="min-w-0 flex-[1_1_260px]">
          <h2 id="building-card-title" className="m-0 font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[30px]">
            Behind the {grade} at {titleCase(data.address)}
          </h2>
          <div className="text-sm text-muted">
            Health score {Math.round(data.health_score)} out of 100 · last five years, recent issues count more
          </div>
        </div>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setCardView("summary")} className="btn-outline">
            <ChevronLeftIcon size={16} />
            Back to the summary
          </button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close building card" className="icon-btn">
            <CloseIcon size={20} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-6">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col">
          <div className="flex items-baseline justify-between pb-2">
            <h3 className="m-0 font-display text-[21px] font-extrabold tracking-[-0.02em]">Six sub-scores</h3>
            <span className="text-xs font-semibold text-muted">Worst first</span>
          </div>
          {scores.map((s, i) => (
            <SubScoreRow key={s.key} s={s} last={i === scores.length - 1} />
          ))}
        </div>
        <PaperTrail data={data} />
      </div>
    </div>
  );
}
