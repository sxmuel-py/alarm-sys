export type BellStatus = "active" | "paused" | "emergency-stopped";

export type BellSource = "automatic" | "manual" | "system";

export type BellTone = "classic" | "short" | "chime";

export type ScheduleEntry = {
  id: string;
  label: string;
  time: string;
  days: number[];
  tone: BellTone;
  enabled: boolean;
  note: string;
};

export type BellLog = {
  id: string;
  timestamp: string;
  source: BellSource;
  message: string;
  detail: string;
};

export type BellSettings = {
  schoolName: string;
  bellVolume: number;
  bellDuration: number;
  autoTriggerWindowSeconds: number;
};

export type AudioStatus = "enabled" | "not-enabled";

export type PlayerStatus = {
  lastSeenAt: string | null;
  audioEnabled: boolean;
  label: string;
};

export type BellRingSignal = {
  id: string;
  type: "ring";
  createdAt: string;
  source: BellSource;
  entryId: string | null;
  label: string;
  tone: BellTone;
  durationSeconds: number;
  volume: number;
  detail: string;
};

export type BellStopSignal = {
  id: string;
  type: "stop";
  createdAt: string;
  reason: string;
};

export type PlayerSignal = BellRingSignal | BellStopSignal;

export type BellSystemSnapshot = {
  status: BellStatus;
  schedule: ScheduleEntry[];
  logs: BellLog[];
  settings: BellSettings;
  playerStatus: PlayerStatus;
  serverTime: string;
  storageStatus: string;
};

export const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const defaultSchedule: ScheduleEntry[] = [
  {
    id: "assembly",
    label: "Morning assembly",
    time: "07:45",
    days: [1, 2, 3, 4, 5],
    tone: "classic",
    enabled: true,
    note: "Start of day",
  },
  {
    id: "period-1",
    label: "Period 1 begins",
    time: "08:10",
    days: [1, 2, 3, 4, 5],
    tone: "short",
    enabled: true,
    note: "Academic block",
  },
  {
    id: "break",
    label: "Morning break",
    time: "10:30",
    days: [1, 2, 3, 4, 5],
    tone: "chime",
    enabled: true,
    note: "Student recess",
  },
  {
    id: "resume",
    label: "Classes resume",
    time: "10:50",
    days: [1, 2, 3, 4, 5],
    tone: "short",
    enabled: true,
    note: "Return from break",
  },
  {
    id: "lunch",
    label: "Lunch bell",
    time: "12:35",
    days: [1, 2, 3, 4, 5],
    tone: "chime",
    enabled: true,
    note: "Lunch interval",
  },
  {
    id: "closing",
    label: "Closing bell",
    time: "14:40",
    days: [1, 2, 3, 4, 5],
    tone: "classic",
    enabled: true,
    note: "End of school day",
  },
];

export const defaultSettings: BellSettings = {
  schoolName: "Childrens International school Lekki",
  bellVolume: 70,
  bellDuration: 3,
  autoTriggerWindowSeconds: 45,
};

export const defaultPlayerStatus: PlayerStatus = {
  lastSeenAt: null,
  audioEnabled: false,
  label: "Main player workstation",
};

export const playerHeartbeatTimeoutMs = 15_000;

export function formatLongTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatShortTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function timeToSeconds(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 3600 + minutes * 60;
}

export function secondsSinceMidnight(date: Date) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

export function formatDuration(totalSeconds: number) {
  const positiveSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(positiveSeconds / 3600);
  const minutes = Math.floor((positiveSeconds % 3600) / 60);
  const seconds = positiveSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes.toString().padStart(2, "0")}m ${seconds
    .toString()
    .padStart(2, "0")}s`;
}

export function isToday(entry: ScheduleEntry, date: Date) {
  return entry.enabled && entry.days.includes(date.getDay());
}

export function getTodaySchedule(schedule: ScheduleEntry[], date: Date) {
  return schedule
    .filter((entry) => isToday(entry, date))
    .sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time));
}

export function getTodaysOperationalSchedule(
  schedule: ScheduleEntry[],
  date: Date,
) {
  const nowSeconds = secondsSinceMidnight(date);
  const today = getTodaySchedule(schedule, date);
  const completed = today.filter((entry) => timeToSeconds(entry.time) <= nowSeconds);
  const upcoming = today.filter((entry) => timeToSeconds(entry.time) > nowSeconds);

  return {
    today,
    completed,
    next: upcoming[0] ?? null,
    remaining: upcoming,
  };
}

export function getNextBell(schedule: ScheduleEntry[], date: Date) {
  const nowSeconds = secondsSinceMidnight(date);
  const today = getTodaySchedule(schedule, date);
  const nextToday = today.find((entry) => timeToSeconds(entry.time) > nowSeconds);

  if (nextToday) {
    return {
      entry: nextToday,
      date: dateAtTime(date, nextToday.time),
    };
  }

  for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + dayOffset);
    const entries = getTodaySchedule(schedule, nextDate);

    if (entries.length > 0) {
      return {
        entry: entries[0],
        date: dateAtTime(nextDate, entries[0].time),
      };
    }
  }

  return null;
}

export function isPlayerOnline(
  playerStatus: PlayerStatus,
  now: Date = new Date(),
) {
  if (!playerStatus.lastSeenAt) {
    return false;
  }

  return (
    now.getTime() - new Date(playerStatus.lastSeenAt).getTime() <
    playerHeartbeatTimeoutMs
  );
}

function dateAtTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const nextDate = new Date(date);
  nextDate.setHours(hours, minutes, 0, 0);
  return nextDate;
}
