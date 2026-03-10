const WARSAW_TIME_ZONE = "Europe/Warsaw";

const warsawDatePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: WARSAW_TIME_ZONE,
  year: "numeric",
});

const warsawOffsetFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: WARSAW_TIME_ZONE,
  timeZoneName: "longOffset",
});

const getPartValue = (
  date: Date,
  partType: "day" | "hour" | "minute" | "month" | "second" | "year",
) =>
  warsawDatePartsFormatter.formatToParts(date).find((part) => part.type === partType)
    ?.value ?? "";

const parseOffsetMinutes = (offsetLabel: string) => {
  const normalizedLabel = offsetLabel.trim().replace("UTC", "GMT");
  const matchedOffset = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/u.exec(normalizedLabel);

  if (!matchedOffset) {
    return 0;
  }

  const [, sign, hours, minutes = "0"] = matchedOffset;
  const totalMinutes = Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);

  return sign === "-" ? -totalMinutes : totalMinutes;
};

const getOffsetLabel = (offsetMinutes: number) => {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");

  return `${sign}${hours}:${minutes}`;
};

const getWarsawOffsetMinutes = (date: Date) => {
  const offsetLabel =
    warsawOffsetFormatter.formatToParts(date).find((part) => part.type === "timeZoneName")
      ?.value ?? "";

  return parseOffsetMinutes(offsetLabel);
};

export const toWarsawIso = (value: Date | number | string = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const year = getPartValue(date, "year");
  const month = getPartValue(date, "month");
  const day = getPartValue(date, "day");
  const hour = getPartValue(date, "hour");
  const minute = getPartValue(date, "minute");
  const second = getPartValue(date, "second");
  const millisecond = String(date.getMilliseconds()).padStart(3, "0");
  const offset = getOffsetLabel(getWarsawOffsetMinutes(date));

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}${offset}`;
};

export const WARSAW_TIME_ZONE_LABEL = "Europe/Warsaw";
