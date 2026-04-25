"use client";

import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";

import { checkpointBadgeSubkey, checkpointFlowSubkey } from "@/i18n/message-key-map";
import type { MapCheckpointStatus } from "@/lib/types/map";

import { CHECKPOINT_STATUS_STYLE } from "./checkpointStatusStyle";

function getConfidenceTone(
  confidence: number | null,
  tCommon: ReturnType<typeof useTranslations<"common">>,
): { color: string; label: string } {
  if (confidence === null) {
    return { color: "var(--clr-slate)", label: tCommon("notAvailable") };
  }

  const pct = tCommon("percent", { value: Math.round(confidence * 100) });

  if (confidence > 90) {
    return { color: "var(--clr-green-soft)", label: pct };
  }

  if (confidence >= 80) {
    return { color: "var(--risk-low)", label: pct };
  }

  return { color: "var(--risk-med)", label: pct };
}

export function DirectionStatusTile({
  direction,
  status,
}: {
  direction: "entering" | "leaving";
  status: MapCheckpointStatus;
}) {
  const locale = useLocale();
  const tDir = useTranslations("checkpoint.direction");
  const tDirMono = useTranslations("checkpoint.directionMono");
  const tFlow = useTranslations("checkpoint.flow");
  const tBadge = useTranslations("checkpoint.badge");

  const visual = CHECKPOINT_STATUS_STYLE[status] ?? CHECKPOINT_STATUS_STYLE["غير معروف"];
  const titlePrimary = direction === "entering" ? tDir("entering") : tDir("leaving");
  const titleMono = direction === "entering" ? tDirMono("entering") : tDirMono("leaving");
  const flowKey = checkpointFlowSubkey(status);
  const badgeKey = checkpointBadgeSubkey(status);
  const flowLabel = tFlow(flowKey);
  const badgeLabel = tBadge(badgeKey);
  const ariaLabel =
    locale === "ar"
      ? `${titlePrimary} — ${flowLabel} (${badgeLabel})`
      : `${titleMono} — ${flowLabel} (${badgeLabel})`;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{ borderInlineStartWidth: 3, borderInlineStartColor: visual.border }}
    >
      <span className="sr-only">
        {titlePrimary} ({titleMono})
      </span>
      <div className="flex items-start justify-end gap-2">
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
          style={{ backgroundColor: visual.dot }}
          aria-hidden
        />
      </div>
      <p
        className="mashwar-arabic mt-2 text-end text-[20px] font-bold leading-snug tracking-tight"
        style={{ color: visual.text }}
        dir="rtl"
      >
        {flowLabel}
      </p>
      <p
        className="mashwar-mono mt-1 text-end text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--clr-slate)] opacity-80"
        dir="ltr"
      >
        {badgeLabel}
      </p>
    </div>
  );
}

export function FusedDirectionsStatusTile({ status }: { status: MapCheckpointStatus }) {
  const locale = useLocale();
  const tDir = useTranslations("checkpoint.direction");
  const tDirMono = useTranslations("checkpoint.directionMono");
  const tFlow = useTranslations("checkpoint.flow");
  const tBadge = useTranslations("checkpoint.badge");

  const visual = CHECKPOINT_STATUS_STYLE[status] ?? CHECKPOINT_STATUS_STYLE["غير معروف"];
  const flowKey = checkpointFlowSubkey(status);
  const badgeKey = checkpointBadgeSubkey(status);
  const flowLabel = tFlow(flowKey);
  const badgeLabel = tBadge(badgeKey);
  const bothPrimary = tDir("both");
  const bothMono = tDirMono("both");
  const ariaLabel =
    locale === "ar"
      ? `${bothPrimary} — ${flowLabel} (${badgeLabel})`
      : `${bothMono} — ${flowLabel} (${badgeLabel})`;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-gradient-to-b from-[var(--glass-bg-raised)] to-[var(--glass-bg-mid)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      style={{ borderTopWidth: 3, borderTopColor: visual.border }}
    >
      <span className="sr-only">
        {bothPrimary} ({bothMono})
      </span>
      <div className="flex flex-wrap items-center justify-end gap-2" dir="rtl">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
          style={{ backgroundColor: visual.dot }}
          aria-hidden
        />
      </div>
      <p
        className="mashwar-arabic mt-3 text-center text-[clamp(1.35rem,4.5vw,1.75rem)] font-bold leading-tight"
        style={{ color: visual.text }}
        dir="rtl"
      >
        {flowLabel}
      </p>
      <p
        className="mashwar-mono mt-1 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--clr-slate)]"
        dir="ltr"
      >
        {badgeLabel}
      </p>
    </div>
  );
}

export function ForecastDirectionCell({
  direction,
  item,
}: {
  direction: "entering" | "leaving";
  item: import("@/lib/types/map").NormalizedCheckpointForecast["predictions"]["entering"][number] | null;
}) {
  const locale = useLocale();
  const tDir = useTranslations("checkpoint.direction");
  const tDirMono = useTranslations("checkpoint.directionMono");
  const tFlow = useTranslations("checkpoint.flow");
  const tPanel = useTranslations("checkpoint.panel");
  const tCommon = useTranslations("common");

  const rawStatus = item?.prediction.predictedStatus ?? "غير معروف";
  const status = rawStatus as MapCheckpointStatus;
  const visual = CHECKPOINT_STATUS_STYLE[status] ?? CHECKPOINT_STATUS_STYLE["غير معروف"];
  const tone = item ? getConfidenceTone(item.prediction.confidence, tCommon) : null;
  const flowKey = checkpointFlowSubkey(status);
  const flowLabel = item ? tFlow(flowKey) : tCommon("dash");
  const titlePrimary = direction === "entering" ? tDir("entering") : tDir("leaving");
  const titleMono = direction === "entering" ? tDirMono("entering") : tDirMono("leaving");
  const confPct = item
    ? tCommon("percent", { value: Math.round((item.prediction.confidence ?? 0) * 100) })
    : tCommon("dash");
  const ariaLabel =
    locale === "ar"
      ? `${titlePrimary} — ${flowLabel} (${tPanel("confidencePrefix")} ${confPct})`
      : `${titleMono} — ${flowLabel} (${tPanel("confidencePrefix")} ${confPct})`;

  const active = Boolean(item);
  const cellStyle: CSSProperties | undefined = active
    ? {
        borderTopColor: visual.border,
        borderTopWidth: 3,
        background: `linear-gradient(165deg, color-mix(in srgb, ${visual.border} 24%, transparent) 0%, transparent 42%), linear-gradient(180deg, ${visual.softBg} 0%, rgba(17, 24, 39, 0.72) 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px color-mix(in srgb, ${visual.border} 22%, transparent), 0 12px 28px color-mix(in srgb, ${visual.border} 14%, transparent)`,
      }
    : {
        borderTopWidth: 1,
        borderTopColor: "var(--glass-border)",
      };

  return (
    <div
      role="group"
      aria-label={active ? ariaLabel : `${titlePrimary} — ${tCommon("dash")}`}
      className={`relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--glass-border)] p-3 ${active ? "ring-1 ring-white/[0.06]" : "opacity-55"}`}
      style={cellStyle}
    >
      <span className="sr-only">
        {titlePrimary} ({titleMono})
      </span>
      <div className="flex items-start justify-end gap-2">
        <span
          className="mt-0.5 h-3 w-3 shrink-0 rounded-full ring-2 ring-white/15"
          style={{ backgroundColor: visual.dot, boxShadow: active ? `0 0 14px color-mix(in srgb, ${visual.border} 55%, transparent)` : undefined }}
          aria-hidden
        />
      </div>
      <p
        className="mashwar-arabic mt-2 text-end text-[clamp(1.05rem,3.2vw,1.25rem)] font-bold leading-snug tracking-tight"
        style={{ color: item ? visual.text : "var(--clr-slate)" }}
        dir="rtl"
      >
        {item ? flowLabel : tCommon("dash")}
      </p>
      {item ? (
        <p
          className="mashwar-arabic mt-2.5 text-end text-[10px] font-semibold leading-snug"
          style={{ color: tone?.color ?? "var(--clr-slate)" }}
          dir="rtl"
        >
          {tPanel("confidencePrefix")}{" "}
          <span className="mashwar-mono tabular-nums font-bold tracking-tight" dir="ltr">
            {confPct}
          </span>
        </p>
      ) : (
        <p className="mashwar-mono mt-2 text-end text-[10px] text-[var(--clr-slate)]">{tCommon("dash")}</p>
      )}
    </div>
  );
}
