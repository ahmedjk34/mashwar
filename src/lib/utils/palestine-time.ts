export const PALESTINE_TIME_ZONE = "Asia/Hebron";

interface TimeZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getTimeZoneParts(
  date: Date,
  timeZone: string = PALESTINE_TIME_ZONE,
): TimeZoneParts | null {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string | null =>
    parts.find((item) => item.type === type)?.value ?? null;

  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const hour = Number(part("hour"));
  const minute = Number(part("minute"));
  const second = Number(part("second"));

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second };
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number | null {
  const parts = getTimeZoneParts(date, timeZone);
  if (!parts) {
    return null;
  }

  const utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return (utcMs - date.getTime()) / 60000;
}

function buildUtcDateFromTimeZoneParts(
  parts: TimeZoneParts,
  timeZone: string = PALESTINE_TIME_ZONE,
): Date | null {
  const wallClockUtcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  let offsetMinutes = getTimeZoneOffsetMinutes(
    new Date(wallClockUtcGuess),
    timeZone,
  );
  if (offsetMinutes === null) {
    return null;
  }

  let utcMs = wallClockUtcGuess - offsetMinutes * 60000;

  const refinedOffsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMs), timeZone);
  if (refinedOffsetMinutes !== null && refinedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = refinedOffsetMinutes;
    utcMs = wallClockUtcGuess - offsetMinutes * 60000;
  }

  return new Date(utcMs);
}

function incrementWallClockDay(parts: TimeZoneParts, days: number): TimeZoneParts {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + days);

  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function formatDateTimeInPalestine(
  value: string | null,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: PALESTINE_TIME_ZONE,
  }).format(parsed);
}

export function parseDateTimeExpressionInPalestine(
  expression: string,
  reference = new Date(),
): string | null {
  const trimmed = expression.trim();
  if (!trimmed) {
    return null;
  }

  const directDate = new Date(trimmed);
  if (
    !Number.isNaN(directDate.getTime()) &&
    /[0-9]/.test(trimmed) &&
    (trimmed.includes("T") || trimmed.includes("-") || trimmed.includes("/"))
  ) {
    return directDate.toISOString();
  }

  const normalized = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:@/-]+/gu, " ")
    .replace(/\s+/g, " ");

  const tomorrow =
    normalized.includes("tomorrow") ||
    normalized.includes("بكرة") ||
    normalized.includes("باجر") ||
    normalized.includes("غد") ||
    normalized.includes("غدا");
  const today =
    normalized.includes("today") ||
    normalized.includes("اليوم") ||
    normalized.includes("now") ||
    normalized.includes("الان") ||
    normalized.includes("الآن");

  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!timeMatch) {
    if (!Number.isNaN(directDate.getTime())) {
      return directDate.toISOString();
    }

    return null;
  }

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] ?? "0");
  const meridiem = timeMatch[3];

  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return null;
  }

  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  } else if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  const referenceParts = getTimeZoneParts(reference, PALESTINE_TIME_ZONE);
  if (!referenceParts) {
    return null;
  }

  let targetParts = {
    year: referenceParts.year,
    month: referenceParts.month,
    day: referenceParts.day,
    hour,
    minute,
    second: 0,
  };

  if (tomorrow) {
    targetParts = incrementWallClockDay(targetParts, 1);
  } else if (!today && !trimmed.includes("-")) {
    const compare = buildUtcDateFromTimeZoneParts(targetParts, PALESTINE_TIME_ZONE);
    if (compare && compare.getTime() <= reference.getTime()) {
      targetParts = incrementWallClockDay(targetParts, 1);
    }
  }

  const targetDate = buildUtcDateFromTimeZoneParts(
    targetParts,
    PALESTINE_TIME_ZONE,
  );
  return targetDate?.toISOString() ?? null;
}
