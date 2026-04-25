"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IoBarChart, IoChevronDown, IoClose, IoInformationCircleOutline } from "react-icons/io5";

import { translateServiceError } from "@/lib/i18n/translate-service-error";
import { fetchHardshipIndex } from "@/lib/services/hardship-index";
import type {
  HardshipCityRow,
  HardshipConfidence,
  HardshipIndexPayload,
  HardshipIndexWindowParam,
  HardshipSeverity,
} from "@/lib/types/hardship-index";

const RANGES: HardshipIndexWindowParam[] = ["7d", "14d", "30d", "all"];
const FILTERS: Array<HardshipSeverity | "all"> = ["all", "severe", "high", "moderate", "low"];

type Tone = { text: string; bg: string; border: string; meter: string };

function getSeverityTone(severity: HardshipSeverity): Tone {
  switch (severity) {
    case "low":
      return { text: "#14532d", bg: "rgba(34, 197, 94, 0.16)", border: "rgba(34, 197, 94, 0.45)", meter: "#16a34a" };
    case "moderate":
      return { text: "#854d0e", bg: "rgba(234, 179, 8, 0.18)", border: "rgba(234, 179, 8, 0.55)", meter: "#eab308" };
    case "high":
      return { text: "#9a3412", bg: "rgba(249, 115, 22, 0.2)", border: "rgba(249, 115, 22, 0.6)", meter: "#f97316" };
    case "severe":
      return { text: "#991b1b", bg: "rgba(239, 68, 68, 0.2)", border: "rgba(239, 68, 68, 0.6)", meter: "#ef4444" };
    default:
      return { text: "var(--clr-slate)", bg: "var(--glass-bg-mid)", border: "var(--glass-border)", meter: "var(--clr-slate)" };
  }
}

function rangeLabel(r: HardshipIndexWindowParam, t: ReturnType<typeof useTranslations<"hardshipIndex">>): string {
  if (r === "7d") return t("range7d");
  if (r === "14d") return t("range14d");
  if (r === "30d") return t("range30d");
  return t("rangeAll");
}

function severityLabel(severity: HardshipSeverity, t: ReturnType<typeof useTranslations<"hardshipIndex">>): string {
  if (!severity) return t("severity.unknown");
  return t(`severity.${severity}`);
}

function confidenceLabel(confidence: HardshipConfidence, t: ReturnType<typeof useTranslations<"hardshipIndex">>): string {
  return t(`confidence.${confidence}`);
}

function regionLabel(region: string, t: ReturnType<typeof useTranslations<"hardshipIndex">>): string {
  const key = region.trim().toLowerCase().replace(/\s+/g, "_");
  if (key === "north") return t("region.north");
  if (key === "center" || key === "central") return t("region.center");
  if (key === "south") return t("region.south");
  return t("region.fallback", { name: region });
}

function formatScore(value: number | null, formatInt: (n: number) => string, tCommon: ReturnType<typeof useTranslations<"common">>): string {
  if (value === null) return tCommon("notAvailable");
  return formatInt(value);
}

function trendType(value: number | null): "up" | "down" | "flat" {
  if (value === null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

function meterWidth(value: number, max = 100): string {
  const clamped = Math.min(max, Math.max(0, value));
  return `${(clamped / max) * 100}%`;
}

function arabicCountLabel(count: number, singular: string, dual: string, plural: string): string {
  if (count === 1) return `${count} ${singular}`;
  if (count === 2) return `${count} ${dual}`;
  if (count >= 3 && count <= 10) return `${count} ${plural}`;
  return `${count} ${singular}`;
}

function formatEstimatedTime(
  minutes: number,
  numberLocale: string,
  t: ReturnType<typeof useTranslations<"hardshipIndex">>,
  isRtl: boolean,
): string {
  const safeMinutes = Math.max(0, minutes);
  const hours = safeMinutes / 60;
  const formattedHours = new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(hours);
  if (isRtl) {
    if (hours >= 24) {
      const days = new Intl.NumberFormat(numberLocale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(hours / 24);
      return `${days} يوم / شخص`;
    }
    return `${formattedHours} ساعات / شخص`;
  }
  if (hours >= 24) {
    return t("timePersonDays", { value: new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(hours / 24) });
  }
  return t("timePersonHours", { value: formattedHours });
}

function estimatePerPersonBurdenMinutes(payload: HardshipIndexPayload): number | null {
  const withBurden = payload.cities.filter(
    (city) =>
      city.score !== null &&
      city.experimental_relative_burden !== null &&
      city.sample_count > 0,
  );
  if (withBurden.length === 0) {
    return null;
  }

  let weightedBurden = 0;
  let weightedSamples = 0;

  for (const city of withBurden) {
    const coverageFactor = 0.6 + Math.min(1, Math.max(0, city.coverage_ratio)) * 0.4;
    const cityWeightedSamples = city.sample_count * coverageFactor;
    weightedSamples += cityWeightedSamples;
    weightedBurden += cityWeightedSamples * (city.experimental_relative_burden ?? 0);
  }

  if (weightedBurden <= 0 || weightedSamples <= 0) {
    return null;
  }

  const averageBurdenPerSample = weightedBurden / weightedSamples;
  const summaryBurdenPerSample = payload.summary.total_experimental_relative_burden / weightedSamples;

  // Calibration anchor: burden parity ~= 1.24 hours/person.
  const anchorMinutes = 1.24 * 60;
  const burdenRatio = averageBurdenPerSample > 0 ? summaryBurdenPerSample / averageBurdenPerSample : 1;
  return anchorMinutes * burdenRatio;
}

function KpiCard({
  label,
  value,
  hint,
  featured = false,
}: {
  label: string;
  value: string;
  hint: string;
  featured?: boolean;
}) {
  return (
    <article
      className={`rounded-[var(--radius-md)] border p-3.5 md:p-4 ${
        featured
          ? "border-[rgba(34,197,94,0.45)] bg-[linear-gradient(180deg,rgba(22,101,52,0.24)_0%,rgba(10,25,39,0.78)_100%)]"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-mid)]"
      }`}
    >
      <p className={`mashwar-arabic text-[11px] font-semibold ${featured ? "text-[#bbf7d0]" : "text-[var(--clr-slate)]"}`}>{label}</p>
      <p className={`mashwar-arabic mt-1.5 font-bold leading-snug ${featured ? "text-[17px] text-white md:text-[18px]" : "text-[15px] text-[var(--clr-white)]"}`}>
        {value}
      </p>
      <p className={`mashwar-arabic mt-2 text-[11px] leading-relaxed ${featured ? "text-[#dcfce7]" : "text-[var(--clr-slate)]"}`}>{hint}</p>
    </article>
  );
}

function MiniMeter({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-[var(--glass-bg)]">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: meterWidth(value), backgroundColor: color }} />
    </div>
  );
}

export default function HardshipIndexFeature() {
  const locale = useLocale();
  const t = useTranslations("hardshipIndex");
  const tFloat = useTranslations("home.floating");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");

  const [range, setRange] = useState<HardshipIndexWindowParam>("7d");
  const [severityFilter, setSeverityFilter] = useState<HardshipSeverity | "all">("all");
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [showRegionMapInfo, setShowRegionMapInfo] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [payload, setPayload] = useState<HardshipIndexPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRtl = locale === "ar";
  const numberLocale = isRtl ? "ar-PS" : "en-US";

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await fetchHardshipIndex(range);
        if (!cancelled) {
          setPayload(data);
          setExpandedCity(null);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(translateServiceError(message, tErrors));
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modalOpen, range, tErrors]);

  const formatInt = (n: number) => new Intl.NumberFormat(numberLocale).format(Math.round(n));
  const formatPercent = (v: number) => tCommon("percent", { value: String(Math.round(v * 100)) });
  const estimatedTimeLost = useMemo(() => {
    if (!payload) return null;
    return estimatePerPersonBurdenMinutes(payload);
  }, [payload]);

  const rankedCities = useMemo(() => {
    if (!payload) return [];
    const sorted = [...payload.cities].sort((a, b) => {
      if (a.score === null && b.score === null) return a.city.localeCompare(b.city, locale);
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    });
    if (severityFilter === "all") return sorted;
    return sorted.filter((c) => c.severity === severityFilter);
  }, [payload, severityFilter, locale]);

  const noData = payload && payload.cities.length === 0 && payload.regions.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        title={tFloat("hardshipTitle")}
        aria-label={tFloat("hardshipAria")}
        className={`group inline-flex w-full items-center gap-2 rounded-full border px-2 py-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.28)] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green-bright)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--clr-white)] active:scale-[0.98] ${
          isRtl ? "justify-start" : "justify-end"
        } border-[var(--clr-green)]/55 bg-[rgba(0,98,51,0.28)] text-[var(--clr-green-soft)] hover:border-[var(--clr-green)]/75 hover:bg-[rgba(0,98,51,0.36)]`}
        dir={isRtl ? "rtl" : "ltr"}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/22 ring-1 ring-white/18 transition duration-200 group-hover:bg-black/28" aria-hidden>
          <IoBarChart className="h-4 w-4 text-[var(--clr-green-bright)]" />
        </span>
        <span className={`mashwar-arabic min-w-0 shrink text-[10px] font-semibold leading-snug sm:text-[11px] ${isRtl ? "text-right" : "text-left"} text-[var(--clr-white)]`}>
          {tFloat("hardshipCta")}
        </span>
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 z-[2700]">
          <button type="button" aria-label={t("closeBackdropAria")} className="absolute inset-0 bg-[var(--clr-black)]/72 backdrop-blur-[var(--glass-blur)]" onClick={() => setModalOpen(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="hardship-index-title"
            aria-busy={loading}
            className="relative z-10 mx-auto flex max-h-[min(92dvh,900px)] w-[min(96vw,1180px)] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border-mid)] bg-[linear-gradient(180deg,rgba(7,14,23,0.98)_0%,rgba(7,14,23,0.93)_100%)] shadow-[var(--map-overlay-shadow)]"
            dir={isRtl ? "rtl" : "ltr"}
            style={{ marginTop: "max(0.75rem, env(safe-area-inset-top))", marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <header className="shrink-0 border-b border-[var(--glass-border)] px-4 pb-4 pt-4 md:px-6 md:pb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mashwar-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--clr-slate)]">{t("kickerMono")}</p>
                  <h2 id="hardship-index-title" className="mashwar-display mt-2 text-[clamp(1.2rem,2.2vw,1.7rem)] font-bold text-[var(--clr-white)]">
                    {t("dashboardTitle")}
                  </h2>
                  <p className="mashwar-arabic mt-2 max-w-4xl text-[13px] leading-[1.9] text-[var(--clr-sand)] md:text-[14px]">{t("dashboardSubtitle")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] text-[var(--clr-sand)] transition hover:border-[var(--clr-border-bright)] hover:text-[var(--clr-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green)]/40"
                  aria-label={t("closeButtonAria")}
                >
                  <IoClose className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    aria-pressed={range === r}
                    className={`mashwar-mono min-h-[36px] rounded-full border px-3.5 text-[10px] font-bold uppercase tracking-[0.08em] transition sm:text-[11px] ${
                      range === r
                        ? "border-transparent bg-[var(--clr-green)] text-white"
                        : "border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--clr-sand)] hover:border-[var(--clr-slate)] hover:text-[var(--clr-white)]"
                    }`}
                  >
                    {rangeLabel(r, t)}
                  </button>
                ))}
                <span className="mashwar-arabic ms-auto text-[11px] text-[var(--clr-slate)]">
                  {t("selectedWindow", { window: rangeLabel(range, t) })}
                </span>
              </div>

              {payload ? (
                <div className="mt-4 grid gap-2.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[rgba(15,23,42,0.45)] p-3 md:grid-cols-3">
                  <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-2.5">
                    <p className="mashwar-arabic text-[10px] text-[var(--clr-slate)]">{t("storyNowLabel")}</p>
                    <p className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                      {t("storyNowValue", {
                        city: payload.summary.worst_city ?? tCommon("notAvailable"),
                      })}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-2.5">
                    <p className="mashwar-arabic text-[10px] text-[var(--clr-slate)]">{t("storyImpactLabel")}</p>
                    <p className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                      {estimatedTimeLost === null
                        ? tCommon("notAvailable")
                        : formatEstimatedTime(estimatedTimeLost, numberLocale, t, isRtl)}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-2.5">
                    <p className="mashwar-arabic text-[10px] text-[var(--clr-slate)]">{t("storyWindowLabel")}</p>
                    <p className="mashwar-arabic mt-1 text-[13px] font-semibold text-[var(--clr-white)]">
                      {t("storyWindowValue", { window: rangeLabel(range, t) })}
                    </p>
                  </div>
                </div>
              ) : null}
            </header>

            <div className="mashwar-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
              {loading && !payload ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div key={idx} className="h-24 animate-pulse rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]" />
                  ))}
                </div>
              ) : error ? (
                <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--clr-red)]/30 bg-[var(--clr-red-soft)] px-4 py-3 text-[13px] leading-relaxed text-[#fecaca]">
                  {error}
                </div>
              ) : payload ? (
                <div className="space-y-6">
                  {loading ? <p className="mashwar-arabic text-center text-[12px] text-[var(--clr-slate)]">{t("refreshing")}</p> : null}

                  <section aria-label={t("topSignalsTitle")}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h3 className="mashwar-display text-[14px] font-bold text-[var(--clr-white)]">{t("topSignalsTitle")}</h3>
                      <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]">{t("topSignalsHint")}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                      <div className="xl:col-span-5">
                        <KpiCard
                          featured
                          label={t("kpiRelativeBurden")}
                          value={
                            estimatedTimeLost === null
                              ? tCommon("notAvailable")
                              : formatEstimatedTime(estimatedTimeLost, numberLocale, t, isRtl)
                          }
                          hint={t("kpiRelativeBurdenHint", {
                            raw: formatInt(payload.summary.total_experimental_relative_burden),
                          })}
                        />
                      </div>
                      <div className="grid gap-3 xl:col-span-7 md:grid-cols-2">
                        <KpiCard label={t("kpiWorstCity")} value={payload.summary.worst_city ?? tCommon("notAvailable")} hint={t("kpiWorstCityHint")} />
                        <KpiCard label={t("kpiClosureCheckpoint")} value={payload.summary.highest_closure_checkpoint ?? tCommon("notAvailable")} hint={t("kpiClosureCheckpointHint")} />
                        <KpiCard label={t("kpiVolatileCheckpoint")} value={payload.summary.most_volatile_checkpoint ?? tCommon("notAvailable")} hint={t("kpiVolatileCheckpointHint")} />
                        <KpiCard label={t("kpiWindow")} value={payload.window} hint={t("kpiWindowHint")} />
                      </div>
                    </div>
                  </section>

                  {payload.regions.length > 0 ? (
                    <section aria-labelledby="regions-heading">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 id="regions-heading" className="mashwar-display text-[14px] font-bold uppercase tracking-[0.08em] text-[var(--clr-slate)]">
                          {t("regionOverviewTitle")}
                        </h3>
                        <div className="flex items-center gap-2">
                          <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]">{t("tooltipPopulationWeighted")}</p>
                          <button
                            type="button"
                            onClick={() => setShowRegionMapInfo((curr) => !curr)}
                            aria-expanded={showRegionMapInfo}
                            aria-label={t("regionMapInfoButton")}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--clr-slate)] transition hover:text-[var(--clr-white)]"
                          >
                            <IoInformationCircleOutline className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </div>
                      {showRegionMapInfo ? (
                        <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
                          <p className="mashwar-arabic text-[12px] leading-relaxed text-[var(--clr-sand)]">{t("regionMapInfoHint")}</p>
                          <div className="mt-2 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[rgba(37,99,235,0.18)] px-3 py-2 text-center">
                              <p className="mashwar-arabic text-[12px] font-semibold text-white">{t("region.north")}</p>
                              <p className="mashwar-arabic mt-1 text-[10px] text-[#bfdbfe]">{t("regionMapNorthHint")}</p>
                            </div>
                            <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[rgba(16,185,129,0.18)] px-3 py-2 text-center">
                              <p className="mashwar-arabic text-[12px] font-semibold text-white">{t("region.center")}</p>
                              <p className="mashwar-arabic mt-1 text-[10px] text-[#a7f3d0]">{t("regionMapCenterHint")}</p>
                            </div>
                            <div className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[rgba(249,115,22,0.18)] px-3 py-2 text-center">
                              <p className="mashwar-arabic text-[12px] font-semibold text-white">{t("region.south")}</p>
                              <p className="mashwar-arabic mt-1 text-[10px] text-[#fed7aa]">{t("regionMapSouthHint")}</p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div className="grid gap-3 lg:grid-cols-3">
                        {payload.regions.map((region) => {
                          const tone = getSeverityTone(region.severity);
                          const coveragePct = region.city_count > 0 ? (region.active_city_count / region.city_count) * 100 : 0;
                          return (
                            <article key={region.region} className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] p-4">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="mashwar-arabic text-[16px] font-bold text-[var(--clr-white)]">{regionLabel(region.region, t)}</h4>
                                <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ color: tone.text, backgroundColor: tone.bg, borderColor: tone.border }}>
                                  {severityLabel(region.severity, t)}
                                </span>
                              </div>
                              <div className="mt-3 flex items-end justify-between gap-3">
                                <p className="mashwar-mono text-[28px] font-bold tabular-nums text-[var(--clr-white)]" dir="ltr">
                                  {formatScore(region.score, formatInt, tCommon)}
                                </p>
                                <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]">
                                  {t("populationWeightedShort")}{" "}
                                  <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                    {formatScore(region.population_weighted_score, formatInt, tCommon)}
                                  </span>
                                </p>
                              </div>
                              <div className="mt-2 h-2.5 rounded-full bg-[var(--glass-bg)]">
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: meterWidth(region.score ?? 0), backgroundColor: tone.meter }} />
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-2">
                                  <p className="mashwar-arabic text-[var(--clr-slate)]">{t("regionHighestPressureCity")}</p>
                                  <p className="mashwar-arabic mt-1 font-semibold text-[var(--clr-white)]">{region.worst_city ?? tCommon("notAvailable")}</p>
                                </div>
                                <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-2">
                                  <p className="mashwar-arabic text-[var(--clr-slate)]">{t("regionCoverage")}</p>
                                  <p className="mashwar-mono mt-1 font-semibold text-[var(--clr-white)]" dir="ltr">
                                    {formatInt(region.active_city_count)}/{formatInt(region.city_count)} ({Math.round(coveragePct)}%)
                                  </p>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  <section aria-labelledby="city-ranking-heading">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 id="city-ranking-heading" className="mashwar-display text-[14px] font-bold uppercase tracking-[0.08em] text-[var(--clr-slate)]">
                        {t("cityRankingTitle")}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {FILTERS.map((filter) => (
                          <button
                            key={filter ?? "unknown"}
                            type="button"
                            onClick={() => setSeverityFilter(filter)}
                            className={`mashwar-arabic rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                              severityFilter === filter
                                ? "border-transparent bg-[var(--clr-green)] text-white"
                                : "border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--clr-sand)] hover:text-[var(--clr-white)]"
                            }`}
                          >
                            {filter === "all" ? t("filterAll") : severityLabel(filter, t)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {rankedCities.length === 0 ? (
                      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-6 text-center">
                        <p className="mashwar-arabic text-[13px] text-[var(--clr-slate)]">{t("noFilteredCities")}</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {rankedCities.map((city, idx) => {
                          const tone = getSeverityTone(city.severity);
                          const isSelected = expandedCity === city.city;
                          const trend = trendType(city.trend);
                          const trendText =
                            trend === "up"
                              ? t("trendWorsening", { value: city.trend ? `+${city.trend.toFixed(1)}` : "+0" })
                              : trend === "down"
                                ? t("trendImproving", { value: city.trend ? city.trend.toFixed(1) : "0" })
                                : t("trendNeutral");
                          const noScore = city.score === null;

                          return (
                            <article
                              key={city.city}
                              className={`rounded-[var(--radius-md)] border p-3.5 md:p-4 ${
                                noScore
                                  ? "border-dashed border-[var(--glass-border)] bg-[rgba(15,23,42,0.35)] opacity-70"
                                  : "border-[var(--glass-border)] bg-[var(--glass-bg-mid)]"
                              }`}
                            >
                              <button
                                type="button"
                                className="w-full text-start"
                                onClick={() => setExpandedCity((curr) => (curr === city.city ? null : city.city))}
                                aria-expanded={isSelected}
                              >
                                <div className="flex flex-wrap items-start gap-2.5">
                                  <div className="mashwar-mono flex h-7 w-7 items-center justify-center rounded-full bg-[var(--glass-bg)] text-[11px] font-bold text-[var(--clr-slate)]" dir="ltr">
                                    {idx + 1}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="mashwar-arabic truncate text-[16px] font-bold text-[var(--clr-white)]">{city.city}</h4>
                                      {noScore ? (
                                        <span className="mashwar-arabic rounded-full border border-dashed border-[var(--glass-border)] px-2 py-0.5 text-[10px] text-[var(--clr-slate)]">
                                          {t("noUsableData")}
                                        </span>
                                      ) : (
                                        <span className="inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: tone.text, backgroundColor: tone.bg, borderColor: tone.border }}>
                                          {severityLabel(city.severity, t)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                                      <p className="mashwar-arabic text-[var(--clr-slate)]">
                                        {t("cityScore")}{" "}
                                        <span className="mashwar-mono font-bold text-[var(--clr-white)]" dir="ltr">
                                          {formatScore(city.score, formatInt, tCommon)}
                                        </span>
                                      </p>
                                      <p className="mashwar-arabic text-[var(--clr-slate)]">
                                        {t("cityTrendLabel")}{" "}
                                        <span className={trend === "up" ? "text-[#f87171]" : trend === "down" ? "text-[#4ade80]" : "text-[var(--clr-sand)]"}>
                                          {trendText}
                                        </span>
                                      </p>
                                      <p className="mashwar-arabic text-[var(--clr-slate)]">
                                        {t("cityConfidenceLabel")}{" "}
                                        <span className="font-semibold text-[var(--clr-white)]">{confidenceLabel(city.confidence, t)}</span>
                                      </p>
                                      <p className="mashwar-arabic text-[var(--clr-slate)]">
                                        {t("cityCoverageLabel")}{" "}
                                        <span className="mashwar-mono font-semibold text-[var(--clr-white)]" dir="ltr">
                                          {Math.round(city.coverage_ratio * 100)}%
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-[var(--clr-slate)]">
                                    <IoChevronDown className={`h-5 w-5 transition ${isSelected ? "rotate-180" : ""}`} />
                                  </div>
                                </div>
                              </button>

                              <div className="mt-2 h-2 rounded-full bg-[var(--glass-bg)]">
                                <div className="h-full rounded-full transition-all duration-300" style={{ width: meterWidth(city.score ?? 0), backgroundColor: tone.meter }} />
                              </div>

                              <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
                                <p className="mashwar-arabic text-[var(--clr-slate)]">
                                  {t("cityCheckpoints")}{" "}
                                  <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                    {formatInt(city.active_checkpoint_count)}/{formatInt(city.total_checkpoint_count)}
                                  </span>
                                </p>
                                <p className="mashwar-arabic text-[var(--clr-slate)]">
                                  {t("citySamplesLabel")}{" "}
                                  <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                    {formatInt(city.sample_count)}
                                  </span>
                                </p>
                                <p className="mashwar-arabic text-[var(--clr-slate)]">
                                  {t("cityRelativeBurden")}{" "}
                                  <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                    {city.experimental_relative_burden === null ? tCommon("notAvailable") : formatInt(city.experimental_relative_burden)}
                                  </span>
                                </p>
                              </div>

                              {isSelected ? (
                                <div className="mt-3 space-y-3 border-t border-[var(--glass-border)] pt-3">
                                  <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-3">
                                    <p className="mashwar-arabic text-[12px] font-semibold text-[var(--clr-white)]">{t("confidenceTrustTitle")}</p>
                                    <p className="mashwar-arabic mt-1 text-[11px] leading-relaxed text-[var(--clr-slate)]">{t("confidenceTrustHint")}</p>
                                    <div className="mt-2 h-2 rounded-full bg-[rgba(255,255,255,0.08)]">
                                      <div className="h-full rounded-full bg-[var(--clr-green)]" style={{ width: `${Math.round(city.coverage_ratio * 100)}%` }} />
                                    </div>
                                    <p className="mashwar-arabic mt-1 text-[11px] text-[var(--clr-slate)]">
                                      {t("coverageTooltip")} {Math.round(city.coverage_ratio * 100)}%
                                    </p>
                                  </div>

                                  <div className="grid gap-2 md:grid-cols-3">
                                    <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-3 text-[11px]">
                                      <p className="mashwar-arabic text-[var(--clr-slate)]">{t("componentSampleWeighted")}</p>
                                      <p className="mashwar-mono mt-1 text-[var(--clr-white)]" dir="ltr">
                                        {city.score_components.sample_weighted_checkpoint_score === null ? tCommon("notAvailable") : formatInt(city.score_components.sample_weighted_checkpoint_score)}
                                      </p>
                                    </div>
                                    <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-3 text-[11px]">
                                      <p className="mashwar-arabic text-[var(--clr-slate)]">{t("componentTopDriverMean")}</p>
                                      <p className="mashwar-mono mt-1 text-[var(--clr-white)]" dir="ltr">
                                        {city.score_components.top_driver_mean_score === null ? tCommon("notAvailable") : formatInt(city.score_components.top_driver_mean_score)}
                                      </p>
                                    </div>
                                    <div className="rounded-[var(--radius-sm)] bg-[var(--glass-bg)] p-3 text-[11px]">
                                      <p className="mashwar-arabic text-[var(--clr-slate)]">{t("componentDistressedRatio")}</p>
                                      <p className="mashwar-mono mt-1 text-[var(--clr-white)]" dir="ltr">
                                        {city.score_components.distressed_checkpoint_ratio === null ? tCommon("notAvailable") : formatPercent(city.score_components.distressed_checkpoint_ratio)}
                                      </p>
                                    </div>
                                  </div>

                                  <div>
                                    <p className="mashwar-arabic mb-2 text-[12px] font-semibold text-[var(--clr-white)]">{t("topDriversHeading")}</p>
                                    {city.top_drivers.length === 0 ? (
                                      <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]">{t("noTopDrivers")}</p>
                                    ) : (
                                      <div className="space-y-2">
                                        {city.top_drivers.map((driver) => (
                                          <div key={`${city.city}-${driver.checkpoint_id}`} className="rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                              <p className="mashwar-arabic text-[13px] font-semibold text-[var(--clr-white)]">{driver.checkpoint_name}</p>
                                              <p className="mashwar-arabic text-[11px] text-[var(--clr-slate)]">
                                                {t("driverImpact")}{" "}
                                                <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                                  {formatInt(driver.impact_score)}
                                                </span>
                                              </p>
                                            </div>
                                            <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-3">
                                              <div>
                                                <p className="mashwar-arabic mb-1 text-[var(--clr-slate)]">{t("driverClosure")}</p>
                                                <MiniMeter value={driver.closure_rate * 100} color="#ef4444" />
                                              </div>
                                              <div>
                                                <p className="mashwar-arabic mb-1 text-[var(--clr-slate)]">{t("driverCongestion")}</p>
                                                <MiniMeter value={driver.congestion_rate * 100} color="#f97316" />
                                              </div>
                                              <div>
                                                <p className="mashwar-arabic mb-1 text-[var(--clr-slate)]">{t("driverVolatility")}</p>
                                                <MiniMeter value={Math.min(driver.volatility_score * 100, 100)} color="#eab308" />
                                              </div>
                                            </div>
                                            <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
                                              <p className="mashwar-arabic text-[var(--clr-slate)]">
                                                {t("driverScore")}{" "}
                                                <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                                  {formatInt(driver.score)}
                                                </span>
                                              </p>
                                              <p className="mashwar-arabic text-[var(--clr-slate)]">
                                                {t("driverImpact")}{" "}
                                                <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                                  {formatInt(driver.impact_score)}
                                                </span>
                                              </p>
                                              <p className="mashwar-arabic text-[var(--clr-slate)]">
                                                {t("driverSamples")}{" "}
                                                <span className="mashwar-mono text-[var(--clr-white)]" dir="ltr">
                                                  {formatInt(driver.sample_count)}
                                                </span>
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {noData ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-8 text-center">
                      <p className="mashwar-arabic text-[14px] font-semibold text-[var(--clr-white)]">{t("emptyTitle")}</p>
                      <p className="mashwar-arabic mt-2 text-[12px] text-[var(--clr-slate)]">{t("emptyBody")}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
