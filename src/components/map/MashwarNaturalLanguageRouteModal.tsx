"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import RouteLoadingCard from "@/components/map/RouteLoadingCard";
import { forecastHorizonSubkey, safeCheckpointFlowLabel } from "@/i18n/message-key-map";
import { translateServiceError } from "@/lib/i18n/translate-service-error";
import { resolveNaturalLanguageRequest } from "@/lib/services/route-intent";
import type {
  MapCheckpointStatus,
  NormalizedCheckpointTravelWindow,
  NormalizedCheckpointTravelWindowItem,
  UserLocation,
} from "@/lib/types/map";
import type {
  NaturalLanguageExecution,
  NaturalLanguageCheckpointExecution,
  NaturalLanguageRouteExecution,
} from "@/lib/types/route-intent";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";

interface NaturalLanguageRouteModalProps {
  open: boolean;
  onClose: () => void;
  currentLocation?: UserLocation | null;
  onApplyRoute?: (
    resolution: NaturalLanguageRouteExecution["resolution"],
  ) => void;
}

const NL_EMPTY_PROMPT_SENTINEL = "__NL_EMPTY_PROMPT__";

const STATUS_VISUALS: Record<
  MapCheckpointStatus,
  {
    text: string;
    bg: string;
    border: string;
  }
> = {
  سالك: {
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
  },
  "أزمة متوسطة": {
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  "أزمة خانقة": {
    text: "#fdba74",
    bg: "rgba(249, 115, 22, 0.12)",
    border: "rgba(249, 115, 22, 0.35)",
  },
  مغلق: {
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
  },
  "غير معروف": {
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.35)",
  },
};

const NL_RISK_STYLES: Record<
  "low" | "medium" | "high" | "unknown",
  {
    text: string;
    bg: string;
    border: string;
  }
> = {
  low: {
    text: "#86efac",
    bg: "rgba(34, 197, 94, 0.12)",
    border: "rgba(34, 197, 94, 0.35)",
  },
  medium: {
    text: "#fbbf24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
  },
  high: {
    text: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.12)",
    border: "rgba(239, 68, 68, 0.35)",
  },
  unknown: {
    text: "#cbd5e1",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.35)",
  },
};

interface PillProps {
  label: string;
  text: string;
  bg: string;
  border: string;
}

function Pill({ label, text, bg, border }: PillProps) {
  return (
    <span
      className="inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
      style={{ color: text, backgroundColor: bg, borderColor: border }}
    >
      {label}
    </span>
  );
}

function formatDateTimeLabel(value: string | null): string {
  return formatDateTimeInPalestine(value);
}

function formatPercent(
  value: number | null,
  tCommon: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return tCommon("notAvailable");
  }

  return tCommon("percent", { value: Math.round(value * 100) });
}

function formatRiskScore(
  value: number | null,
  tCommon: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return tCommon("notAvailable");
  }

  return value.toFixed(1);
}

function formatDurationLabel(
  durationMs: number | null,
  tCommon: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return tCommon("notAvailable");
  }

  const totalMinutes = Math.round(durationMs / 60000);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return `${totalMinutes}m`;
}

function formatDistanceLabel(
  distanceM: number | null,
  tCommon: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (distanceM === null || !Number.isFinite(distanceM) || distanceM <= 0) {
    return tCommon("notAvailable");
  }

  if (distanceM >= 1000) {
    return `${(distanceM / 1000).toFixed(distanceM >= 10000 ? 0 : 1)} km`;
  }

  return `${Math.round(distanceM)} m`;
}

function formatRouteTitle(
  route: NaturalLanguageRouteExecution["resolution"],
  t: (key: string, values: { origin: string; destination: string }) => string,
): string {
  return t("routeSummary", { origin: route.originLabel, destination: route.destinationLabel });
}

function buildForecastRows(
  forecast: NonNullable<NaturalLanguageCheckpointExecution["resolution"]["forecast"]>,
) {
  const rows = new Map<
    string,
    {
      horizon: string;
      targetDateTime: string | null;
      entering: (typeof forecast.predictions.entering)[number] | null;
      leaving: (typeof forecast.predictions.leaving)[number] | null;
    }
  >();

  const addItem = (
    direction: "entering" | "leaving",
    item: (typeof forecast.predictions.entering)[number],
  ) => {
    const current = rows.get(item.horizon) ?? {
      horizon: item.horizon,
      targetDateTime: item.targetDateTime,
      entering: null,
      leaving: null,
    };

    current[direction] = item;
    current.targetDateTime = current.targetDateTime ?? item.targetDateTime;
    rows.set(item.horizon, current);
  };

  forecast.predictions.entering.forEach((item) => addItem("entering", item));
  forecast.predictions.leaving.forEach((item) => addItem("leaving", item));

  const order = new Map([
    ["plus_30m", 0],
    ["plus_1h", 1],
    ["plus_2h", 2],
    ["next_day_8am", 3],
  ]);

  return Array.from(rows.values()).sort((left, right) => {
    const leftRank = order.get(left.horizon) ?? 99;
    const rightRank = order.get(right.horizon) ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.horizon.localeCompare(right.horizon);
  });
}

function formatTravelWindowHour(
  value: number | null,
  tCommon: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (value === null || !Number.isFinite(value)) {
    return tCommon("notAvailable");
  }

  return `${`${Math.trunc(value)}`.padStart(2, "0")}:00`;
}

function buildTravelWindowEntries(
  travelWindow: NormalizedCheckpointTravelWindow | null,
  tHeadline: (key: "best" | "worst") => string,
): Array<{
  kind: "best" | "worst";
  label: string;
  item: NormalizedCheckpointTravelWindowItem;
}> {
  if (!travelWindow) {
    return [];
  }

  const entries: Array<{
    kind: "best" | "worst";
    label: string;
    item: NormalizedCheckpointTravelWindowItem;
  }> = [];

  if (travelWindow.best) {
    entries.push({
      kind: "best",
      label: tHeadline("best"),
      item: travelWindow.best,
    });
  }

  if (travelWindow.worst) {
    entries.push({
      kind: "worst",
      label: tHeadline("worst"),
      item: travelWindow.worst,
    });
  }

  return entries;
}

function StatusBadge({ status }: { status: MapCheckpointStatus }) {
  const visual = STATUS_VISUALS[status] ?? STATUS_VISUALS["غير معروف"];
  const tFlow = useTranslations("checkpoint.flow");
  const label = safeCheckpointFlowLabel(status, tFlow);
  return <Pill label={label} text={visual.text} bg={visual.bg} border={visual.border} />;
}

function RouteWindowCard({
  title,
  departAt,
  route,
}: {
  title: string;
  departAt: string;
  route: NaturalLanguageRouteExecution["resolution"]["route"]["mainRoute"];
}) {
  const tWin = useTranslations("nlRoute.windowCard");
  const tRisk = useTranslations("routing.risk");
  const tCommon = useTranslations("common");

  if (!route) {
    return null;
  }

  const riskStyle = NL_RISK_STYLES[route.riskLevel ?? "unknown"];
  const riskKey = route.riskLevel ?? "unknown";
  const riskLabel = tRisk(riskKey as "low");

  return (
    <article className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
            {title}
          </p>
          <h4 className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
            {formatDateTimeLabel(departAt)}
          </h4>
          <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">
            {route.reasonSummary || tWin("noSummary")}
          </p>
        </div>

        <Pill
          label={riskLabel}
          text={riskStyle.text}
          bg={riskStyle.bg}
          border={riskStyle.border}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
          <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
            {tWin("smartEta")}
          </p>
          <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
            {formatDateTimeLabel(route.smartEtaDateTime)}
          </p>
        </div>
        <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
          <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
            {tWin("expectedDelay")}
          </p>
          <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
            {route.expectedDelayMinutes !== null
              ? tWin("delayMinutes", {
                  minutes: Math.max(1, Math.round(route.expectedDelayMinutes)),
                })
              : tCommon("notAvailable")}
          </p>
        </div>
        <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
          <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
            {tWin("risk")}
          </p>
          <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
            {formatRiskScore(route.riskScore, tCommon)}
          </p>
        </div>
        <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
          <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
            {tWin("checkpoints")}
          </p>
          <p className="mt-2 text-[18px] font-semibold text-[#f9fafb]">
            {route.checkpointCount}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {route.riskConfidence !== null ? (
          <Pill
            label={tWin("confidencePill", {
              value: formatPercent(route.riskConfidence, tCommon),
            })}
            text="#cbd5e1"
            bg="rgba(148, 163, 184, 0.12)"
            border="rgba(148, 163, 184, 0.24)"
          />
        ) : null}
        {route.historicalVolatility !== null ? (
          <Pill
            label={tWin("volatilityPill", {
              value: route.historicalVolatility.toFixed(1),
            })}
            text="#cbd5e1"
            bg="rgba(148, 163, 184, 0.12)"
            border="rgba(148, 163, 184, 0.24)"
          />
        ) : null}
        <Pill
          label={tWin("distancePill", {
            value: formatDistanceLabel(route.distanceM, tCommon),
          })}
          text="#cbd5e1"
          bg="rgba(148, 163, 184, 0.12)"
          border="rgba(148, 163, 184, 0.24)"
        />
      </div>
    </article>
  );
}

export default function MashwarNaturalLanguageRouteModal({
  open,
  onClose,
  currentLocation,
  onApplyRoute,
}: NaturalLanguageRouteModalProps) {
  const t = useTranslations("nlRoute");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tPanel = useTranslations("checkpoint.panel");
  const tForecastH = useTranslations("forecast.horizon");
  const tTravelHeadline = useTranslations("forecast.travelHeadline");
  const tFlow = useTranslations("checkpoint.flow");

  const [isMounted, setIsMounted] = useState(open);
  const [isVisible, setIsVisible] = useState(open);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<NaturalLanguageExecution | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const requestNonceRef = useRef(0);

  async function runPrompt(promptValue: string): Promise<void> {
    const requestId = ++requestNonceRef.current;
    setIsParsing(true);
    setError(null);
    setResult(null);

    try {
      const nextResult = await resolveNaturalLanguageRequest({
        text: promptValue,
        currentLocation: currentLocation ?? null,
      });

      if (requestNonceRef.current !== requestId) {
        return;
      }

      setResult(nextResult);
    } catch (nextError) {
      if (requestNonceRef.current !== requestId) {
        return;
      }

      setError(
        nextError instanceof Error
          ? nextError.message
          : tErrors("nlIntelligence"),
      );
    } finally {
      if (requestNonceRef.current === requestId) {
        setIsParsing(false);
      }
    }
  }

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });

      setPrompt(t("placeholder"));
      setMode("text");
      setResult(null);
      setError(null);
      setIsParsing(false);
      return;
    }

    setIsVisible(false);
    requestNonceRef.current += 1;

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setIsMounted(false);
      setIsParsing(false);
      setIsListening(false);
      setError(null);
      setResult(null);
    }, 240);
  }, [open, t]);

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
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (voiceTimerRef.current) {
        window.clearTimeout(voiceTimerRef.current);
      }
    };
  }, []);

  function handleGenerateReport(promptOverride?: string): void {
    const nextPrompt = (promptOverride ?? prompt).trim();
    if (!nextPrompt) {
      setError(NL_EMPTY_PROMPT_SENTINEL);
      return;
    }

    void runPrompt(nextPrompt);
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
      const sample = t("placeholder");
      setPrompt(sample);
      setIsListening(false);
      setMode("text");
      void runPrompt(sample);
    }, 1200);
  }

  if (!isMounted) {
    return null;
  }

  const parsedConfidence =
    result && "parse" in result
      ? formatPercent(result.parse.confidence, tCommon)
      : tCommon("dash");

  return (
    <div className="fixed inset-0 z-[3000]" aria-hidden={!isVisible}>
      <button
        type="button"
        aria-label={t("closeBackdropAria")}
        className={`absolute inset-0 bg-black/65 backdrop-blur-[20px] transition-opacity duration-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="natural-route-title"
        className={`relative z-10 mx-auto flex h-[min(92vh,60rem)] w-[min(100vw-1.5rem,1120px)] flex-col overflow-hidden rounded-[16px] border border-white/8 bg-transparent shadow-[0_30px_100px_rgba(0,0,0,0.7)] transition-all duration-300 ease-out sm:mt-6 ${
          isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.985] opacity-0"
        }`}
        style={{ animation: "mashwar-modal-in 220ms ease-out" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.11),transparent_26%),radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.08),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.08),transparent_26%)]" />

        <header className="relative border-b border-white/8 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.34em] text-[#6b7280]">
                {t("headerKicker")}
              </p>
              <h2 id="natural-route-title" className="relative z-50 text-[24px] font-bold text-[#f9fafb]">
                {t("title")}
              </h2>
              <p className="max-w-2xl text-[13px] leading-6 text-[#94a3b8]">{t("subtitle")}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Pill
                label={currentLocation ? t("locationReady") : t("locationMissing")}
                text={currentLocation ? "#86efac" : "#cbd5e1"}
                bg={currentLocation ? "rgba(34, 197, 94, 0.12)" : "rgba(148, 163, 184, 0.12)"}
                border={currentLocation ? "rgba(34, 197, 94, 0.35)" : "rgba(148, 163, 184, 0.35)"}
              />
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-transparent text-[#cbd5e1] transition hover:bg-white/5 hover:text-[#f9fafb]"
                aria-label={t("closeAria")}
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
          </div>
        </header>

        <div className="relative grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] md:items-stretch">
          <aside className="space-y-4">
            <section className="mashwar-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                  {t("prompt")}
                </p>
                <div className="inline-flex rounded-full border border-[#2d3139] bg-transparent p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("text")}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      mode === "text"
                        ? "bg-[#3b82f6] text-white"
                        : "text-[#94a3b8] hover:text-[#f9fafb]"
                    }`}
                  >
                    {t("modeText")}
                  </button>
                  <button
                    type="button"
                    onClick={handleUseVoice}
                    disabled={isListening || isParsing}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-[#94a3b8] transition hover:text-[#f9fafb] disabled:cursor-wait disabled:opacity-55"
                  >
                    <IconMic />
                    {t("modeVoice")}
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
                placeholder={t("placeholder")}
                className="mt-3 min-h-[128px] w-full resize-none rounded-[8px] border border-[#2d3139] bg-transparent px-4 py-3 text-[16px] leading-7 text-[#f9fafb] outline-none transition placeholder:text-[#64748b] focus:border-[#3b82f6] focus:ring-4 focus:ring-[#3b82f6]/12"
              />

              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <button
                  type="button"
                  onClick={() => handleGenerateReport()}
                  disabled={isParsing || isListening}
                  className="h-11 rounded-[8px] bg-[#3b82f6] px-4 text-sm font-semibold text-white transition hover:bg-[#4f8df7] disabled:cursor-wait disabled:opacity-55"
                >
                  {isParsing ? t("generating") : t("generate")}
                </button>

                <button
                  type="button"
                  onClick={handleUseVoice}
                  disabled={isListening || isParsing}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-[#2d3139] bg-transparent px-4 text-sm text-[#e5e7eb] transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-55"
                >
                  <IconMic />
                  {t("modeVoice")}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Pill
                  label={
                    result
                      ? t("parsedConfidence", { value: parsedConfidence })
                      : t("awaitingParse")
                  }
                  text="#cbd5e1"
                  bg="rgba(148, 163, 184, 0.12)"
                  border="rgba(148, 163, 184, 0.24)"
                />
                <Pill
                  label={currentLocation ? t("fallbackLocation") : t("noFallbackLocation")}
                  text={currentLocation ? "#86efac" : "#fbbf24"}
                  bg={currentLocation ? "rgba(34, 197, 94, 0.12)" : "rgba(245, 158, 11, 0.12)"}
                  border={currentLocation ? "rgba(34, 197, 94, 0.35)" : "rgba(245, 158, 11, 0.35)"}
                />
              </div>
            </section>

            <section className="mashwar-panel p-4">
              <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                {t("examplesTitle")}
              </p>
              <div className="mt-3 space-y-2 text-[13px] leading-6 text-[#94a3b8]">
                <p>• {t("example1")}</p>
                <p>• {t("example2")}</p>
                <p>• {t("example3")}</p>
              </div>
            </section>
          </aside>

          <section className="mashwar-panel flex min-h-[min(52vh,20rem)] flex-1 flex-col overflow-hidden md:h-full md:min-h-[min(60vh,26rem)]">
            <div
              className={`mashwar-scroll flex min-h-0 flex-1 flex-col overflow-y-auto ${isParsing ? "p-0" : "p-4"}`}
            >
              {isParsing ? (
                <RouteLoadingCard
                  layout="panel"
                  messageNamespace="nlRoute.loadingModal"
                  withStatusRole
                  className="bg-transparent"
                />
              ) : error ? (
                <div className="flex min-h-[18rem] items-center justify-center rounded-[12px] border border-dashed border-[#2d3139] bg-white/[0.03] px-5 text-center">
                  <div className="max-w-md">
                    <p className="text-[18px] font-semibold text-[#f9fafb]">{t("requestFailed")}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">
                      {error === NL_EMPTY_PROMPT_SENTINEL
                        ? tErrors("nlEmptyPrompt")
                        : translateServiceError(error, tErrors)}
                    </p>
                  </div>
                </div>
              ) : result && result.kind === "clarification" ? (
                <div className="space-y-4">
                  <section className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-4">
                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.3em] text-[#6b7280]">
                      {t("clarificationKicker")}
                    </p>
                    <h3 className="mt-2 text-[22px] font-semibold text-[#f9fafb]">{t("clarificationTitle")}</h3>
                    <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">
                      {result.message}
                    </p>
                  </section>
                </div>
              ) : result && result.kind === "error" ? (
                <div className="flex min-h-[18rem] items-center justify-center rounded-[12px] border border-dashed border-[#2d3139] bg-white/[0.03] px-5 text-center">
                  <div className="max-w-md">
                    <p className="text-[18px] font-semibold text-[#f9fafb]">{t("errorTitle")}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">
                      {result.message}
                    </p>
                  </div>
                </div>
              ) : result && result.kind === "route" ? (
                <div className="space-y-4">
                  <section className="rounded-[12px] border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.32em] text-[#6b7280]">
                          {t("routeIntent")}
                        </p>
                        <h3 className="mt-2 text-[22px] font-semibold text-[#f9fafb]">
                          {formatRouteTitle(result.resolution, t)}
                        </h3>
                        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#94a3b8]">
                          {result.parse.entities.wantsSimulation ? t("routeSimulated") : t("routeSingle")}
                        </p>
                      </div>

                      <Pill
                        label={t("confidenceLine", {
                          value: formatPercent(result.parse.confidence, tCommon),
                        })}
                        text="#cbd5e1"
                        bg="rgba(148, 163, 184, 0.12)"
                        border="rgba(148, 163, 184, 0.24)"
                      />
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("origin")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {result.resolution.originLabel}
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("destination")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {result.resolution.destinationLabel}
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("departure")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {formatDateTimeLabel(result.resolution.departAt)}
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("smartEta")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {formatDateTimeLabel(result.resolution.route.mainRoute?.smartEtaDateTime ?? null)}
                        </p>
                      </div>
                    </div>
                  </section>

                  {result.resolution.simulations.length > 0 ? (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                            {t("whatIf")}
                          </p>
                          <h4 className="mt-1 text-[18px] font-semibold text-[#f9fafb]">{t("departureWindows")}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => onApplyRoute?.(result.resolution)}
                          className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#2d3139] bg-transparent px-4 text-[12px] font-semibold text-[#e5e7eb] transition hover:bg-white/5 hover:text-[#f9fafb]"
                        >
                          {t("applyOnMap")}
                        </button>
                      </div>

                      <div className="space-y-3">
                        {result.resolution.simulations.map((window) => (
                          <RouteWindowCard
                            key={`${window.label}-${window.departAt}`}
                            title={window.label}
                            departAt={window.departAt}
                            route={window.routes.mainRoute}
                          />
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                            {t("routeResult")}
                          </p>
                          <h4 className="mt-1 text-[18px] font-semibold text-[#f9fafb]">{t("mainRoute")}</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => onApplyRoute?.(result.resolution)}
                          className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#2d3139] bg-transparent px-4 text-[12px] font-semibold text-[#e5e7eb] transition hover:bg-white/5 hover:text-[#f9fafb]"
                        >
                          {t("applyOnMap")}
                        </button>
                      </div>
                      <RouteWindowCard
                        title={t("liveRoute")}
                        departAt={result.resolution.departAt ?? new Date().toISOString()}
                        route={result.resolution.route.mainRoute}
                      />
                    </section>
                  )}
                </div>
              ) : result && result.kind === "checkpoint" ? (
                <div className="space-y-4">
                  <section className="rounded-[12px] border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.32em] text-[#6b7280]">
                          {t("checkpointIntent")}
                        </p>
                        <h3 className="mt-2 text-[22px] font-semibold text-[#f9fafb]">
                          {result.resolution.checkpoint.name}
                        </h3>
                        <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">
                          {result.resolution.checkpoint.city ?? t("unknownCity")}
                          {result.resolution.checkpoint.alertText
                            ? ` · ${result.resolution.checkpoint.alertText}`
                            : ""}
                        </p>
                      </div>

                      <StatusBadge
                        status={result.resolution.currentStatusLabel as MapCheckpointStatus}
                      />
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("mode")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {result.resolution.mode.toUpperCase()}
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("targetTime")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {formatDateTimeLabel(result.resolution.targetDateTime)}
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("currentStatus")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {safeCheckpointFlowLabel(result.resolution.currentStatusLabel, tFlow)}
                        </p>
                      </div>
                      <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                          {t("confidence")}
                        </p>
                        <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                          {parsedConfidence}
                        </p>
                      </div>
                    </div>
                  </section>

                  {result.resolution.travelWindow ||
                  result.resolution.forecast?.travelWindow ? (
                    <section className="space-y-3">
                      <div>
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                          {t("travelWindow")}
                        </p>
                        <h4 className="mt-1 text-[18px] font-semibold text-[#f9fafb]">{t("travelWindowTitle")}</h4>
                      </div>

                      {buildTravelWindowEntries(
                        result.resolution.travelWindow ??
                          result.resolution.forecast?.travelWindow ??
                          null,
                        tTravelHeadline,
                      ).length > 0 ? (
                        <div className="space-y-3">
                          {buildTravelWindowEntries(
                            result.resolution.travelWindow ??
                              result.resolution.forecast?.travelWindow ??
                              null,
                            tTravelHeadline,
                          ).map((entry) => {
                            const status =
                              entry.kind === "best"
                                ? entry.item?.leavingPrediction?.predictedStatus ??
                                  entry.item?.enteringPrediction?.predictedStatus ??
                                  "غير معروف"
                                : entry.item?.leavingPrediction?.predictedStatus ??
                                  entry.item?.enteringPrediction?.predictedStatus ??
                                  "غير معروف";
                            const visual =
                              STATUS_VISUALS[status as MapCheckpointStatus] ??
                              STATUS_VISUALS["غير معروف"];

                            return (
                              <article
                                key={entry.kind}
                                className="rounded-[16px] border border-[#2d3139] bg-white/[0.03] p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.26em] text-[#6b7280]">
                                      {entry.kind === "best"
                                        ? t("travelKindBestShort")
                                        : t("travelKindWorstShort")}
                                    </p>
                                    <h5 className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                      {entry.label}
                                    </h5>
                                  </div>
                                  <Pill
                                    label={entry.item?.windowLabel ?? tCommon("notAvailable")}
                                    text={visual.text}
                                    bg={visual.bg}
                                    border={visual.border}
                                  />
                                </div>

                                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                  <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                      {t("day")}
                                    </p>
                                    <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                      {entry.item?.dayOfWeek ?? tCommon("notAvailable")}
                                    </p>
                                  </div>
                                  <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                      {t("hour")}
                                    </p>
                                    <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                      {formatTravelWindowHour(entry.item?.hour ?? null, tCommon)}
                                    </p>
                                  </div>
                                  <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3 xl:col-span-2">
                                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                      {t("targetTime")}
                                    </p>
                                    <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                      {formatDateTimeLabel(
                                        entry.item?.targetDateTime ?? null,
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                  <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                      {t("entering")}
                                    </p>
                                    <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                      {entry.item?.enteringPrediction?.predictedStatus
                                        ? safeCheckpointFlowLabel(
                                            entry.item.enteringPrediction.predictedStatus,
                                            tFlow,
                                          )
                                        : tCommon("notAvailable")}
                                    </p>
                                    <p className="mt-1 text-[12px] text-[#94a3b8]">
                                      {t("confidenceInline", {
                                        value: formatPercent(
                                          entry.item?.enteringPrediction?.confidence ?? null,
                                          tCommon,
                                        ),
                                      })}
                                    </p>
                                  </div>
                                  <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                    <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                      {t("leaving")}
                                    </p>
                                    <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                      {entry.item?.leavingPrediction?.predictedStatus
                                        ? safeCheckpointFlowLabel(
                                            entry.item.leavingPrediction.predictedStatus,
                                            tFlow,
                                          )
                                        : tCommon("notAvailable")}
                                    </p>
                                    <p className="mt-1 text-[12px] text-[#94a3b8]">
                                      {t("confidenceInline", {
                                        value: formatPercent(
                                          entry.item?.leavingPrediction?.confidence ?? null,
                                          tCommon,
                                        ),
                                      })}
                                    </p>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-[12px] border border-dashed border-[#2d3139] bg-white/[0.03] px-4 py-3 text-[13px] text-[#94a3b8]">
                          {t("travelWindowMissing")}
                        </div>
                      )}

                      {result.resolution.travelWindow?.referenceTime ||
                      result.resolution.travelWindow?.scope ||
                      result.resolution.forecast?.travelWindow?.referenceTime ||
                      result.resolution.forecast?.travelWindow?.scope ? (
                        <div className="flex flex-wrap gap-2 text-[11px] text-[#94a3b8]">
                          <span className="rounded-full border border-[#2d3139] px-3 py-1">
                            {t("reference")}{" "}
                            {formatDateTimeLabel(
                              result.resolution.travelWindow?.referenceTime ??
                                result.resolution.forecast?.travelWindow?.referenceTime ??
                                null,
                            )}
                          </span>
                          <span className="rounded-full border border-[#2d3139] px-3 py-1">
                            {t("scope")}{" "}
                            {result.resolution.travelWindow?.scope ??
                              result.resolution.forecast?.travelWindow?.scope ??
                              tCommon("notAvailable")}
                          </span>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {result.resolution.forecast ? (
                    <section className="space-y-3">
                      <div>
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                          {t("forecastTimeline")}
                        </p>
                        <h4 className="mt-1 text-[18px] font-semibold text-[#f9fafb]">{t("forecastTimelineTitle")}</h4>
                      </div>

                      <div className="space-y-3">
                        {buildForecastRows(result.resolution.forecast).map((row) => (
                          <article
                            key={row.horizon}
                            className="rounded-[16px] border border-[#2d3139] bg-white/[0.03] p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="mashwar-mono text-[10px] uppercase tracking-[0.26em] text-[#6b7280]">
                                  {(() => {
                                    const sub = forecastHorizonSubkey(row.horizon);
                                    return sub === "unknown"
                                      ? tForecastH("unknown", { code: row.horizon })
                                      : tForecastH(sub);
                                  })()}
                                </p>
                                <h5 className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                  {formatDateTimeLabel(row.targetDateTime)}
                                </h5>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {row.entering ? (
                                  <StatusBadge status={row.entering.prediction.predictedStatus} />
                                ) : null}
                                {row.leaving ? (
                                  <StatusBadge status={row.leaving.prediction.predictedStatus} />
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                              {row.entering ? (
                                <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                  <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                    {t("entering")}
                                  </p>
                                  <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                    {safeCheckpointFlowLabel(row.entering.prediction.predictedStatus, tFlow)}
                                  </p>
                                  <p className="mt-1 text-[12px] text-[#94a3b8]">
                                    {t("confidenceInline", {
                                      value: formatPercent(row.entering.prediction.confidence, tCommon),
                                    })}
                                  </p>
                                </div>
                              ) : null}

                              {row.leaving ? (
                                <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                  <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                    {t("leaving")}
                                  </p>
                                  <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                    {safeCheckpointFlowLabel(row.leaving.prediction.predictedStatus, tFlow)}
                                  </p>
                                  <p className="mt-1 text-[12px] text-[#94a3b8]">
                                    {t("confidenceInline", {
                                      value: formatPercent(row.leaving.prediction.confidence, tCommon),
                                    })}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <section className="space-y-3">
                      <div>
                        <p className="mashwar-mono text-[10px] uppercase tracking-[0.28em] text-[#6b7280]">
                          {t("exactPrediction")}
                        </p>
                        <h4 className="mt-1 text-[18px] font-semibold text-[#f9fafb]">{t("exactPredictionTitle")}</h4>
                      </div>

                      <div className="space-y-3">
                        {result.resolution.predictions.map((prediction) => {
                          const visual =
                            STATUS_VISUALS[prediction.prediction.predictedStatus] ??
                            STATUS_VISUALS["غير معروف"];

                          return (
                            <article
                              key={prediction.request.statusType}
                              className="rounded-[16px] border border-[#2d3139] bg-white/[0.03] p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="mashwar-mono text-[10px] uppercase tracking-[0.26em] text-[#6b7280]">
                                    {prediction.request.statusType}
                                  </p>
                                  <h5 className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                    {safeCheckpointFlowLabel(
                                      prediction.prediction.predictedStatus,
                                      tFlow,
                                    )}
                                  </h5>
                                </div>
                                <Pill
                                  label={safeCheckpointFlowLabel(
                                    prediction.prediction.predictedStatus,
                                    tFlow,
                                  )}
                                  text={visual.text}
                                  bg={visual.bg}
                                  border={visual.border}
                                />
                              </div>

                              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                  <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                    {t("targetTime")}
                                  </p>
                                  <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                    {formatDateTimeLabel(
                                      prediction.prediction.targetDateTime,
                                    )}
                                  </p>
                                </div>
                                <div className="rounded-[12px] border border-[#2d3139] bg-white/[0.03] p-3">
                                  <p className="mashwar-mono text-[10px] uppercase tracking-[0.2em] text-[#6b7280]">
                                    {t("confidence")}
                                  </p>
                                  <p className="mt-2 text-[16px] font-semibold text-[#f9fafb]">
                                    {formatPercent(prediction.prediction.confidence, tCommon)}
                                  </p>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[18rem] items-center justify-center rounded-[12px] border border-dashed border-[#2d3139] bg-white/[0.03] px-5 text-center">
                  <div className="max-w-md">
                    <p className="text-[18px] font-semibold text-[#f9fafb]">{t("emptyTitle")}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[#94a3b8]">{t("emptySub")}</p>
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

function IconMic() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-4 w-4"
    >
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
      <path d="M9 20h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
