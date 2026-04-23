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
  const matches = LOCATION_ALIASES.flatMap((entry) => {
    return entry.aliases.flatMap((alias) => {
      const index = alias === alias.toLowerCase()
        ? normalizedPrompt.indexOf(alias)
        : prompt.indexOf(alias);

      if (index < 0) {
        return [];
      }

      return [
        {
          name: entry.name,
          index,
        },
      ];
    });
  });

  const ordered = matches
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.name);

  return Array.from(new Set(ordered));
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

  const formattedHour = `${adjustedHour % 12 === 0 ? 12 : adjustedHour % 12}`.padStart(
    2,
    "0",
  );
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

function StatusPill({ status }: { status: MapCheckpointStatus }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
      style={{
        backgroundColor: `${getStatusColor(status)}12`,
        color: getStatusBorderColor(status),
      }}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: getStatusColor(status) }}
      />
      {status}
    </span>
  );
}

export default function NaturalLanguageRouteModal({
  open,
  onClose,
}: NaturalLanguageRouteModalProps) {
  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  const [report, setReport] = useState<MockRouteReport | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isListening, setIsListening] = useState(false);
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
    }, 260);
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

    setIsListening(true);

    if (voiceTimerRef.current) {
      window.clearTimeout(voiceTimerRef.current);
    }

    voiceTimerRef.current = window.setTimeout(() => {
      setPrompt(SAMPLE_PROMPT);
      setIsListening(false);
      handleGenerateReport(SAMPLE_PROMPT);
    }, 1200);
  }

  if (!isMounted) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4 lg:p-6"
      aria-hidden={!isVisible}
    >
      <button
        type="button"
        aria-label="Close routing modal"
        className={`absolute inset-0 bg-slate-950/50 backdrop-blur-md transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="natural-route-title"
        className={`relative z-10 flex h-[min(92vh,56rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(255,255,255,0.38))] shadow-[0_30px_90px_rgba(15,23,42,0.22)] backdrop-blur-2xl transition-all duration-300 ease-out ${
          isVisible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-4 scale-[0.985] opacity-0"
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.12),transparent_26%),radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.08),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.08),transparent_28%)]" />

        <header className="relative border-b border-white/45 bg-white/40 px-4 py-4 backdrop-blur-xl sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                Natural language routing
              </p>
              <h2
                id="natural-route-title"
                className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl"
              >
                Compact route brief
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Type a trip, simulate a voice note, and get a mock route report
                that stays tight, readable, and ready for future map wiring.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden rounded-full border border-white/50 bg-white/50 px-3 py-1 text-[11px] font-medium text-slate-600 sm:inline-flex backdrop-blur-md">
                Mock only
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/55 text-slate-600 transition hover:border-white/70 hover:text-slate-900 backdrop-blur-md"
                aria-label="Close modal"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
          </div>
        </header>

        <div className="relative flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_45%)] p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className="space-y-4">
              <section className="rounded-[24px] border border-white/55 bg-white/45 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="natural-route-input"
                    className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500"
                  >
                    Prompt
                  </label>

                  <span className="rounded-full border border-white/45 bg-white/55 px-2.5 py-1 text-[11px] font-medium text-blue-700 backdrop-blur-md">
                    Text or voice
                  </span>
                </div>

                <textarea
                  ref={textareaRef}
                  id="natural-route-input"
                  dir="auto"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={4}
                  placeholder="لو بدي اطلع من جنين لنابلس بكرة 8"
                  className="mt-3 min-h-[118px] w-full resize-none rounded-[22px] border border-white/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.46))] px-4 py-3 text-[15px] leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 backdrop-blur-md focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateReport()}
                    disabled={isParsing || isListening}
                    className="inline-flex items-center rounded-full border border-white/20 bg-slate-950/85 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isParsing ? "Parsing..." : "Generate"}
                  </button>

                  <button
                    type="button"
                    onClick={handleUseVoice}
                    disabled={isListening || isParsing}
                    className="inline-flex items-center gap-2 rounded-full border border-white/45 bg-white/55 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-white/75 disabled:cursor-wait disabled:opacity-60 backdrop-blur-md"
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full bg-blue-600 ${
                        isListening ? "animate-pulse" : ""
                      }`}
                    />
                    {isListening ? "Listening" : "Voice"}
                  </button>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Example:{" "}
                  <span className="font-medium text-slate-700">
                    {SAMPLE_PROMPT}
                  </span>
                </p>
              </section>

              <section className="rounded-[24px] border border-white/10 bg-slate-950/80 p-4 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/42">
                      Parsed route
                    </p>
                    <p className="mt-2 truncate text-lg font-semibold">
                      {report
                        ? `${report.origin} → ${report.destination}`
                        : "Awaiting route"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-right backdrop-blur-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                      Confidence
                    </p>
                    <p className="mt-1 text-2xl font-semibold">
                      {report ? `${report.confidence}%` : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 backdrop-blur-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                      Origin
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {report?.origin ?? "Jenin"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 backdrop-blur-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                      Destination
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {report?.destination ?? "Nablus"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 backdrop-blur-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                      Departure
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {report?.departureLabel ?? "Tomorrow, 08:00 AM"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 backdrop-blur-md">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                      Mode
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      Mock brief
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-white/58">
                  Apply-on-map stays disabled for now. We only keep the hook in
                  place for the future route application flow.
                </p>
              </section>
            </aside>

            <section className="min-h-0 overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(25,35,64,0.84))] text-white shadow-[0_18px_50px_rgba(15,23,42,0.14)] backdrop-blur-xl">
              <div className="h-full overflow-y-auto p-4 sm:p-5">
                {isParsing ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/90" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
                          Generating intelligence brief
                        </p>
                        <p className="mt-1 text-sm text-white/68">
                          Mock parsing origin, destination, time, and checkpoints.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        "Parsing origin",
                        "Matching checkpoints",
                        "Building report",
                      ].map((label) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-white/10 bg-white/8 p-3 backdrop-blur-md"
                        >
                          <div className="h-2.5 w-16 rounded-full bg-white/18" />
                          <div className="mt-3 h-3 w-24 rounded-full bg-white/12" />
                          <div className="mt-4 h-16 rounded-xl bg-white/8" />
                          <p className="mt-3 text-[11px] text-white/55">
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : report ? (
                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-white/10 bg-white/8 p-4 backdrop-blur-md">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                            Mock route report
                          </p>
                          <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                            {report.origin} to {report.destination}
                          </h3>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/72">
                            {report.summary}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-right backdrop-blur-md">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
                            Confidence
                          </p>
                          <p className="mt-1 text-2xl font-semibold">
                            {report.confidence}%
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-md">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                            Departure
                          </p>
                          <p className="mt-1 text-sm font-medium text-white">
                            {report.departureLabel}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-md">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                            Distance
                          </p>
                          <p className="mt-1 text-sm font-medium text-white">
                            {report.distanceKm} km
                          </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-md">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                            Duration
                          </p>
                          <p className="mt-1 text-sm font-medium text-white">
                            {report.durationMinutes} min
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/25 px-3 py-3 backdrop-blur-md">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
                            Prompt captured
                          </p>
                          <p className="mt-1 text-sm leading-6 text-white/82">
                            {report.rawPrompt}
                          </p>
                        </div>
                        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                          Smart parsing active
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {report.checkpoints.map((checkpoint, index) => (
                        <article
                          key={`${checkpoint.name}-${index}`}
                          className="rounded-[22px] border border-white/10 bg-white/8 p-3.5 transition hover:bg-white/10 backdrop-blur-md"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold text-white/85 backdrop-blur-md">
                              {index + 1}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white">
                                    {checkpoint.name}
                                  </p>
                                  <p className="mt-1 text-sm leading-5 text-white/68">
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

                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-white/10 bg-white/8 px-3 py-3 backdrop-blur-md">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
                          Future action
                        </p>
                        <p className="mt-1 text-sm text-white/65">
                          Apply-on-map is reserved for the next step.
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-white/42 backdrop-blur-md"
                      >
                        Apply on map
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[18rem] items-center justify-center rounded-[24px] border border-dashed border-white/12 bg-white/8 px-5 text-center backdrop-blur-md">
                    <div className="max-w-md">
                      <p className="text-lg font-semibold">No route generated yet</p>
                      <p className="mt-2 text-sm leading-6 text-white/65">
                        Generate the mock brief to see checkpoints, timing, and the
                        route summary appear here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
