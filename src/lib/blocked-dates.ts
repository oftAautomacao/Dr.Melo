export type BlockedTimeRange = {
  start: string;
  end: string;
};

export type DayBlockInfo = {
  isFullDay: boolean;
  blockedTimes: BlockedTimeRange[];
};

const FULL_DAY_STARTS = new Set(["00:00", "0:00", "00:00:00"]);
const FULL_DAY_ENDS = new Set(["23:59", "23:59:00", "24:00", "24:00:00"]);

function getEntryDate(entry: unknown): string {
  if (typeof entry === "string") return entry.trim().split("T")[0];
  if (!entry || typeof entry !== "object") return "";

  const value = entry as Record<string, unknown>;
  const date = value.data ?? value.datasBloqueadas ?? value.date;
  return typeof date === "string" ? date.trim().split("T")[0] : "";
}

function getEntryTimeRange(entry: unknown): BlockedTimeRange | null {
  if (!entry || typeof entry !== "object") return null;

  const value = entry as Record<string, unknown>;
  const start =
    value.horaInicio ??
    value.horarioInicio ??
    value.horarioinicio ??
    value.inicio ??
    "";
  const end =
    value.horaFim ??
    value.horarioFim ??
    value.horariofim ??
    value.fim ??
    "";

  return {
    start: (typeof start === "string" ? start : String(start || "")).trim(),
    end: (typeof end === "string" ? end : String(end || "")).trim(),
  };
}

function isFullDayRange(range: BlockedTimeRange | null): boolean {
  if (!range?.start || !range.end) return true;
  return FULL_DAY_STARTS.has(range.start) && FULL_DAY_ENDS.has(range.end);
}

function getUnitEntries(blockedDatesData: Record<string, unknown>, unitName: string): unknown[] {
  const unitData = blockedDatesData?.[unitName];
  if (!unitData || typeof unitData !== "object") return [];
  return Object.values(unitData);
}

export function getUnitDayBlockInfo(
  blockedDatesData: Record<string, unknown>,
  unitName: string | undefined,
  dateStr: string,
): DayBlockInfo {
  if (!unitName || !dateStr) return { isFullDay: false, blockedTimes: [] };

  const blockedTimes: BlockedTimeRange[] = [];

  for (const entry of getUnitEntries(blockedDatesData, unitName)) {
    if (getEntryDate(entry) !== dateStr) continue;

    const range = getEntryTimeRange(entry);
    if (isFullDayRange(range)) {
      return { isFullDay: true, blockedTimes: [] };
    }

    if (range) blockedTimes.push(range);
  }

  return { isFullDay: false, blockedTimes };
}

export function getUnitBlockedDateKeys(
  blockedDatesData: Record<string, unknown>,
  unitName: string,
): { full: Set<string>; partial: Set<string> } {
  const dates = new Set<string>();
  for (const entry of getUnitEntries(blockedDatesData, unitName)) {
    const date = getEntryDate(entry);
    if (date) dates.add(date);
  }

  const full = new Set<string>();
  const partial = new Set<string>();
  dates.forEach((date) => {
    const info = getUnitDayBlockInfo(blockedDatesData, unitName, date);
    if (info.isFullDay) full.add(date);
    else if (info.blockedTimes.length > 0) partial.add(date);
  });

  return { full, partial };
}

function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isTimeInBlockedRanges(time: string, ranges: BlockedTimeRange[]): boolean {
  const timeValue = timeToMinutes(time);
  if (timeValue === null) return false;

  return ranges.some((range) => {
    const startValue = timeToMinutes(range.start);
    const endValue = timeToMinutes(range.end);
    if (startValue === null || endValue === null) return false;
    return timeValue >= startValue && timeValue < endValue;
  });
}
