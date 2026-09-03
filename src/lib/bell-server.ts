import "server-only";

import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { exec, spawn, ChildProcess } from "node:child_process";
import {
  BellLog,
  BellSettings,
  BellSource,
  BellStatus,
  BellSystemSnapshot,
  PlayerSignal,
  PlayerStatus,
  ScheduleEntry,
  defaultPlayerStatus,
  defaultSchedule,
  defaultSettings,
  getTodaySchedule,
  secondsSinceMidnight,
  timeToSeconds,
} from "@/lib/bell-data";

type BellSystemStore = {
  version: 1;
  status: BellStatus;
  schedule: ScheduleEntry[];
  logs: BellLog[];
  settings: BellSettings;
  playerSignals: PlayerSignal[];
  triggeredBellKeys: string[];
  lastAutomaticCheckAt: string | null;
  playerStatus: PlayerStatus;
};

type BellAction =
  | { type: "set-status"; status: BellStatus }
  | { type: "emergency-stop" }
  | {
      type: "ring-bell";
      entryId: string | null;
      source: BellSource;
      tone?: string;
      volume?: number;
      durationSeconds?: number;
    }
  | { type: "add-schedule-entry"; entry: Omit<ScheduleEntry, "id"> }
  | { type: "update-schedule-entry"; id: string; entry: Omit<ScheduleEntry, "id"> }
  | { type: "delete-schedule-entry"; id: string }
  | { type: "toggle-schedule-entry"; id: string }
  | { type: "replace-schedule"; entries: ScheduleEntry[] }
  | { type: "clear-logs" }
  | { type: "update-settings"; settings: BellSettings }
  | { type: "reset-demo-data" };

type PlayerPollInput = {
  audioEnabled: boolean;
  label?: string;
};

type PlayerPollResult = {
  signal: PlayerSignal | null;
  snapshot: BellSystemSnapshot;
};

const dataDirectory = path.join(process.cwd(), "data");
const storePath = path.join(dataDirectory, "bell-system.json");
const storageStatus = "Host file storage active";
let operationQueue: Promise<unknown> = Promise.resolve();

function createDefaultStore(): BellSystemStore {
  return {
    version: 1,
    status: "active",
    schedule: defaultSchedule,
    logs: [],
    settings: defaultSettings,
    playerSignals: [],
    triggeredBellKeys: [],
    lastAutomaticCheckAt: null,
    playerStatus: defaultPlayerStatus,
  };
}

async function ensureStoreFile() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(
      storePath,
      JSON.stringify(createDefaultStore(), null, 2),
      "utf8",
    );
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(storePath, "utf8");

  try {
    return normalizeStore(JSON.parse(raw));
  } catch {
    const fallback = createDefaultStore();
    await writeStore(fallback);
    return fallback;
  }
}

async function writeStore(store: BellSystemStore) {
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

function normalizeStore(value: unknown): BellSystemStore {
  const fallback = createDefaultStore();
  const candidate = value as Partial<BellSystemStore> | null;

  return {
    version: 1,
    status: normalizeStatus(candidate?.status),
    schedule: Array.isArray(candidate?.schedule)
      ? candidate.schedule.map(normalizeScheduleEntry)
      : fallback.schedule,
    logs: Array.isArray(candidate?.logs)
      ? candidate.logs
          .map(normalizeLog)
          .filter(Boolean)
          .slice(0, 200) as BellLog[]
      : fallback.logs,
    settings: normalizeSettings(candidate?.settings),
    playerSignals: Array.isArray(candidate?.playerSignals)
      ? candidate.playerSignals
          .map(normalizeSignal)
          .filter(Boolean) as PlayerSignal[]
      : fallback.playerSignals,
    triggeredBellKeys: Array.isArray(candidate?.triggeredBellKeys)
      ? candidate.triggeredBellKeys.filter((item): item is string => typeof item === "string")
      : fallback.triggeredBellKeys,
    lastAutomaticCheckAt:
      typeof candidate?.lastAutomaticCheckAt === "string"
        ? candidate.lastAutomaticCheckAt
        : fallback.lastAutomaticCheckAt,
    playerStatus: normalizePlayerStatus(candidate?.playerStatus),
  };
}

function normalizeStatus(value: unknown): BellStatus {
  return value === "paused" || value === "emergency-stopped" ? value : "active";
}

function normalizeScheduleEntry(value: ScheduleEntry): ScheduleEntry {
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
    label: typeof value.label === "string" ? value.label : "Untitled bell",
    time: typeof value.time === "string" ? value.time : "08:00",
    days: Array.isArray(value.days)
      ? value.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : [1, 2, 3, 4, 5],
    tone: typeof value.tone === "string" ? value.tone : "classic",
    enabled: value.enabled !== false,
    note: typeof value.note === "string" ? value.note : "",
  };
}

function normalizeLog(value: BellLog | null | undefined) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.timestamp !== "string" ||
    typeof value.message !== "string" ||
    typeof value.detail !== "string"
  ) {
    return null;
  }

  const source: BellSource =
    value.source === "automatic" || value.source === "manual" ? value.source : "system";

  return {
    id: value.id,
    timestamp: value.timestamp,
    source,
    message: value.message,
    detail: value.detail,
  };
}

function normalizeSignal(value: PlayerSignal | null | undefined) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (value.type === "stop") {
    if (
      typeof value.id !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.reason !== "string"
    ) {
      return null;
    }

    return value;
  }

  if (
    value.type === "ring" &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.label === "string" &&
    typeof value.detail === "string" &&
    typeof value.durationSeconds === "number" &&
    typeof value.volume === "number"
  ) {
    return {
      ...value,
      source:
        value.source === "automatic" || value.source === "manual"
          ? value.source
          : "system",
      tone: typeof value.tone === "string" ? value.tone : "classic",
      entryId: typeof value.entryId === "string" ? value.entryId : null,
      durationSeconds: clamp(value.durationSeconds, 1, 60),
      volume: clamp(value.volume, 0, 100),
    };
  }

  return null;
}

function normalizeSettings(value: Partial<BellSettings> | null | undefined): BellSettings {
  return {
    schoolName:
      typeof value?.schoolName === "string" && value.schoolName.trim()
        ? value.schoolName.trim()
        : defaultSettings.schoolName,
    bellVolume: clamp(value?.bellVolume ?? defaultSettings.bellVolume, 0, 100),
    bellDuration: clamp(value?.bellDuration ?? defaultSettings.bellDuration, 1, 60),
    autoTriggerWindowSeconds: clamp(
      value?.autoTriggerWindowSeconds ?? defaultSettings.autoTriggerWindowSeconds,
      15,
      60,
    ),
    manualTone:
      typeof value?.manualTone === "string"
        ? value.manualTone
        : defaultSettings.manualTone,
  };
}

function normalizePlayerStatus(value: Partial<PlayerStatus> | null | undefined): PlayerStatus {
  return {
    lastSeenAt: typeof value?.lastSeenAt === "string" ? value.lastSeenAt : null,
    audioEnabled: value?.audioEnabled === true,
    label:
      typeof value?.label === "string" && value.label.trim()
        ? value.label.trim()
        : defaultPlayerStatus.label,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

async function withStoreLock<T>(work: (store: BellSystemStore) => Promise<T> | T) {
  const run = operationQueue.then(async () => {
    const store = await readStore();
    const result = await work(store);
    await writeStore(store);
    return result;
  });

  operationQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

function writeLog(store: BellSystemStore, source: BellSource, message: string, detail: string) {
  store.logs = [
    {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      source,
      message,
      detail,
    },
    ...store.logs,
  ].slice(0, 200);
}

let activePlayProcess: ChildProcess | null = null;

function resolveAudioPath(relativePath: string): string {
  // 1. Try process.cwd()
  let testPath = path.join(process.cwd(), relativePath);
  if (existsSync(testPath)) {
    return testPath;
  }

  // 2. Try looking in parent directories of process.cwd()
  let currentDir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
    testPath = path.join(currentDir, relativePath);
    if (existsSync(testPath)) {
      return testPath;
    }
  }

  // 3. Try looking in subdirectories of process.cwd() (if started from parent folder)
  testPath = path.join(process.cwd(), "New project 3", relativePath);
  if (existsSync(testPath)) {
    return testPath;
  }

  testPath = path.join(process.cwd(), "alarm-sys", relativePath);
  if (existsSync(testPath)) {
    return testPath;
  }

  // Fallback to process.cwd() path
  return path.join(process.cwd(), relativePath);
}

function playSoundOnServer(tone: string, volume: number, durationSeconds: number) {
  // Kill any currently playing process first to avoid overlapping audio
  if (activePlayProcess) {
    try {
      activePlayProcess.kill();
    } catch (e) {
      console.error("Failed to kill active playback process:", e);
    }
    activePlayProcess = null;
  }

  // Determine path to the audio file
  const isCustomFile =
    tone.includes(".") ||
    tone.endsWith(".mp3") ||
    tone.endsWith(".wav") ||
    tone.endsWith(".ogg") ||
    tone.endsWith(".m4a") ||
    tone.endsWith(".aac");

  let relativePath = "";
  if (isCustomFile) {
    relativePath = `public/sounds/${tone}`;
  } else {
    // Map built-in tone keys to their generated files
    if (tone === "short") {
      relativePath = "public/sounds/short_beep.wav";
    } else if (tone === "chime") {
      relativePath = "public/sounds/recess_chime.wav";
    } else {
      relativePath = "public/sounds/classic_school_bell.wav";
    }
  }

  const absolutePath = resolveAudioPath(relativePath);
  const vol = Math.min(1, Math.max(0, volume / 100));

  if (process.platform === "darwin") {
    try {
      console.log(`[macOS Player] Spawning afplay for: ${absolutePath}`);
      const processInstance = spawn("afplay", [
        "-v",
        vol.toString(),
        "-t",
        durationSeconds.toString(),
        absolutePath,
      ]);
      activePlayProcess = processInstance;
      processInstance.stderr.on("data", (data) => {
        console.error("[macOS Player Error]:", data.toString());
      });
      processInstance.on("error", (err) => {
        console.error("afplay server-side playback failed to spawn:", err);
      });
      processInstance.on("exit", (code) => {
        console.log(`[macOS Player] afplay exited with code ${code}`);
        if (activePlayProcess === processInstance) {
          activePlayProcess = null;
        }
      });
    } catch (err) {
      console.error("afplay spawn error:", err);
    }
  } else if (process.platform === "win32") {
    // On Windows, use Win32 MCI (winmm.dll) API via C# inline in PowerShell.
    // mciSendString is built into all Windows OS releases (Win 7/8/10/11) and works in background processes.
    const psScript = `
$ErrorActionPreference = 'Stop'
$filePath = [System.IO.Path]::GetFullPath("${absolutePath.replace(/"/g, '`"')}")
$volInt = [int](${vol} * 100)
$duration = ${durationSeconds}

try {
    $csharp = @'
    using System;
    using System.Text;
    using System.Runtime.InteropServices;

    public class WinMciAudio {
        [DllImport("winmm.dll", CharSet = CharSet.Auto)]
        private static extern int mciSendString(string command, StringBuilder buffer, int bufferSize, IntPtr hwndCallback);

        public static bool PlayAudio(string path, int volumePercent, int durationSec) {
            string alias = "bell_" + Guid.NewGuid().ToString("N");
            int openRes = mciSendString("open \\"" + path + "\\" type mpegvideo alias " + alias, null, 0, IntPtr.Zero);
            if (openRes != 0) {
                openRes = mciSendString("open \\"" + path + "\\" alias " + alias, null, 0, IntPtr.Zero);
            }
            if (openRes != 0) return false;

            int mciVol = Math.Max(0, Math.Min(1000, volumePercent * 10));
            mciSendString("setaudio " + alias + " volume to " + mciVol, null, 0, IntPtr.Zero);
            mciSendString("play " + alias + " from 0", null, 0, IntPtr.Zero);

            System.Threading.Thread.Sleep(durationSec * 1000);

            mciSendString("stop " + alias, null, 0, IntPtr.Zero);
            mciSendString("close " + alias, null, 0, IntPtr.Zero);
            return true;
        }
    }
'@
    Add-Type -TypeDefinition $csharp
    $success = [WinMciAudio]::PlayAudio($filePath, $volInt, $duration)
    if ($success) { exit 0 }
} catch {
    # Fallback to WMPlayer COM object if C# MCI fails
}

try {
    $wmp = New-Object -ComObject WMPlayer.OCX
    $wmp.settings.volume = $volInt
    $wmp.URL = $filePath
    $wmp.controls.play()

    $waited = 0
    while ($wmp.playState -ne 3 -and $waited -lt 30) {
        Start-Sleep -Milliseconds 100
        $waited++
    }

    Start-Sleep -Seconds $duration
    $wmp.controls.stop()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wmp) | Out-Null
    exit 0
} catch {
    Write-Error $_
}
`;

    const encodedCommand = Buffer.from(psScript, "utf16le").toString("base64");

    try {
      console.log(`[Windows Player] Spawning powershell -EncodedCommand to play: ${absolutePath}`);
      const processInstance = spawn("powershell.exe", [
        "-NoProfile",
        "-Sta",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedCommand,
      ]);
      activePlayProcess = processInstance;
      processInstance.stderr.on("data", (data) => {
        console.error("[Windows Player Error]:", data.toString());
      });
      processInstance.on("error", (err) => {
        console.error("Windows powershell playback failed to spawn:", err);
      });
      processInstance.on("exit", (code) => {
        console.log(`[Windows Player] PowerShell exited with code ${code}`);
        if (activePlayProcess === processInstance) {
          activePlayProcess = null;
        }
      });
    } catch (err) {
      console.error("Windows play spawn error:", err);
    }
  } else {
    // On Linux, try aplay (ALSA) or paplay (PulseAudio)
    try {
      console.log(`[Linux Player] Spawning aplay for: ${absolutePath}`);
      const processInstance = spawn("aplay", [absolutePath]);
      activePlayProcess = processInstance;
      processInstance.stderr.on("data", (data) => {
        console.error("[Linux Player Error]:", data.toString());
      });
      processInstance.on("error", () => {
        // Fallback to paplay if aplay fails
        try {
          console.log(`[Linux Player] aplay failed, falling back to paplay...`);
          const fallbackInstance = spawn("paplay", [absolutePath]);
          activePlayProcess = fallbackInstance;
          fallbackInstance.stderr.on("data", (data) => {
            console.error("[Linux Player Error (paplay)]:", data.toString());
          });
          fallbackInstance.on("exit", (code) => {
            console.log(`[Linux Player] paplay exited with code ${code}`);
            if (activePlayProcess === fallbackInstance) {
              activePlayProcess = null;
            }
          });
        } catch (err) {
          console.error("Linux paplay spawn error:", err);
        }
      });
      processInstance.on("exit", (code) => {
        console.log(`[Linux Player] aplay exited with code ${code}`);
        if (activePlayProcess === processInstance) {
          activePlayProcess = null;
        }
      });
    } catch (err) {
      console.error("Linux play spawn error:", err);
    }
  }
}

function queueRingSignal(
  store: BellSystemStore,
  entry: ScheduleEntry | null,
  source: BellSource,
  detail: string,
  overrideTone?: string,
  overrideVolume?: number,
  overrideDurationSeconds?: number,
) {
  const label = entry?.label ?? "Manual override";
  const tone = overrideTone ?? entry?.tone ?? store.settings.manualTone ?? "classic";
  const durationSeconds = overrideDurationSeconds ?? store.settings.bellDuration;
  const volume = overrideVolume ?? store.settings.bellVolume;

  const signal: PlayerSignal = {
    id: crypto.randomUUID(),
    type: "ring",
    createdAt: new Date().toISOString(),
    source,
    entryId: entry?.id ?? null,
    label,
    tone,
    durationSeconds,
    volume,
    detail,
  };

  store.playerSignals.push(signal);
  writeLog(store, source, `${label} bell triggered`, detail);

  // Play natively on the host Mac server so it sounds directly from the server computer
  playSoundOnServer(tone, volume, durationSeconds);
}

function queueStopSignal(store: BellSystemStore, reason: string) {
  if (activePlayProcess) {
    try {
      activePlayProcess.kill();
    } catch (e) {
      console.error("Failed to kill active playback process on stop signal:", e);
    }
    activePlayProcess = null;
  }

  if (process.platform === "darwin") {
    exec("killall afplay 2>/dev/null || true", () => {});
  }
  store.playerSignals = [
    {
      id: crypto.randomUUID(),
      type: "stop",
      createdAt: new Date().toISOString(),
      reason,
    },
  ];
}

async function getAvailableSounds(): Promise<string[]> {
  const soundsDir = path.join(process.cwd(), "public", "sounds");
  try {
    await fs.mkdir(soundsDir, { recursive: true });
    const files = await fs.readdir(soundsDir);
    return files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return (
        !file.startsWith(".") &&
        [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".mp4"].includes(ext)
      );
    });
  } catch (error) {
    console.error("Error reading sounds directory:", error);
    return [];
  }
}

async function buildSnapshot(store: BellSystemStore): Promise<BellSystemSnapshot> {
  const availableSounds = await getAvailableSounds();
  return {
    status: store.status,
    schedule: store.schedule,
    logs: store.logs,
    settings: store.settings,
    playerStatus: store.playerStatus,
    serverTime: new Date().toISOString(),
    storageStatus,
    availableSounds,
  };
}

function cleanupTriggeredKeys(store: BellSystemStore, todayKey: string) {
  const cutoff = new Date(`${todayKey}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffKey = formatLocalDateKey(cutoff);

  store.triggeredBellKeys = store.triggeredBellKeys.filter((key) => {
    const [dateKey] = key.split("|");
    return dateKey >= cutoffKey;
  });
}

function isBellTriggered(store: BellSystemStore, todayKey: string, entry: ScheduleEntry): boolean {
  const specificKey = `${todayKey}|${entry.id}|${entry.time}`;
  const legacyKey = `${todayKey}|${entry.id}`;
  return store.triggeredBellKeys.includes(specificKey) || store.triggeredBellKeys.includes(legacyKey);
}

function clearTriggeredKeysForEntry(store: BellSystemStore, entryId: string) {
  store.triggeredBellKeys = store.triggeredBellKeys.filter((key) => {
    const parts = key.split("|");
    return parts[1] !== entryId;
  });
}

function processAutomaticTriggers(store: BellSystemStore, now: Date) {
  const todayKey = formatLocalDateKey(now);
  cleanupTriggeredKeys(store, todayKey);

  if (store.status !== "active") {
    store.lastAutomaticCheckAt = now.toISOString();
    return;
  }

  const todaySchedule = getTodaySchedule(store.schedule, now);
  const nowSeconds = secondsSinceMidnight(now);
  const catchUpWindowSeconds = Math.max(store.settings.autoTriggerWindowSeconds, 5 * 60);

  for (const entry of todaySchedule) {
    const entrySeconds = timeToSeconds(entry.time);
    const triggerKey = `${todayKey}|${entry.id}|${entry.time}`;

    if (
      nowSeconds >= entrySeconds &&
      nowSeconds - entrySeconds <= catchUpWindowSeconds &&
      !isBellTriggered(store, todayKey, entry)
    ) {
      store.triggeredBellKeys.push(triggerKey);
      queueRingSignal(store, entry, "automatic", `${entry.time} scheduled bell`);
    }
  }

  store.lastAutomaticCheckAt = now.toISOString();
}

function sortSchedule(entries: ScheduleEntry[]) {
  return [...entries].sort((left, right) => timeToSeconds(left.time) - timeToSeconds(right.time));
}

export async function getBellSystemSnapshot() {
  return withStoreLock(async (store) => {
    processAutomaticTriggers(store, new Date());
    return await buildSnapshot(store);
  });
}

export async function dispatchBellAction(action: BellAction) {
  return withStoreLock(async (store) => {
    processAutomaticTriggers(store, new Date());

    switch (action.type) {
      case "set-status":
        store.status = action.status;
        writeLog(
          store,
          "system",
          action.status === "active"
            ? "Schedule resumed"
            : action.status === "paused"
              ? "Schedule paused"
              : "Emergency stop activated",
          "Operator changed automatic trigger state",
        );
        break;
      case "emergency-stop":
        store.status = "emergency-stopped";
        queueStopSignal(store, "Emergency stop activated");
        writeLog(
          store,
          "system",
          "Emergency stop activated",
          "Automatic bell triggers disabled until schedule is resumed",
        );
        break;
      case "ring-bell": {
        const entry =
          action.entryId !== null
            ? store.schedule.find((item) => item.id === action.entryId) ?? null
            : null;
        const detail =
          action.source === "automatic"
            ? `${entry?.time ?? "--:--"} scheduled bell`
            : "Triggered from dashboard control";
        queueRingSignal(
          store,
          entry,
          action.source,
          detail,
          action.tone,
          action.volume,
          action.durationSeconds,
        );
        break;
      }
      case "add-schedule-entry": {
        const entry = normalizeScheduleEntry({
          ...action.entry,
          id: crypto.randomUUID(),
        });
        store.schedule = sortSchedule([...store.schedule, entry]);
        writeLog(store, "system", "Schedule entry added", `${entry.time} ${entry.label}`);
        break;
      }
      case "update-schedule-entry": {
        const entry = normalizeScheduleEntry({ ...action.entry, id: action.id });
        store.schedule = sortSchedule(
          store.schedule.map((item) => (item.id === action.id ? entry : item)),
        );
        clearTriggeredKeysForEntry(store, action.id);
        writeLog(store, "system", "Schedule entry updated", `${entry.time} ${entry.label}`);
        break;
      }
      case "delete-schedule-entry": {
        const deleted = store.schedule.find((item) => item.id === action.id) ?? null;
        store.schedule = store.schedule.filter((item) => item.id !== action.id);
        clearTriggeredKeysForEntry(store, action.id);
        writeLog(
          store,
          "system",
          "Schedule entry removed",
          deleted ? `${deleted.time} ${deleted.label}` : action.id,
        );
        break;
      }
      case "toggle-schedule-entry": {
        const existing = store.schedule.find((item) => item.id === action.id) ?? null;
        const changed = existing ? { ...existing, enabled: !existing.enabled } : null;
        store.schedule = store.schedule.map((item) =>
          item.id === action.id && changed ? changed : item,
        );

        clearTriggeredKeysForEntry(store, action.id);
        if (changed) {
          writeLog(
            store,
            "system",
            changed.enabled ? "Schedule entry enabled" : "Schedule entry disabled",
            `${changed.time} ${changed.label}`,
          );
        }
        break;
      }
      case "replace-schedule":
        store.schedule = sortSchedule(action.entries.map((entry) => normalizeScheduleEntry(entry)));
        store.triggeredBellKeys = [];
        writeLog(store, "system", "Schedule imported", `${store.schedule.length} entries uploaded`);
        break;
      case "clear-logs":
        store.logs = [];
        break;
      case "update-settings":
        store.settings = normalizeSettings(action.settings);
        writeLog(store, "system", "Settings updated", "Audio and school profile saved");
        break;
      case "reset-demo-data":
        store.status = "active";
        store.schedule = defaultSchedule;
        store.logs = [];
        store.settings = defaultSettings;
        store.playerSignals = [];
        store.triggeredBellKeys = [];
        store.lastAutomaticCheckAt = null;
        store.playerStatus = defaultPlayerStatus;
        break;
    }

    return await buildSnapshot(store);
  });
}

export async function pollPlayer(input: PlayerPollInput): Promise<PlayerPollResult> {
  return withStoreLock(async (store) => {
    processAutomaticTriggers(store, new Date());

    store.playerStatus = {
      lastSeenAt: new Date().toISOString(),
      audioEnabled: input.audioEnabled,
      label:
        typeof input.label === "string" && input.label.trim()
          ? input.label.trim()
          : store.playerStatus.label,
    };

    const stopSignalIndex = store.playerSignals.findIndex((signal) => signal.type === "stop");
    if (stopSignalIndex >= 0) {
      const [signal] = store.playerSignals.splice(stopSignalIndex, 1);
      return {
        signal,
        snapshot: await buildSnapshot(store),
      };
    }

    if (!input.audioEnabled) {
      return {
        signal: null,
        snapshot: await buildSnapshot(store),
      };
    }

    const ringSignalIndex = store.playerSignals.findIndex((signal) => signal.type === "ring");
    if (ringSignalIndex >= 0) {
      const [signal] = store.playerSignals.splice(ringSignalIndex, 1);
      return {
        signal,
        snapshot: await buildSnapshot(store),
      };
    }

    return {
      signal: null,
      snapshot: await buildSnapshot(store),
    };
  });
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Start a background interval on the server to ensure automatic triggers fire
// even if no frontend browser is currently actively polling the API.
// We use a global variable to prevent hot-reloads in dev mode from spawning multiple intervals.
const globalWithBellInterval = global as typeof globalThis & {
  __bellSystemInterval?: NodeJS.Timeout;
};

if (!globalWithBellInterval.__bellSystemInterval) {
  globalWithBellInterval.__bellSystemInterval = setInterval(() => {
    withStoreLock((store) => {
      processAutomaticTriggers(store, new Date());
    }).catch(console.error);
  }, 3000); // Check the schedule every 3 seconds
}
