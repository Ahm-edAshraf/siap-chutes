const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MALAY_MONTHS = [
  "Januari",
  "Februari",
  "Mac",
  "April",
  "Mei",
  "Jun",
  "Julai",
  "Ogos",
  "September",
  "Oktober",
  "November",
  "Disember",
] as const;

type Language = "EN" | "BM";

export type ParsedDeadline = {
  instant: Date;
  hasTime: boolean;
};

function validDateParts(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function malaysiaInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
) {
  if (
    !validDateParts(year, month, day) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

function monthNumber(value: string) {
  const normalized = value.toLocaleLowerCase("en");
  const index = ENGLISH_MONTHS.findIndex(
    (month) => month.toLocaleLowerCase("en") === normalized,
  );
  return index < 0 ? null : index + 1;
}

export function parseDeadline(value: string): ParsedDeadline | null {
  const input = value.normalize("NFKC").trim();
  const dateOnly = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const instant = malaysiaInstant(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
    );
    return instant ? { instant, hasTime: false } : null;
  }

  const localIso = input.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/,
  );
  if (localIso) {
    const instant = malaysiaInstant(
      Number(localIso[1]),
      Number(localIso[2]),
      Number(localIso[3]),
      Number(localIso[4]),
      Number(localIso[5]),
      Number(localIso[6] ?? 0),
    );
    return instant ? { instant, hasTime: true } : null;
  }

  const human = input.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:MYT|Malaysia time)?)?$/i,
  );
  if (human) {
    const month = monthNumber(human[2]);
    if (!month) return null;
    let hour = Number(human[4] ?? 0);
    const hasTime = human[4] !== undefined;
    if (hasTime) {
      if (hour < 1 || hour > 12) return null;
      if (human[6].toUpperCase() === "PM" && hour !== 12) hour += 12;
      if (human[6].toUpperCase() === "AM" && hour === 12) hour = 0;
    }
    const instant = malaysiaInstant(
      Number(human[3]),
      month,
      Number(human[1]),
      hour,
      Number(human[5] ?? 0),
    );
    return instant ? { instant, hasTime } : null;
  }

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(input)) {
    const instant = new Date(input);
    if (!Number.isNaN(instant.valueOf())) {
      return { instant, hasTime: true };
    }
  }
  return null;
}

function malaysiaParts(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function renderDate(instant: Date, language: Language) {
  const { year, month, day } = malaysiaParts(instant);
  const months = language === "BM" ? MALAY_MONTHS : ENGLISH_MONTHS;
  return `${day} ${months[month - 1]} ${year}`;
}

export function formatCalendarDate(
  value: string,
  language: Language = "EN",
) {
  const parsed = parseDeadline(value);
  return parsed ? renderDate(parsed.instant, language) : value;
}

export function formatDeadline(value: string, language: Language = "EN") {
  const parsed = parseDeadline(value);
  if (!parsed) return value;
  const date = renderDate(parsed.instant, language);
  if (!parsed.hasTime) {
    return language === "BM"
      ? `${date} (masa tidak dinyatakan)`
      : `${date} (time not stated)`;
  }
  const { hour, minute } = malaysiaParts(parsed.instant);
  const period = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  const time = `${twelveHour}:${String(minute).padStart(2, "0")} ${period}`;
  return language === "BM"
    ? `${date} pada ${time} (waktu Malaysia)`
    : `${date} at ${time} (Malaysia time)`;
}

export function formatMalaysiaTimestamp(
  value: number,
  language: Language = "EN",
) {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) return String(value);
  const date = renderDate(instant, language);
  const { hour, minute } = malaysiaParts(instant);
  const period = hour >= 12 ? "PM" : "AM";
  const time = `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${period}`;
  return language === "BM"
    ? `${date} pada ${time} (waktu Malaysia)`
    : `${date} at ${time} (Malaysia time)`;
}

export function normalizeDeadline(value: string | undefined) {
  if (!value) return undefined;
  const parsed = parseDeadline(value);
  if (!parsed) return value.trim();
  if (!parsed.hasTime) {
    const { year, month, day } = malaysiaParts(parsed.instant);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return parsed.instant.toISOString();
}
