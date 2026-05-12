"use client";

import {
  BellLog,
  BellSettings,
  BellSource,
  BellStatus,
  BellTone,
  ScheduleEntry,
  defaultSchedule,
  defaultSettings,
  secondsSinceMidnight,
  timeToSeconds,
} from "@/lib/bell-data";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type BellContextValue = {
  currentTime: Date;
  status: BellStatus;
  audioStatus: "enabled" | "not-enabled";
  schedule: ScheduleEntry[];
  logs: BellLog[];
  settings: BellSettings;
  setStatus: (status: BellStatus) => void;
  emergencyStop: () => void;
  ringBell: (entry?: ScheduleEntry, source?: BellSource) => void;
  addScheduleEntry: (entry: Omit<ScheduleEntry, "id">) => void;
  updateScheduleEntry: (id: string, entry: Omit<ScheduleEntry, "id">) => void;
  deleteScheduleEntry: (id: string) => void;
  toggleScheduleEntry: (id: string) => void;
  clearLogs: () => void;
  updateSettings: (settings: BellSettings) => void;
  resetDemoData: () => void;
};

const BellContext = createContext<BellContextValue | null>(null);

const storageKeys = {
  status: "school-bell-status",
  schedule: "school-bell-schedule",
  logs: "school-bell-logs",
  settings: "school-bell-settings",
};

const customBellAudioPath = "/sounds/bell.mp3";

export function BellProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date(0));
  const [status, setStatusState] = useState<BellStatus>("active");
  const [audioStatus, setAudioStatus] =
    useState<BellContextValue["audioStatus"]>("not-enabled");
  const [schedule, setSchedule] = useState<ScheduleEntry[]>(defaultSchedule);
  const [logs, setLogs] = useState<BellLog[]>([]);
  const [settings, setSettings] = useState<BellSettings>(defaultSettings);
  const triggeredRef = useRef<Set<string>>(new Set());
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const writeLog = useCallback(
    (source: BellSource, message: string, detail: string) => {
      const log: BellLog = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source,
        message,
        detail,
      };

      setLogs((current) => [log, ...current].slice(0, 80));
    },
    [],
  );

  const stopActiveAudio = useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (currentAudioRef.current) {
      const audio = currentAudioRef.current;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();

      try {
        audio.currentTime = 0;
      } catch {
        // Some browsers will throw if the media source is no longer seekable.
      }

      currentAudioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setAudioStatus("not-enabled");
  }, []);

  const scheduleAudioStop = useCallback(
    (audio: HTMLAudioElement, durationSeconds: number) => {
      if (stopTimerRef.current !== null) {
        window.clearTimeout(stopTimerRef.current);
      }

      const duration = Math.max(1, Math.min(60, durationSeconds));
      stopTimerRef.current = window.setTimeout(() => {
        if (currentAudioRef.current === audio) {
          stopActiveAudio();
        }
      }, duration * 1000);
    },
    [stopActiveAudio],
  );

  const ringBell = useCallback(
    (entry?: ScheduleEntry, source: BellSource = "manual") => {
      if (
        status === "emergency-stopped" &&
        source === "manual" &&
        !window.confirm(
          "Emergency stop is active. Confirm that you still want to ring the bell manually from this computer.",
        )
      ) {
        return;
      }

      const label = entry?.label ?? "Manual override";
      const tone = entry?.tone ?? "classic";
      const bellVolume = Math.min(100, Math.max(0, settings.bellVolume));
      const bellDuration = Math.max(1, Math.min(60, settings.bellDuration));
      const detail =
        source === "automatic"
          ? `${entry?.time ?? "--:--"} scheduled bell`
          : "Triggered from dashboard control";

      stopActiveAudio();
      writeLog(source, `${label} bell triggered`, detail);

      const audio = new Audio(customBellAudioPath);
      let triedGeneratedFallback = false;

      currentAudioRef.current = audio;

      audio.loop = true;
      audio.volume = Math.min(1, Math.max(0, bellVolume / 100));
      const playGeneratedFallback = () => {
        if (triedGeneratedFallback || currentAudioRef.current !== audio) return false;

        triedGeneratedFallback = true;
        objectUrlRef.current = URL.createObjectURL(
          createBellWav(tone, bellVolume, bellDuration),
        );
        audio.src = objectUrlRef.current;
        audio
          .play()
          .then(() => {
            setAudioStatus("enabled");
            scheduleAudioStop(audio, bellDuration);
          })
          .catch(() => {
            stopActiveAudio();
            writeLog(
              "system",
              "Browser blocked audio playback",
              "Interact with the page once, then try again",
            );
          });

        return true;
      };

      audio.onended = () => {
        if (currentAudioRef.current === audio) {
          stopActiveAudio();
        }
      };
      audio.onerror = () => {
        playGeneratedFallback();
      };
      audio
        .play()
        .then(() => {
          setAudioStatus("enabled");
          scheduleAudioStop(audio, bellDuration);
        })
        .catch(() => {
          if (playGeneratedFallback()) return;

          stopActiveAudio();
          writeLog(
            "system",
            "Browser blocked audio playback",
            "Interact with the page once, then try again",
          );
        });
    },
    [
      scheduleAudioStop,
      settings.bellDuration,
      settings.bellVolume,
      status,
      stopActiveAudio,
      writeLog,
    ],
  );

  const setStatus = useCallback(
    (nextStatus: BellStatus) => {
      setStatusState(nextStatus);
      triggeredRef.current.clear();
      writeLog(
        "system",
        nextStatus === "active"
          ? "Schedule resumed"
          : nextStatus === "emergency-stopped"
            ? "Emergency stop activated"
            : "Schedule paused",
        "Operator changed automatic trigger state",
      );
    },
    [writeLog],
  );

  const emergencyStop = useCallback(() => {
    setStatusState("emergency-stopped");
    triggeredRef.current.clear();
    stopActiveAudio();
    writeLog(
      "system",
      "Emergency stop activated",
      "Automatic bell triggers disabled until schedule is resumed",
    );
  }, [stopActiveAudio, writeLog]);

  useEffect(() => {
    window.queueMicrotask(() => setCurrentTime(new Date()));

    const interval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    window.queueMicrotask(() => {
      const storedStatus = readJson<BellStatus>(storageKeys.status);
      const storedSchedule = readJson<ScheduleEntry[]>(storageKeys.schedule);
      const storedLogs = readJson<BellLog[]>(storageKeys.logs);
      const storedSettings = readJson<BellSettings>(storageKeys.settings);

      if (storedStatus) setStatusState(storedStatus);
      if (storedSchedule) setSchedule(storedSchedule);
      if (storedLogs) setLogs(storedLogs);
      if (storedSettings) setSettings({ ...defaultSettings, ...storedSettings });

      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKeys.status, JSON.stringify(status));
  }, [hydrated, status]);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(storageKeys.schedule, JSON.stringify(schedule));
    }
  }, [hydrated, schedule]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKeys.logs, JSON.stringify(logs));
  }, [hydrated, logs]);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(storageKeys.settings, JSON.stringify(settings));
    }
  }, [hydrated, settings]);

  useEffect(() => {
    if (status !== "active") return;

    const todayKey = formatLocalDateKey(currentTime);
    const nowSeconds = secondsSinceMidnight(currentTime);
    const dueEntry = schedule.find((entry) => {
      if (!entry.enabled || !entry.days.includes(currentTime.getDay())) return false;

      const delta = nowSeconds - timeToSeconds(entry.time);
      return delta >= 0 && delta < settings.autoTriggerWindowSeconds;
    });

    if (!dueEntry) return;

    const triggerKey = `${todayKey}-${dueEntry.id}`;
    if (triggeredRef.current.has(triggerKey)) return;

    triggeredRef.current.add(triggerKey);
    ringBell(dueEntry, "automatic");
  }, [
    currentTime,
    ringBell,
    schedule,
    settings.autoTriggerWindowSeconds,
    status,
  ]);

  const value = useMemo<BellContextValue>(
    () => ({
      currentTime,
      status,
      audioStatus,
      schedule,
      logs,
      settings,
      setStatus,
      emergencyStop,
      ringBell,
      addScheduleEntry: (entry) => {
        setSchedule((current) =>
          [...current, { ...entry, id: crypto.randomUUID() }].sort(
            (a, b) => timeToSeconds(a.time) - timeToSeconds(b.time),
          ),
        );
        writeLog("system", "Schedule entry added", `${entry.time} ${entry.label}`);
      },
      updateScheduleEntry: (id, entry) => {
        setSchedule((current) =>
          current
            .map((item) => (item.id === id ? { ...entry, id } : item))
            .sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time)),
        );
        writeLog("system", "Schedule entry updated", `${entry.time} ${entry.label}`);
      },
      deleteScheduleEntry: (id) => {
        const deleted = schedule.find((entry) => entry.id === id);
        setSchedule((current) => current.filter((entry) => entry.id !== id));
        writeLog(
          "system",
          "Schedule entry removed",
          deleted ? `${deleted.time} ${deleted.label}` : id,
        );
      },
      toggleScheduleEntry: (id) => {
        setSchedule((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, enabled: !entry.enabled } : entry,
          ),
        );
      },
      clearLogs: () => setLogs([]),
      updateSettings: (nextSettings) => {
        setSettings(nextSettings);
        writeLog("system", "Settings updated", "Audio and school profile saved");
      },
      resetDemoData: () => {
        setStatusState("active");
        stopActiveAudio();
        setSchedule(defaultSchedule);
        setLogs([]);
        setSettings(defaultSettings);
        triggeredRef.current.clear();
      },
    }),
    [
      currentTime,
      audioStatus,
      emergencyStop,
      logs,
      ringBell,
      schedule,
      setStatus,
      settings,
      status,
      stopActiveAudio,
      writeLog,
    ],
  );

  return <BellContext.Provider value={value}>{children}</BellContext.Provider>;
}

export function useBellSystem() {
  const context = useContext(BellContext);

  if (!context) {
    throw new Error("useBellSystem must be used inside BellProvider");
  }

  return context;
}

function readJson<T>(key: string) {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function createBellWav(tone: BellTone, volume: number, durationSeconds: number) {
  const sampleRate = 44100;
  const duration = Math.max(1, Math.min(60, durationSeconds));
  const sampleCount = Math.floor(sampleRate * duration);
  const dataLength = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const normalizedVolume = Math.min(1, Math.max(0.05, volume / 100));

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.max(0, 1 - t / duration);
    const wave = toneWave(t, tone) * envelope * normalizedVolume;
    view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, wave)) * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function toneWave(t: number, tone: BellTone) {
  if (tone === "short") {
    return Math.sin(2 * Math.PI * 980 * t);
  }

  if (tone === "chime") {
    return (
      Math.sin(2 * Math.PI * 523.25 * t) * 0.45 +
      Math.sin(2 * Math.PI * 659.25 * t) * 0.35 +
      Math.sin(2 * Math.PI * 783.99 * t) * 0.2
    );
  }

  const pulse = Math.sin(2 * Math.PI * 3.5 * t) > -0.2 ? 1 : 0.35;
  return Math.sin(2 * Math.PI * 880 * t) * pulse;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}
