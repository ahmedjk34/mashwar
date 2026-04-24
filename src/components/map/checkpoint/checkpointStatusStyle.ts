import type { MapCheckpointStatus } from "@/lib/types/map";

/** Visual tokens only — labels come from next-intl (`checkpoint.flow`, `checkpoint.badge`). */
export const CHECKPOINT_STATUS_STYLE: Record<
  MapCheckpointStatus,
  {
    dot: string;
    border: string;
    bg: string;
    text: string;
    softBg: string;
  }
> = {
  سالك: {
    dot: "var(--risk-low)",
    border: "var(--risk-low)",
    bg: "var(--risk-low-bg)",
    text: "var(--clr-green-soft)",
    softBg: "var(--risk-low-bg)",
  },
  "أزمة متوسطة": {
    dot: "var(--risk-med)",
    border: "var(--risk-med)",
    bg: "var(--risk-med-bg)",
    text: "var(--risk-med)",
    softBg: "var(--risk-med-bg)",
  },
  "أزمة خانقة": {
    dot: "var(--risk-high)",
    border: "var(--risk-high)",
    bg: "var(--risk-high-bg)",
    text: "var(--clr-white)",
    softBg: "var(--risk-high-bg)",
  },
  مغلق: {
    dot: "var(--risk-high)",
    border: "var(--risk-high)",
    bg: "var(--risk-high-bg)",
    text: "var(--clr-white)",
    softBg: "var(--risk-high-bg)",
  },
  "غير معروف": {
    dot: "var(--clr-slate)",
    border: "var(--glass-border-mid)",
    bg: "var(--glass-bg-mid)",
    text: "var(--clr-sand)",
    softBg: "var(--glass-bg-mid)",
  },
};
