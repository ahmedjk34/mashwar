"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IoBarChart, IoClose } from "react-icons/io5";

import { fetchHardshipIndex } from "@/lib/services/hardship-index";
import { translateServiceError } from "@/lib/i18n/translate-service-error";
import type { HardshipIndexPayload, HardshipIndexWindowParam } from "@/lib/types/hardship-index";
import { formatDateTimeInPalestine } from "@/lib/utils/palestine-time";

const RANGES: HardshipIndexWindowParam[] = ["7d", "14d", "30d", "all"];

function severityTone(
  severity: string,
): { text: string; bg: string; border: string } {
  const s = severity.toLowerCase();
  if (s === "low") {
    return {
      text: "var(--risk-low)",
      bg: "var(--risk-low-bg)",
      border: "rgba(0, 166, 81, 0.35)",
    };
  }
  if (s === "high") {
    return {
      text: "var(--risk-high)",
      bg: "var(--risk-high-bg)",
      border: "rgba(238, 42, 53, 0.35)",
    };
  }
  return {
    text: "var(--risk-med)",
    bg: "var(--risk-med-bg)",
    border: "rgba(245, 158, 11, 0.35)",
  };
}

function translateRegionToken(
  region: string,
  t: ReturnType<typeof useTranslations<"hardshipIndex">>,
): string {
  const k = region.trim().toLowerCase().replace(/\s+/g, "_");
  switch (k) {
    case "north":
      return t("region.north");
    case "south":
      return t("region.south");
    case "east":
      return t("region.east");
    case "west":
      return t("region.west");
    case "center":
    case "central":
      return t("region.center");
    case "west_bank":
      return t("region.west_bank");
    case "jerusalem":
      return t("region.jerusalem");
    default:
      return t("region.fallback", { name: region });
  }
}

function translateSeverity(
  severity: string,
  t: ReturnType<typeof useTranslations<"hardshipIndex">>,
): string {
  const k = severity.trim().toLowerCase();
  switch (k) {
    case "low":
      return t("severity.low");
    case "medium":
      return t("severity.medium");
    case "high":
      return t("severity.high");
    default:
      return t("severity.unknown");
  }
}

function translateConfidence(
  confidence: string,
  t: ReturnType<typeof useTranslations<"hardshipIndex">>,
): string {
  const k = confidence.trim().toLowerCase();
  switch (k) {
    case "low":
      return t("confidence.low");
    case "medium":
      return t("confidence.medium");
    case "high":
      return t("confidence.high");
    default:
      return t("confidence.unknown");
  }
}

function aggregateStats(payload: HardshipIndexPayload): {
  generalIndex: number | null;
  totalSamples: number;
  cityCount: number;
} {
  const scores = payload.cities.map((c) => c.score).filter((n) => Number.isFinite(n));
  let generalIndex: number | null = null;
  if (scores.length > 0) {
    generalIndex = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  } else if (payload.regions.length > 0) {
    const w = payload.regions
      .map((r) => r.population_weighted_score)
      .filter((n) => Number.isFinite(n));
    if (w.length > 0) {
      generalIndex = Math.round(w.reduce((a, b) => a + b, 0) / w.length);
    }
  }
  const totalSamples = payload.cities.reduce(
    (acc, c) => acc + (Number.isFinite(c.sample_count) ? c.sample_count : 0),
    0,
  );
  return {
    generalIndex,
    totalSamples,
    cityCount: payload.cities.length,
  };
}

export default function HardshipIndexFeature() {
  const locale = useLocale();
  const tFloat = useTranslations("home.floating");
  const t = useTranslations("hardshipIndex");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");

  const [range, setRange] = useState<HardshipIndexWindowParam>("7d");
  const [modalOpen, setModalOpen] = useState(false);
  const [payload, setPayload] = useState<HardshipIndexPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primaryDir: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";
  const numberLocale = locale === "ar" ? "ar-PS" : "en-US";

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await fetchHardshipIndex(range);
        if (!cancelled) {
          setPayload(data);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(translateServiceError(message, tErrors));
          setPayload(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modalOpen, range, tErrors]);

  const formattedGenerated = useMemo(() => {
    if (!payload?.generated_at) {
      return null;
    }
    return formatDateTimeInPalestine(payload.generated_at);
  }, [payload?.generated_at]);

  const stats = useMemo(() => (payload ? aggregateStats(payload) : null), [payload]);

  const formatInt = useCallback(
    (n: number) => new Intl.NumberFormat(numberLocale).format(Math.round(n)),
    [numberLocale],
  );

  const formatPct = useCallback(
    (rate: number) =>
      tCommon("percent", {
        value: String(Math.round(rate * 100)),
      }),
    [tCommon],
  );

  const formatTrend = useCallback(
    (value: number) => {
      if (!Number.isFinite(value) || value === 0) {
        return t("trendFlat");
      }
      const rounded = Math.round(value * 10) / 10;
      const sign = rounded > 0 ? "+" : "";
      return t("trendSigned", { value: `${sign}${rounded}` });
    },
    [t],
  );

  const rangeLabel = (r: HardshipIndexWindowParam) => {
    switch (r) {
      case "7d":
        return t("range7d");
      case "14d":
        return t("range14d");
      case "30d":
        return t("range30d");
      default:
        return t("rangeAll");
    }
  };

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={tFloat("hardshipTitle")}
        aria-label={tFloat("hardshipAria")}
        className={`group inline-flex w-full items-center gap-2 rounded-full border px-2 py-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.28)] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green-bright)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--clr-white)] active:scale-[0.98] motion-reduce:transition-none ${
          locale === "ar" ? "justify-start" : "justify-end"
        } border-[var(--clr-green)]/55 bg-[rgba(0,98,51,0.28)] text-[var(--clr-green-soft)] hover:border-[var(--clr-green)]/75 hover:bg-[rgba(0,98,51,0.36)]`}
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/22 ring-1 ring-white/18 transition duration-200 group-hover:bg-black/28"
          aria-hidden
        >
          <IoBarChart className="h-4 w-4 text-[var(--clr-green-bright)]" />
        </span>
        <span
          className={`mashwar-arabic min-w-0 shrink text-[10px] font-semibold leading-snug sm:text-[11px] ${
            locale === "ar" ? "text-right" : "text-left"
          } text-[var(--clr-white)]`}
        >
          {tFloat("hardshipCta")}
        </span>
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 z-[2700] motion-reduce:transition-none" aria-hidden={false}>
          <button
            type="button"
            aria-label={t("closeBackdropAria")}
            className="absolute inset-0 bg-[var(--clr-black)]/70 backdrop-blur-[var(--glass-blur)] transition-opacity duration-300 ease-out motion-reduce:transition-none"
            onClick={closeModal}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="hardship-index-title"
            aria-busy={loading}
            className="relative z-10 mx-auto flex max-h-[min(90dvh,860px)] w-[min(94vw,1040px)] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border-mid)] bg-[var(--glass-bg-raised)] shadow-[var(--map-overlay-shadow)] transition-all duration-300 ease-out motion-reduce:transition-none"
            style={{ marginTop: "max(0.75rem, env(safe-area-inset-top))", marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            dir={primaryDir}
          >
            <header className="relative shrink-0 border-b border-[var(--glass-border)] px-5 pb-4 pt-4 md:px-8 md:pb-5 md:pt-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 max-w-[min(100%,52rem)]">
                  <p className="mashwar-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--clr-slate)]">
                    {t("kickerMono")}
                  </p>
                  <h2
                    id="hardship-index-title"
                    className="mashwar-display mt-2 text-[clamp(1.35rem,3.6vw,1.85rem)] font-bold leading-tight text-[var(--clr-white)]"
                  >
                    {t("modalTitle")}
                  </h2>
                  <p className="mashwar-arabic mt-3 max-w-3xl text-[13px] leading-loose text-[var(--clr-sand)] md:text-[14px]">
                    {t("introResearch")}
                  </p>
                  {formattedGenerated ? (
                    <p className="mashwar-arabic mt-2 text-[12px] text-[var(--clr-slate)]">
                      {t("generatedLabel", { time: formattedGenerated })}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] text-[var(--clr-sand)] transition hover:border-[var(--clr-border-bright)] hover:text-[var(--clr-white)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green)]/40"
                  aria-label={t("closeButtonAria")}
                >
                  <IoClose className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div
                role="toolbar"
                aria-label={t("rangeToolbarAria")}
                className="mt-5 inline-flex w-full max-w-xl items-stretch gap-1 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1"
                dir="ltr"
              >
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                    className={`mashwar-mono min-h-[40px] min-w-0 flex-1 rounded-[var(--radius-sm)] px-2 py-2 text-[10px] font-bold uppercase tracking-[0.06em] transition duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--clr-green)]/40 sm:text-[11px] ${
                      range === r
                        ? "bg-[var(--clr-green)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                        : "text-[var(--clr-sand)] hover:bg-[var(--glass-bg-mid)] hover:text-[var(--clr-white)]"
                    }`}
                  >
                    {rangeLabel(r)}
                  </button>
                ))}
              </div>
            </header>

            <div className="mashwar-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 md:px-8 md:py-6">
              {loading && !payload ? (
                <p className="mashwar-arabic py-8 text-center text-[14px] text-[var(--clr-sand)]">
                  {t("loading")}
                </p>
              ) : error ? (
                <div
                  role="alert"
                  className="rounded-[var(--radius-md)] border border-[var(--clr-red)]/30 bg-[var(--clr-red-soft)] px-4 py-3 text-[13px] leading-relaxed text-[#fecaca]"
                >
                  {error}
                </div>
              ) : payload && stats ? (
                <div className="space-y-8 md:space-y-10">
                  {loading ? (
                    <p className="mashwar-arabic text-center text-[12px] text-[var(--clr-slate)]">{t("refreshing")}</p>
                  ) : null}

                  <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
                    <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] p-5 lg:col-span-5 lg:p-6">
                      <p className="mashwar-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--clr-slate)]">
                        {t("heroGeneralLabel")}
                      </p>
                      <p className="mashwar-mono mt-3 text-[clamp(2.5rem,6vw,3.5rem)] font-bold tabular-nums leading-none text-[var(--clr-white)]" dir="ltr">
                        {stats.generalIndex !== null ? formatInt(stats.generalIndex) : tCommon("notAvailable")}
                      </p>
                      <p className="mashwar-arabic mt-3 text-[13px] leading-loose text-[var(--clr-sand)]">
                        {t("heroGeneralBody")}
                      </p>
                      <p className="mashwar-mono mt-4 inline-flex rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1.5 text-[11px] font-semibold text-[var(--clr-green-soft)]" dir="ltr">
                        {rangeLabel(range)}
                      </p>
                    </div>

                    <div className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 lg:col-span-7 lg:p-6">
                      <div>
                        <h3 className="mashwar-display text-[15px] font-bold text-[var(--clr-white)] md:text-[16px]">
                          {t("timeDignityTitle")}
                        </h3>
                        <p className="mashwar-arabic mt-2 text-[13px] leading-loose text-[var(--clr-sand)] md:text-[14px]">
                          {t("timeDignityBody")}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-4 py-3">
                          <p className="mashwar-arabic text-[11px] font-semibold text-[var(--clr-slate)]">
                            {t("collectiveBurdenLabel")}
                          </p>
                          <p className="mashwar-mono mt-1 text-[20px] font-bold tabular-nums text-[var(--clr-white)]" dir="ltr">
                            {formatInt(payload.summary.total_experimental_relative_burden)}
                          </p>
                          <p className="mashwar-arabic mt-2 text-[11px] leading-snug text-[var(--clr-slate)]">
                            {t("collectiveBurdenHint")}
                          </p>
                        </div>
                        <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] px-4 py-3">
                          <p className="mashwar-arabic text-[11px] font-semibold text-[var(--clr-slate)]">
                            {t("observationsLabel")}
                          </p>
                          <p className="mashwar-mono mt-1 text-[20px] font-bold tabular-nums text-[var(--clr-white)]" dir="ltr">
                            {formatInt(stats.totalSamples)}
                          </p>
                          <p className="mashwar-arabic mt-2 text-[11px] leading-snug text-[var(--clr-slate)]">
                            {stats.cityCount > 0
                              ? t("observationsHint", { cities: formatInt(stats.cityCount) })
                              : t("observationsHintNoCities")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <section aria-labelledby="hardship-stories-heading">
                    <h3
                      id="hardship-stories-heading"
                      className="mashwar-display text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--clr-slate)] md:text-[14px]"
                    >
                      {t("storiesTitle")}
                    </h3>
                    <p className="mashwar-arabic mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--clr-slate)] md:text-[13px]">
                      {t("storiesLead")}
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <article className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] p-4 md:p-5">
                        <p className="mashwar-arabic text-[12px] font-semibold text-[var(--clr-green-soft)]">
                          {t("storyCityTitle")}
                        </p>
                        <p className="mashwar-arabic mt-2 text-[18px] font-bold leading-snug text-[var(--clr-white)]">
                          {payload.summary.worst_city || tCommon("notAvailable")}
                        </p>
                        <p className="mashwar-arabic mt-2 text-[12px] leading-relaxed text-[var(--clr-sand)]">
                          {t("storyCityBody")}
                        </p>
                      </article>
                      <article className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] p-4 md:p-5">
                        <p className="mashwar-arabic text-[12px] font-semibold text-[var(--clr-green-soft)]">
                          {t("storyVolatileTitle")}
                        </p>
                        <p className="mashwar-arabic mt-2 text-[18px] font-bold leading-snug text-[var(--clr-white)]">
                          {payload.summary.most_volatile_checkpoint || tCommon("notAvailable")}
                        </p>
                        <p className="mashwar-arabic mt-2 text-[12px] leading-relaxed text-[var(--clr-sand)]">
                          {t("storyVolatileBody")}
                        </p>
                      </article>
                      <article className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] p-4 md:p-5">
                        <p className="mashwar-arabic text-[12px] font-semibold text-[var(--clr-green-soft)]">
                          {t("storyClosureTitle")}
                        </p>
                        <p className="mashwar-arabic mt-2 text-[18px] font-bold leading-snug text-[var(--clr-white)]">
                          {payload.summary.highest_closure_checkpoint || tCommon("notAvailable")}
                        </p>
                        <p className="mashwar-arabic mt-2 text-[12px] leading-relaxed text-[var(--clr-sand)]">
                          {t("storyClosureBody")}
                        </p>
                      </article>
                    </div>
                  </section>

                  {payload.regions.length > 0 ? (
                    <section aria-labelledby="hardship-regions-heading">
                      <h3
                        id="hardship-regions-heading"
                        className="mashwar-display text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--clr-slate)] md:text-[14px]"
                      >
                        {t("sectionRegions")}
                      </h3>
                      <p className="mashwar-arabic mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--clr-slate)] md:text-[13px]">
                        {t("regionsLead")}
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {payload.regions.map((row) => (
                          <article
                            key={row.region}
                            className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] p-4"
                          >
                            <p className="mashwar-arabic text-[16px] font-bold text-[var(--clr-white)]">
                              {translateRegionToken(row.region, t)}
                            </p>
                            <dl className="mashwar-arabic mt-3 space-y-2 text-[12px] text-[var(--clr-sand)]">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <dt>{t("colScore")}</dt>
                                <dd className="mashwar-mono font-semibold text-[var(--clr-white)]" dir="ltr">
                                  {formatInt(row.score)}
                                </dd>
                              </div>
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <dt>{t("colPopWeighted")}</dt>
                                <dd className="mashwar-mono font-semibold text-[var(--clr-white)]" dir="ltr">
                                  {formatInt(row.population_weighted_score)}
                                </dd>
                              </div>
                              <div className="border-t border-[var(--glass-border)] pt-2">
                                <dt className="text-[11px] text-[var(--clr-slate)]">{t("colWorstCity")}</dt>
                                <dd className="mt-1 font-semibold text-[var(--clr-white)]">{row.worst_city}</dd>
                              </div>
                            </dl>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {payload.cities.length > 0 ? (
                    <section aria-labelledby="hardship-cities-heading">
                      <h3
                        id="hardship-cities-heading"
                        className="mashwar-display text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--clr-slate)] md:text-[14px]"
                      >
                        {t("sectionCities")}
                      </h3>
                      <p className="mashwar-arabic mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--clr-slate)] md:text-[13px]">
                        {t("citiesLead")}
                      </p>
                      <ul className="mt-4 grid gap-4 md:grid-cols-2">
                        {payload.cities.map((city) => {
                          const sev = severityTone(city.severity);
                          const confLabel = translateConfidence(city.confidence, t);
                          const sevLabel = translateSeverity(city.severity, t);
                          return (
                            <li
                              key={city.city}
                              className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)] p-4 md:p-5"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="mashwar-arabic text-[17px] font-bold text-[var(--clr-white)]">
                                    {city.city}
                                  </p>
                                  <p className="mashwar-arabic mt-1 text-[12px] text-[var(--clr-slate)]">
                                    {t("cityPopulation", { count: formatInt(city.population) })}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  <span
                                    className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                                    style={{
                                      color: sev.text,
                                      backgroundColor: sev.bg,
                                      borderColor: sev.border,
                                    }}
                                  >
                                    {sevLabel}
                                  </span>
                                  <span className="mashwar-mono rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-[12px] font-bold tabular-nums text-[var(--clr-white)]" dir="ltr">
                                    {formatInt(city.score)}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-[var(--glass-border)] pt-3 text-[12px] text-[var(--clr-sand)]">
                                <span className="mashwar-arabic">
                                  <span className="text-[var(--clr-slate)]">{t("cityTrend")}</span>{" "}
                                  {formatTrend(city.trend)}
                                </span>
                                <span className="mashwar-arabic">
                                  <span className="text-[var(--clr-slate)]">{t("cityConfidence")}</span> {confLabel}
                                </span>
                                <span className="mashwar-mono tabular-nums text-[var(--clr-white)]" dir="ltr">
                                  {t("citySamples", { n: formatInt(city.sample_count) })}
                                </span>
                              </div>
                              <p className="mashwar-arabic mt-3 text-[12px] leading-relaxed text-[var(--clr-sand)]">
                                {t("cityBurden", { value: formatInt(city.experimental_relative_burden) })}
                              </p>
                              {city.top_drivers.length > 0 ? (
                                <div className="mt-4 border-t border-[var(--glass-border)] pt-3">
                                  <p className="mashwar-arabic text-[11px] font-semibold text-[var(--clr-green-soft)]">
                                    {t("topDriversHeading")}
                                  </p>
                                  <ul className="mt-2 space-y-2">
                                    {city.top_drivers.map((d) => (
                                      <li
                                        key={`${city.city}-${d.checkpoint_id}`}
                                        className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2.5"
                                      >
                                        <p className="mashwar-arabic text-[14px] font-semibold text-[var(--clr-white)]">
                                          {d.checkpoint_name}
                                        </p>
                                        <div className="mt-2 grid gap-2 text-[11px] text-[var(--clr-sand)] sm:grid-cols-2 lg:grid-cols-4">
                                          <p className="mashwar-arabic leading-snug">
                                            <span className="text-[var(--clr-slate)]">{t("driverScore")}</span>{" "}
                                            <span className="mashwar-mono font-semibold text-[var(--clr-white)]" dir="ltr">
                                              {formatInt(d.score)}
                                            </span>
                                          </p>
                                          <p className="mashwar-arabic leading-snug">
                                            <span className="text-[var(--clr-slate)]">{t("driverClosure")}</span>{" "}
                                            <span className="mashwar-mono font-semibold text-[var(--clr-white)]" dir="ltr">
                                              {formatPct(d.closure_rate)}
                                            </span>
                                          </p>
                                          <p className="mashwar-arabic leading-snug">
                                            <span className="text-[var(--clr-slate)]">{t("driverCongestion")}</span>{" "}
                                            <span className="mashwar-mono font-semibold text-[var(--clr-white)]" dir="ltr">
                                              {formatPct(d.congestion_rate)}
                                            </span>
                                          </p>
                                          <p className="mashwar-arabic leading-snug">
                                            <span className="text-[var(--clr-slate)]">{t("driverVolatility")}</span>{" "}
                                            <span className="mashwar-mono font-semibold text-[var(--clr-white)]" dir="ltr">
                                              {d.volatility_score.toFixed(2)}
                                            </span>
                                          </p>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
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
