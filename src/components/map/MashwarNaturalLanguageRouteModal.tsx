"use client";

import { useEffect, useRef, useState } from "react";

import { getStatusBorderColor, getStatusColor } from "@/lib/config/map";
import type { MapCheckpointStatus } from "@/lib/types/map";

interface MockRouteCheckpoint {
  name: string;
  status: MapCheckpointStatus;
  note: string;
}

interface MockRouteReport {
  rawPrompt: string;
  origin: string;
  destination: string;
  departureLabel: string;
  distanceKm: number;
  durationMinutes: number;
  confidence: number;
  summary: string;
  checkpoints: MockRouteCheckpoint[];
}

interface RouteTemplate {
  origin: string;
  destination: string;
  summary: string;
  distanceKm: number;
  durationMinutes: number;
  confidence: number;
  checkpoints: MockRouteCheckpoint[];
}

interface NaturalLanguageRouteModalProps {
  open: boolean;
  onClose: () => void;
}

const SAMPLE_PROMPT = "لو بدي اطلع من جنين لنابلس بكرة 8";

const LOCATION_ALIASES = [
  { name: "Jenin", aliases: ["jenin", "جنين"] },
  { name: "Nablus", aliases: ["nablus", "نابلس"] },
  { name: "Ramallah", aliases: ["ramallah", "رام الله", "رامالله"] },
  { name: "Bethlehem", aliases: ["bethlehem", "بيت لحم"] },
  { name: "Hebron", aliases: ["hebron", "الخليل", "خليل"] },
  { name: "Jericho", aliases: ["jericho", "أريحا", "اريحا"] },
] as const;

const ROUTE_TEMPLATES: Record<string, RouteTemplate> = {
  "Jenin|Nablus": {
    origin: "Jenin",
    destination: "Nablus",
    summary:
      "A northbound mock corridor with one slow merge and two checkpoint touchpoints before the city edge.",
    distanceKm: 38,
    durationMinutes: 62,
    confidence: 96,
    checkpoints: [
      {
        name: "Jenin city exit",
        status: "سالك",
        note: "Easy departure from the urban edge.",
      },
      {
        name: "South valley merge",
        status: "أزمة متوسطة",
        note: "A short queue forms near the merge lane.",
      },
      {
        name: "Nablus east approach",
        status: "سالك",
        note: "Final approach is open in this mock brief.",
      },
    ],
  },
  "Ramallah|Bethlehem": {
    origin: "Ramallah",
    destination: "Bethlehem",
    summary:
      "A mock central-south corridor with alternating slow and clear segments.",
    distanceKm: 29,
    durationMinutes: 54,
    confidence: 92,
    checkpoints: [
      {
        name: "Ramallah south exit",
        status: "سالك",
        note: "Initial departure is clean.",
      },
      {
        name: "Mid-corridor junction",
        status: "أزمة خانقة",
        note: "A temporary pinch point slows the route.",
      },
      {
        name: "Bethlehem entry ring",
        status: "أزمة متوسطة",
        note: "The route opens again near the ring road.",
      },
    ],
  },
  "Hebron|Jericho": {
    origin: "Hebron",
    destination: "Jericho",
    summary:
      "A long south-east mock route with a quiet start and a later restricted segment.",
    distanceKm: 57,
    durationMinutes: 88,
    confidence: 89,
    checkpoints: [
      {
        name: "Hebron outbound lane",
        status: "سالك",
        note: "Smooth leaving movement for the first leg.",
      },
      {
        name: "Desert ridge checkpoint",
        status: "أزمة متوسطة",
        note: "Traffic compresses briefly at the ridge line.",
      },
      {
        name: "Jericho access road",
        status: "مغلق",
        note: "The mock brief marks the final entry as closed.",
      },
    ],
  },
};

const DEFAULT_TEMPLATE: RouteTemplate = {
  origin: "Origin point",
  destination: "Destination point",
  summary:
    "This mock route brief keeps the structure ready for a real parser and live map application later.",
  distanceKm: 24,
  durationMinutes: 41,
  confidence: 78,
  checkpoints: [
    {
      name: "Initial departure",
      status: "سالك",
      note: "The first segment is free-flowing.",
    },
    {
      name: "Mid-route control point",
      status: "أزمة متوسطة",
      note: "A soft slowdown appears at the midpoint.",
    },
    {
      name: "Arrival approach",
      status: "سالك",
      note: "The final approach is clear in this mock output.",
    },
  ],
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:@/-]+/gu, " ")
    .replace(/\s+/g, " ");
}

function getLocationsInOrder(prompt: string): string[] {
  const normalizedPrompt = normalizeText(prompt);
  const matches = LOCATION_ALIASES.flatMap((entry) =>
    entry.aliases.flatMap((alias) => {
      const index =
        alias === alias.toLowerCase()
          ? normalizedPrompt.indexOf(alias)
          : prompt.indexOf(alias);

      if (index < 0) {
        return [];
      }

      return [{ name: entry.name, index }];
    }),
  );

  return Array.from(new Set(matches.sort((left, right) => left.index - right.index).map((entry) => entry.name)));
}

function getTemplateKey(origin: string, destination: string): string {
  return `${origin}|${destination}`;
}

function parseTimeLabel(prompt: string): string {
  const normalizedPrompt = normalizeText(prompt);
  const timeMatch = normalizedPrompt.match(
    /(?:\b(?:at|around|ساعة|الساعة|عند)\b\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/,
  );

  if (!timeMatch) {
    return "08:00 AM";
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? "0");
  const meridiem = timeMatch[3];

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return "08:00 AM";
  }

  const adjustedHour =
    meridiem === "pm" && hour < 12
      ? hour + 12
      : meridiem === "am" && hour === 12
        ? 0
        : hour;

  const formattedHour = `${adjustedHour % 12 === 0 ? 12 : adjustedHour % 12}`.padStart(2, "0");
  const formattedMinute = `${Math.max(0, Math.min(59, minute))}`.padStart(2, "0");
  const period = adjustedHour >= 12 ? "PM" : "AM";

  return `${formattedHour}:${formattedMinute} ${period}`;
}

function parseDepartureLabel(prompt: string): string {
  const normalizedPrompt = normalizeText(prompt);
  const tomorrowTokens = ["tomorrow", "بكرة", "باجر", "غد", "غدا"];

  if (tomorrowTokens.some((token) => normalizedPrompt.includes(token))) {
    return "Tomorrow";
  }

  if (
    ["today", "اليوم", "now", "الآن", "الان"].some((token) =>
      normalizedPrompt.includes(token),
    )
  ) {
    return "Today";
  }

  return "Next available slot";
}

function generateMockRouteReport(prompt: string): MockRouteReport {
  const [originCandidate, destinationCandidate] = getLocationsInOrder(prompt);
  const origin = originCandidate ?? DEFAULT_TEMPLATE.origin;
  const destination = destinationCandidate ?? DEFAULT_TEMPLATE.destination;
  const template =
    ROUTE_TEMPLATES[getTemplateKey(origin, destination)] ??
    ROUTE_TEMPLATES[getTemplateKey(destination, origin)] ??
    {
      ...DEFAULT_TEMPLATE,
      origin,
      destination,
    };

  return {
    rawPrompt: prompt.trim(),
    origin: template.origin,
    destination: template.destination,
    departureLabel: `${parseDepartureLabel(prompt)}, ${parseTimeLabel(prompt)}`,
    distanceKm: template.distanceKm,
    durationMinutes: template.durationMinutes,
    confidence: template.confidence,
    summary: template.summary,
    checkpoints: template.checkpoints,
  };
}

function getConfidenceTone(confidence: number) {
  if (confidence > 90) {
    return { color: "#86efac", text: `${confidence}%` };
  }

  if (confidence >= 80) {
    return { color: "#22c55e", text: `${confidence}%` };
  }

  return { color: "#f59e0b", text: `${confidence}%` };
}

function StatusPill({ status }: { status: MapCheckpointStatus }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold"
      style={{
        backgroundColor: `${getStatusColor(status)}12`,
        color: getStatusBorderColor(status),
        borderColor: `${getStatusColor(status)}55`,
      }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getStatusColor(status) }} />
      {status}
    </span>
  );
}

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 11.5a4.5 4.5 0 0 0 9 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 15.5V20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M9 20h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SectionLabel({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[#6b7280]">
        {label}
      </p>
      <h2 className="text-[24px] font-bold text-[#f9fafb]">{title}</h2>
      {subtitle ? <p className="text-[13px] leading-6 text-[#94a3b8]">{subtitle}</p> : null}
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "blue" | "green" | "amber";
}) {
  const valueColor =
    tone === "blue"
      ? "#60a5fa"
      : tone === "green"
        ? "#86efac"
        : tone === "amber"
          ? "#fbbf24"
          : "#f9fafb";

  return (
    <div className="rounded-[8px] bg-[#0a0b0d] p-3">
      <p className="mashwar-mono text-[9px] uppercase tracking-[0.26em] text-[#6b7280]">
        {label}
      </p>
      <p className="mt-2 text-[16px] font-medium" style={{ color: valueColor }}>
        {value}
      </p>
    </div>
  );
}

export default function MashwarNaturalLanguageRouteModal({
  open,
  onClose,
}: NaturalLanguageRouteModalProps) {
  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  const [report, setReport] = useState<MockRouteReport | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const parseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return;
    }

    setIsVisible(false);

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setIsMounted(false);
      setIsParsing(false);
      setIsListening(false);
      setReport(null);
    }, 240);
  }, [open]);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMounted, onClose]);

  useEffect(() => {
    if (isMounted && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [isMounted]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPrompt(SAMPLE_PROMPT);
    setMode("text");
    setIsParsing(true);
    setReport(null);

    if (parseTimerRef.current) {
      window.clearTimeout(parseTimerRef.current);
    }

    parseTimerRef.current = window.setTimeout(() => {
      setReport(generateMockRouteReport(SAMPLE_PROMPT));
      setIsParsing(false);
    }, 900);

    return () => {
      if (parseTimerRef.current) {
        window.clearTimeout(parseTimerRef.current);
      }
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (voiceTimerRef.current) {
        window.clearTimeout(voiceTimerRef.current);
      }
      if (parseTimerRef.current) {
        window.clearTimeout(parseTimerRef.current);
      }
    };
  }, []);

  function handleGenerateReport(promptOverride?: string): void {
    setIsParsing(true);
    setReport(null);

    if (parseTimerRef.current) {
      window.clearTimeout(parseTimerRef.current);
    }

    parseTimerRef.current = window.setTimeout(() => {
      setReport(generateMockRouteReport(promptOverride ?? prompt));
      setIsParsing(false);
    }, 900);
  }

  function handleUseVoice(): void {
    if (isListening) {
      return;
    }

    setMode("voice");
    setIsListening(true);

    if (voiceTimerRef.current) {
      window.clearTimeout(voiceTimerRef.current);
    }

    voiceTimerRef.current = window.setTimeout(() => {
      setPrompt(SAMPLE_PROMPT);
      setIsListening(false);
      setMode("text");
      handleGenerateReport(SAMPLE_PROMPT);
    }, 1200);
  }

  if (!isMounted) {
    return null;
  }

  const confidenceTone = report ? getConfidenceTone(report.confidence) : null;

  return (
    <div className="fixed inset-0 z-50" aria-hidden={!isVisible}>
      <button
        type="button"
        aria-label="Close routing modal"
        className={`absolute inset-0 bg-black/65 backdrop-blur-[20px] transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="natural-route-title"
        className={`relative z-10 mx-auto flex h-[min(92vh,60rem)] w-[min(100vw-1.5rem,900px)] flex-col overflow-hidden rounded-[16px] border border-white/8 bg-[#111318] shadow-[0_30px_100px_rgba(0,0,0,0.7)] transition-all duration-300 ease-out sm:mt-6 ${
          isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.985] opacity-0"
        }`}
        style={{ animation: "mashwar-modal-in 220ms ease-out" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.11),transparent_26%),radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.08),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.08),transparent_26%)]" />

        <header className="relative border-b border-white/8 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[#6b7280]">
                NATURAL LANGUAGE ROUTING
              </p>
              <h2 id="natural-route-title" className="text-[24px] font-bold text-[#f9fafb]">
                Compact route brief
              </h2>
              <p className="max-w-2xl text-[13px] leading-6 text-[#94a3b8]">
                Parse a brief, listen to a voice note, and keep the route report crisp,
                bilingual, and ready for map application.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="mashwar-pill inline-flex items-center rounded-full border border-[#92400e] bg-[#78350f] px-3 py-1 text-[#fbbf24]">
                Mock only
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-[#0a0b0d] text-[#cbd5e1] transition hover:bg-[#1a1d24] hover:text-[#f9fafb]"
                aria-label="Close modal"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
          </div>
        </header>

        <div className="relative grid flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <aside className="space-y-4">
            <section className="mashwar-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                  PROMPT
                </p>
                <div className="inline-flex rounded-full border border-[#2d3139] bg-[#0a0b0d] p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("text")}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      mode === "text"
                        ? "bg-[#3b82f6] text-white"
                        : "text-[#94a3b8] hover:text-[#f9fafb]"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    onClick={handleUseVoice}
                    disabled={isListening || isParsing}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-[#94a3b8] transition hover:text-[#f9fafb] disabled:cursor-wait disabled:opacity-55"
                  >
                    <IconMic />
                    Voice
                  </button>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                id="natural-route-input"
                dir="rtl"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
                placeholder="لو بدي اطلع من جنين لنابلس بكرة 8"
                className="mt-3 min-h-[128px] w-full resize-none rounded-[8px] border border-[#2d3139] bg-[#0a0b0d] px-4 py-3 text-[16px] leading-7 text-[#f9fafb] outline-none transition placeholder:text-[#64748b] focus:border-[#3b82f6] focus:ring-4 focus:ring-[#3b82f6]/12"
                style={{ fontFamily: "var(--font-ibm-arabic), ui-sans-serif, sans-serif" }}
              />

              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <button
                  type="button"
                  onClick={() => handleGenerateReport()}
                  disabled={isParsing || isListening}
                  className="h-11 rounded-[8px] bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#4f8df7] disabled:cursor-wait disabled:opacity-55"
                >
                  {isParsing ? "Generating..." : "Generate"}
                </button>

                <button
                  type="button"
                  onClick={handleUseVoice}
                  disabled={isListening || isParsing}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#2d3139] bg-transparent px-4 text-sm text-[#e5e7eb] transition hover:bg-[#1a1d24] disabled:cursor-wait disabled:opacity-55"
                >
                  <IconMic />
                  Voice
                </button>
              </div>

              <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-[#f59e0b]">
                Example: {SAMPLE_PROMPT}
              </p>
            </section>

            <section className="mashwar-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                    PARSED ROUTE
                  </p>
                  <h3 className="mt-2 truncate text-[16px] font-bold text-[#f9fafb]">
                    {report ? `${report.origin} → ${report.destination}` : "Awaiting route"}
                  </h3>
                </div>

                <div className="rounded-[10px] border border-white/8 bg-[#0a0b0d] px-3 py-2 text-right">
                  <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">
                    CONFIDENCE
                  </p>
                  <p className="mt-1 mashwar-mono text-[24px] font-bold" style={{ color: confidenceTone?.color ?? "#60a5fa" }}>
                    {report ? `${report.confidence}%` : "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Tile label="Origin" value={report?.origin ?? "Jenin"} tone="default" />
                <Tile label="Destination" value={report?.destination ?? "Nablus"} tone="default" />
                <Tile label="Departure" value={report?.departureLabel ?? "Tomorrow, 08:00 AM"} tone="amber" />
                <Tile label="Mode" value="Mock brief" tone="default" />
              </div>

              <p className="mt-3 text-[11px] italic leading-5 text-[#94a3b8]">
                This output is mock only and does not apply to live navigation until the
                map layer confirms a valid route.
              </p>
            </section>
          </aside>

          <section className="mashwar-panel flex min-h-0 flex-col overflow-hidden">
            <div className="mashwar-scroll flex-1 overflow-y-auto p-4">
              {isParsing ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-[10px] bg-[#0a0b0d] p-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#2d3139] bg-[#111318]">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/80" />
                    </div>
                    <div>
                      <p className="mashwar-mono text-[10px] uppercase tracking-[0.3em] text-[#6b7280]">
                        Generating intelligence brief
                      </p>
                      <p className="mt-1 text-[13px] leading-6 text-[#94a3b8]">
                        Mock parsing origin, destination, time, and checkpoint sequence.
                      </p>
                    </div>
                  </div>
                </div>
              ) : report ? (
                <div className="space-y-4">
                  <section className="rounded-[12px] border border-white/8 bg-[#0a0b0d] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.32em] text-[#6b7280]">
                          MOCK ROUTE REPORT
                        </p>
                        <h3 className="mt-2 text-[22px] font-bold text-[#f9fafb]">
                          {report.origin} to {report.destination}
                        </h3>
                        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#94a3b8]">
                          {report.summary}
                        </p>
                      </div>

                      <div className="rounded-[10px] border border-white/8 bg-[#111318] px-3 py-2">
                        <p className="mashwar-mono text-[9px] uppercase tracking-[0.24em] text-[#6b7280]">
                          CONFIDENCE
                        </p>
                        <p className="mt-1 mashwar-mono text-[22px] font-bold" style={{ color: confidenceTone?.color ?? "#60a5fa" }}>
                          {report.confidence}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <Tile label="Confidence" value={`${report.confidence}%`} tone="blue" />
                      <Tile label="Departure" value={report.departureLabel} tone="default" />
                      <Tile label="Distance" value={`${report.distanceKm} km`} tone="default" />
                      <Tile label="Duration" value={`${report.durationMinutes} min`} tone="default" />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#2d3139] bg-[#111318] px-3 py-3">
                      <div className="min-w-0">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                          PROMPT CAPTURED
                        </p>
                        <p className="mt-1 text-[13px] leading-6 text-[#e5e7eb]">
                          {report.rawPrompt}
                        </p>
                      </div>
                      <span className="mashwar-pill inline-flex items-center gap-2 border border-[#14532d] bg-[#0d1f15] px-3 py-1 text-[#86efac]">
                        <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                        Smart parsing active
                      </span>
                    </div>
                  </section>

                  <div className="space-y-2">
                    {report.checkpoints.map((checkpoint, index) => (
                      <article
                        key={`${checkpoint.name}-${index}`}
                        className="rounded-[10px] border border-white/5 bg-[#111318] px-3 py-3 transition hover:bg-[#15181e]"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a0b0d] text-[12px] font-semibold text-[#cbd5e1]">
                            {index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="text-[14px] font-bold text-[#f9fafb]">
                                  {checkpoint.name}
                                </h4>
                                <p className="mt-1 text-[12px] leading-5 text-[#94a3b8]">
                                  {checkpoint.note}
                                </p>
                              </div>

                              <StatusPill status={checkpoint.status} />
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[18rem] items-center justify-center rounded-[12px] border border-dashed border-white/8 bg-[#0a0b0d] px-5 text-center">
                  <div className="max-w-md">
                    <p className="text-[18px] font-bold text-[#f9fafb]">
                      No route generated yet
                    </p>
                    <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">
                      Generate the mock brief to see checkpoints, timing, and route
                      summary appear here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
