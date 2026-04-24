"use client";

import { useTranslations } from "next-intl";

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

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      style={{ borderInlineStartWidth: 3, borderInlineStartColor: visual.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-end" dir="rtl">
          <p className="mashwar-arabic text-[13px] font-semibold leading-tight text-[var(--clr-white)]">
            {titlePrimary}
          </p>
          <p
            className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.16em] text-[var(--clr-slate)]"
            dir="ltr"
          >
            {titleMono}
          </p>
        </div>
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
          style={{ backgroundColor: visual.dot }}
          aria-hidden
        />
      </div>
      <p
        className="mashwar-arabic mt-3 text-end text-[20px] font-bold leading-snug tracking-tight"
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
  const tDir = useTranslations("checkpoint.direction");
  const tDirMono = useTranslations("checkpoint.directionMono");
  const tFlow = useTranslations("checkpoint.flow");
  const tBadge = useTranslations("checkpoint.badge");

  const visual = CHECKPOINT_STATUS_STYLE[status] ?? CHECKPOINT_STATUS_STYLE["غير معروف"];
  const flowKey = checkpointFlowSubkey(status);
  const badgeKey = checkpointBadgeSubkey(status);
  const flowLabel = tFlow(flowKey);
  const badgeLabel = tBadge(badgeKey);

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-gradient-to-b from-[var(--glass-bg-raised)] to-[var(--glass-bg-mid)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      style={{ borderTopWidth: 3, borderTopColor: visual.border }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2" dir="rtl">
        <div className="text-end">
          <p className="mashwar-arabic text-[11px] font-semibold text-[var(--clr-sand)]">
            {tDir("both")}
          </p>
          <p
            className="mashwar-mono mt-0.5 text-[9px] uppercase tracking-[0.18em] text-[var(--clr-slate)]"
            dir="ltr"
          >
            {tDirMono("both")}
          </p>
        </div>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/10"
          style={{ backgroundColor: visual.dot }}
          aria-hidden
        />
      </div>
      <p
        className="mashwar-arabic mt-4 text-center text-[clamp(1.35rem,4.5vw,1.75rem)] font-bold leading-tight"
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
  const conf = item
    ? `${tPanel("confidencePrefix")} ${tCommon("percent", { value: Math.round((item.prediction.confidence ?? 0) * 100) })}`
    : tCommon("dash");

  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg)]/80 p-2.5 ${item ? "" : "opacity-55"}`}
      style={{ borderInlineStartWidth: 2, borderInlineStartColor: visual.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-end" dir="rtl">
          <p className="mashwar-arabic text-[12px] font-semibold text-[var(--clr-sand)]">
            {direction === "entering" ? tDir("entering") : tDir("leaving")}
          </p>
          <p
            className="mashwar-mono text-[9px] uppercase tracking-[0.14em] text-[var(--clr-slate)]"
            dir="ltr"
          >
            {direction === "entering" ? tDirMono("entering") : tDirMono("leaving")}
          </p>
        </div>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: visual.dot }} aria-hidden />
      </div>
      <p
        className="mashwar-arabic mt-2 text-end text-[15px] font-bold leading-snug"
        style={{ color: item ? visual.text : "var(--clr-slate)" }}
        dir="rtl"
      >
        {item ? flowLabel : tCommon("dash")}
      </p>
      {item ? (
        <p
          className="mashwar-mono mt-1 text-end text-[10px]"
          style={{ color: tone?.color ?? "var(--clr-slate)" }}
          dir="rtl"
        >
          {conf}
        </p>
      ) : (
        <p className="mashwar-mono mt-1 text-end text-[10px] text-[var(--clr-slate)]">{tCommon("dash")}</p>
      )}
    </div>
  );
}
