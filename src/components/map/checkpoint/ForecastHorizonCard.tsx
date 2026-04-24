"use client";

import { useTranslations } from "next-intl";

import { forecastHorizonSubkey } from "@/i18n/message-key-map";
import { formatForecastDateTimePalestine } from "@/lib/utils/forecast-datetime";

import { ForecastDirectionCell } from "./CheckpointStatusTiles";

export type ForecastRow = {
  horizon: string;
  targetDateTime: string | null;
  entering: import("@/lib/types/map").NormalizedCheckpointForecast["predictions"]["entering"][number] | null;
  leaving: import("@/lib/types/map").NormalizedCheckpointForecast["predictions"]["leaving"][number] | null;
};

export default function ForecastHorizonCard({ row }: { row: ForecastRow }) {
  const tForecastH = useTranslations("forecast.horizon");
  const tForecastCov = useTranslations("forecast.coverage");
  const tCommon = useTranslations("common");

  const horizonKey = forecastHorizonSubkey(row.horizon);
  const horizonTitle =
    horizonKey === "unknown" ? tForecastH("unknown", { code: row.horizon }) : tForecastH(horizonKey);

  const coverageLabel =
    row.entering && row.leaving
      ? tForecastCov("both")
      : row.entering
        ? tForecastCov("enteringOnly")
        : tForecastCov("leavingOnly");

  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-mid)]/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--glass-border)] pb-2.5">
        <div className="min-w-0 text-end" dir="rtl">
          <h4 className="mashwar-arabic text-[15px] font-bold leading-snug text-[var(--clr-white)]">
            {horizonTitle}
          </h4>
          <p className="mashwar-mono mt-0.5 text-[10px] text-[var(--clr-slate)]" dir="ltr">
            {formatForecastDateTimePalestine(row.targetDateTime, tCommon)}
          </p>
        </div>
        <span className="mashwar-arabic shrink-0 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2.5 py-1 text-[10px] text-[var(--clr-sand)]">
          {coverageLabel}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ForecastDirectionCell direction="entering" item={row.entering} />
        <ForecastDirectionCell direction="leaving" item={row.leaving} />
      </div>
    </article>
  );
}
