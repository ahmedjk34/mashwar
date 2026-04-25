"use client";

import { useLocale, useTranslations } from "next-intl";

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
  const locale = useLocale();
  const tForecastH = useTranslations("forecast.horizon");
  const tCommon = useTranslations("common");

  const horizonKey = forecastHorizonSubkey(row.horizon);
  const horizonTitle =
    horizonKey === "unknown" ? tForecastH("unknown", { code: row.horizon }) : tForecastH(horizonKey);

  const headerDir = locale === "ar" ? "rtl" : "ltr";

  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--glass-border-mid)] bg-[var(--glass-bg-mid)]/95 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div
        className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--glass-border)] pb-2.5"
        dir={headerDir}
      >
        <h4
          className={`mashwar-arabic min-w-0 max-w-[min(100%,280px)] text-[15px] font-bold leading-snug text-[var(--clr-white)] ${
            locale === "ar" ? "text-right" : "text-left"
          }`}
          dir={locale === "ar" ? "rtl" : "ltr"}
        >
          {horizonTitle}
        </h4>
        <p
          className={`mashwar-mono shrink-0 text-[10px] text-[var(--clr-slate)] ${
            locale === "ar" ? "text-left" : "text-right"
          }`}
          dir="ltr"
        >
          {formatForecastDateTimePalestine(row.targetDateTime, tCommon)}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ForecastDirectionCell direction="entering" item={row.entering} />
        <ForecastDirectionCell direction="leaving" item={row.leaving} />
      </div>
    </article>
  );
}
