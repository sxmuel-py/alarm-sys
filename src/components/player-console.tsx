"use client";

import {
  AudioStatus,
  BellRingSignal,
  BellSystemSnapshot,
  BellTone,
  PlayerSignal,
  defaultPlayerStatus,
  defaultSettings,
  formatDateTime,
  formatLongTime,
  isPlayerOnline,
  createBellWav,
} from "@/lib/bell-data";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const customBellAudioPath = "/sounds/bell.mp3";
const playerLabelStorageKey = "school-bell-player-label";

type PlayerPollResponse = {
  signal: PlayerSignal | null;
  snapshot: BellSystemSnapshot;
};

export function PlayerConsole() {
  const [currentTime, setCurrentTime] = useState(() => new Date(0));
  const [playerLabel, setPlayerLabel] = useState("Main bell PC");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<BellSystemSnapshot>({
    status: "active",
    schedule: [],
    logs: [],
    settings: defaultSettings,
    playerStatus: defaultPlayerStatus,
    serverTime: new Date().toISOString(),
    storageStatus: "Host file storage active",
  });
  const [lastSignalText, setLastSignalText] = useState("Waiting for shared bell commands");
  const [playbackState, setPlaybackState] = useState<"idle" | "ringing" | "stopped">("idle");
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    window.queueMicrotask(() => {
      setCurrentTime(new Date());
      setPlayerLabel(window.localStorage.getItem(playerLabelStorageKey) ?? "Main bell PC");
    });
  }, []);

  useEffect(() => {
    window.localStorage.setItem(playerLabelStorageKey, playerLabel);
  }, [playerLabel]);

  useEffect(() => {
    window.queueMicrotask(() => setCurrentTime(new Date()));

    const interval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

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
        // Ignore media seek failures when stopping old sources.
      }

      currentAudioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setPlaybackState("stopped");
  }, []);

  const playRingSignal = useCallback(
    async (signal: BellRingSignal) => {
      stopActiveAudio();
      setLastSignalText(`${signal.label} requested at ${formatDateTime(signal.createdAt)}`);

      // Determine audio path based on selected tone
      const isCustomFile =
        signal.tone.includes(".") ||
        signal.tone.endsWith(".mp3") ||
        signal.tone.endsWith(".wav") ||
        signal.tone.endsWith(".ogg") ||
        signal.tone.endsWith(".m4a") ||
        signal.tone.endsWith(".aac");

      const audioPath = isCustomFile
        ? `/sounds/${signal.tone}`
        : `/sounds/${signal.tone}.mp3`; // Try to load custom file for built-in tones if present

      const audio = new Audio(audioPath);
      const volume = Math.min(1, Math.max(0, signal.volume / 100));
      const durationSeconds = Math.max(1, Math.min(60, signal.durationSeconds));
      let triedGeneratedFallback = false;

      currentAudioRef.current = audio;
      audio.loop = true;
      audio.volume = volume;

      const scheduleStop = () => {
        stopTimerRef.current = window.setTimeout(() => {
          stopActiveAudio();
        }, durationSeconds * 1000);
      };

      const playGeneratedFallback = async () => {
        if (triedGeneratedFallback || currentAudioRef.current !== audio) {
          return;
        }

        triedGeneratedFallback = true;
        // Fall back to generated sound if it's a built-in tone key
        const fallbackTone = ["classic", "short", "chime"].includes(signal.tone)
          ? signal.tone
          : "classic";

        objectUrlRef.current = URL.createObjectURL(
          createBellWav(fallbackTone, signal.volume, durationSeconds),
        );
        audio.src = objectUrlRef.current;
        await audio.play();
        setPlaybackState("ringing");
        scheduleStop();
      };

      audio.onended = () => {
        stopActiveAudio();
      };
      audio.onerror = () => {
        void playGeneratedFallback().catch(() => {
          stopActiveAudio();
          setAudioEnabled(false);
          setLastSignalText("Audio playback was blocked. Re-enable player audio.");
        });
      };

      try {
        await audio.play();
        setPlaybackState("ringing");
        scheduleStop();
      } catch {
        try {
          await playGeneratedFallback();
        } catch {
          stopActiveAudio();
          setAudioEnabled(false);
          setLastSignalText("Audio playback was blocked. Re-enable player audio.");
        }
      }
    },
    [stopActiveAudio],
  );

  useEffect(() => {
    let disposed = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/player/poll", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audioEnabled,
            label: playerLabel,
          }),
        });

        if (!response.ok || disposed) {
          return;
        }

        const result = (await response.json()) as PlayerPollResponse;
        if (disposed) {
          return;
        }

        setSnapshot(result.snapshot);

        if (!result.signal) {
          return;
        }

        if (result.signal.type === "stop") {
          stopActiveAudio();
          setLastSignalText(result.signal.reason);
          return;
        }

        if (audioEnabled) {
          await playRingSignal(result.signal);
        }
      } catch (error) {
        if (!disposed) {
          console.error(error);
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 1000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [audioEnabled, playRingSignal, playerLabel, stopActiveAudio]);

  useEffect(() => {
    return () => {
      stopActiveAudio();
    };
  }, [stopActiveAudio]);

  const hostPlayerOnline = isPlayerOnline(snapshot.playerStatus, currentTime);
  const audioStatus: AudioStatus =
    hostPlayerOnline && snapshot.playerStatus.audioEnabled ? "enabled" : "not-enabled";
  const lastLog = snapshot.logs[0] ?? null;
  const lastBellLog =
    snapshot.logs.find((log) => log.message.toLowerCase().includes("bell triggered")) ?? null;
  const playerStateClass =
    playbackState === "ringing"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : playbackState === "stopped"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-white text-slate-700";
  const statusLabel = useMemo(() => {
    if (snapshot.status === "emergency-stopped") {
      return "Emergency stopped";
    }

    if (snapshot.status === "paused") {
      return "Paused";
    }

    return "Running";
  }, [snapshot.status]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-lg border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">
                Host Player Mode
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-normal text-white">
                {snapshot.settings.schoolName}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                Keep this screen open on the main bell computer. Other systems on the
                network can manage the schedule, but this page is the workstation that
                actually plays the bell audio.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <PlayerMetric label="Local time" value={formatLongTime(currentTime)} />
              <PlayerMetric label="Scheduler" value={statusLabel} />
              <PlayerMetric
                label="Host Playback"
                value="Active (afplay)"
              />
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-400">
                    Player workstation label
                  </p>
                  <input
                    value={playerLabel}
                    onChange={(event) => setPlayerLabel(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none ring-blue-300 transition focus:border-blue-400 focus:ring-4 md:w-72"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const unlock = new Audio(customBellAudioPath);
                      unlock.volume = 0;
                      await unlock.play();
                      unlock.pause();
                      unlock.currentTime = 0;
                      setAudioEnabled(true);
                      setLastSignalText("Player audio enabled and ready for shared bell commands");
                    } catch {
                      setAudioEnabled(false);
                      setLastSignalText(
                        "Browser blocked audio unlock. Interact again on this host computer.",
                      );
                    }
                  }}
                  className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Enable Player Audio
                </button>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <StatusPanel
                  label="Connection"
                  value={hostPlayerOnline ? "Online" : "Waiting"}
                  detail={
                    snapshot.playerStatus.lastSeenAt
                      ? `Last heartbeat ${formatDateTime(snapshot.playerStatus.lastSeenAt)}`
                      : "No player heartbeat yet"
                  }
                />
                <StatusPanel
                  label="Playback"
                  value={playbackState === "ringing" ? "Bell active" : "Standing by"}
                  detail={lastSignalText}
                />
                <StatusPanel
                  label="Storage"
                  value="Shared host file"
                  detail={snapshot.storageStatus}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 space-y-6">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">
                  Native macOS Playback (Active 🟢)
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  Operating System Level
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  The host server is configured to play all manual and scheduled bells natively through the computer's sound card/speakers using macOS <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-blue-400">afplay</code>. 
                  This runs at the OS level, meaning it is **100% immune** to browser autoplay locks, asleep tabs, or screensavers!
                </p>
              </div>

              <div className="border-t border-slate-800 pt-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Browser Audio (Backup / Monitor)
                </p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {audioEnabled ? "Armed (Double Output)" : "Muted (Bypassed)"}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {audioEnabled ? (
                    <span className="text-emerald-400 font-medium">Active: This browser tab will also play the bell sound as a secondary output backup.</span>
                  ) : (
                    <span className="text-slate-400">Not armed: The browser tab is muted. (You can click "Enable Player Audio" above to arm browser-level audio as a secondary backup output, but this is completely optional).</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <p className="text-base font-semibold text-white">Latest events</p>
              <div className="mt-4 space-y-4">
                <EventRow
                  label="Last system action"
                  value={lastLog ? lastLog.message : "Waiting for activity"}
                  detail={lastLog ? formatDateTime(lastLog.timestamp) : "No shared logs yet"}
                />
                <EventRow
                  label="Last bell trigger"
                  value={lastBellLog ? lastBellLog.message : "No bell fired yet"}
                  detail={
                    lastBellLog ? formatDateTime(lastBellLog.timestamp) : "No playback event"
                  }
                />
                <EventRow
                  label="Host player"
                  value={snapshot.playerStatus.label}
                  detail="Native OS Playback active (afplay)"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
              <p className="text-base font-semibold text-white">Operating notes</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li>Open this page on the main bell PC, not on a staff laptop.</li>
                <li>Leave the browser tab open during school hours.</li>
                <li>Remote users can control the system over LAN without taking audio playback away from this host machine.</li>
                <li>Emergency Stop from any dashboard sends an immediate stop signal here.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function PlayerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusPanel({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
    </div>
  );
}

function EventRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

