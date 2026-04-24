type CommonT = (key: string, values?: Record<string, string | number | Date>) => string;

export function formatForecastDateTimePalestine(value: string | null, tCommon: CommonT): string {
  if (!value) {
    return tCommon("pending");
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Hebron",
  }).formatToParts(parsed);

  const month = parts.find((part) => part.type === "month")?.value?.toUpperCase();
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;

  if (!month || !day || !year || !hour || !minute || !dayPeriod) {
    return value;
  }

  return `${month} ${day}, ${year}, ${hour}:${minute} ${dayPeriod}`;
}
