const APPOINTMENT_TIME_ZONE = "America/Sao_Paulo";

export function createAppointmentTimestamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APPOINTMENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  }).formatToParts(date);

  const valueByPart = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${valueByPart.year}-${valueByPart.month}-${valueByPart.day}`
    + `T${valueByPart.hour}:${valueByPart.minute}:${valueByPart.second}`
    + `:${valueByPart.fractionalSecond}Z`;
}
