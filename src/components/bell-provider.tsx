"use client";

import {
  AudioStatus,
  BellLog,
  BellSettings,
  BellSource,
  BellStatus,
  BellSystemSnapshot,
  ScheduleEntry,
  defaultPlayerStatus,
  defaultSchedule,
  defaultSettings,
  isPlayerOnline,
} from "@/lib/bell-data";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type BellContextValue = {
  currentTime: Date;
  status: BellStatus;
  audioStatus: AudioStatus;
  schedule: ScheduleEntry[];
  logs: BellLog[];
  settings: BellSettings;
  storageStatus: string;
  playerStatus: BellSystemSnapshot["playerStatus"];
  hostPlayerOnline: boolean;
  availableSounds: string[];
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
  refresh: () => void;
};

const BellContext = createContext<BellContextValue | null>(null);

function createFallbackSnapshot(): BellSystemSnapshot {
  return {
    status: "active",
    schedule: defaultSchedule,
    logs: [],
    settings: defaultSettings,
    playerStatus: defaultPlayerStatus,
    serverTime: new Date().toISOString(),
    storageStatus: "Host file storage active",
  };
}

export function BellProvider({ children }: { children: React.ReactNode }) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [snapshot, setSnapshot] = useState<BellSystemSnapshot>(createFallbackSnapshot);

  const applySnapshot = useCallback((nextSnapshot: BellSystemSnapshot) => {
    setSnapshot(nextSnapshot);
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/system", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to load bell system state");
    }

    applySnapshot((await response.json()) as BellSystemSnapshot);
  }, [applySnapshot]);

  const postAction = useCallback(
    async (action: unknown) => {
      const response = await fetch("/api/system", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(action),
      });

      if (!response.ok) {
        throw new Error("Unable to update bell system state");
      }

      applySnapshot((await response.json()) as BellSystemSnapshot);
    },
    [applySnapshot],
  );

  useEffect(() => {
    const initialLoad = async () => {
      try {
        await refresh();
      } catch (error) {
        console.error(error);
      }
    };

    void initialLoad();
  }, [refresh]);

  useEffect(() => {
    window.queueMicrotask(() => setCurrentTime(new Date()));

    const interval = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh().catch((error) => {
        console.error(error);
      });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [refresh]);

  const hostPlayerOnline = isPlayerOnline(snapshot.playerStatus, currentTime);
  const audioStatus: AudioStatus =
    hostPlayerOnline && snapshot.playerStatus.audioEnabled ? "enabled" : "not-enabled";

  const value = useMemo<BellContextValue>(
    () => ({
      currentTime,
      status: snapshot.status,
      audioStatus,
      schedule: snapshot.schedule,
      logs: snapshot.logs,
      settings: snapshot.settings,
      storageStatus: snapshot.storageStatus,
      playerStatus: snapshot.playerStatus,
      hostPlayerOnline,
      availableSounds: snapshot.availableSounds ?? [],
      setStatus: (status) => {
        void postAction({ type: "set-status", status }).catch((error) => {
          console.error(error);
        });
      },
      emergencyStop: () => {
        void postAction({ type: "emergency-stop" }).catch((error) => {
          console.error(error);
        });
      },
      ringBell: (entry, source = "manual") => {
        if (
          snapshot.status === "emergency-stopped" &&
          source === "manual" &&
          !window.confirm(
            "Emergency stop is active. Confirm that you still want to ring the bell from the main player computer.",
          )
        ) {
          return;
        }

        void postAction({
          type: "ring-bell",
          entryId: entry?.id ?? null,
          source,
        }).catch((error) => {
          console.error(error);
        });
      },
      addScheduleEntry: (entry) => {
        void postAction({ type: "add-schedule-entry", entry }).catch((error) => {
          console.error(error);
        });
      },
      updateScheduleEntry: (id, entry) => {
        void postAction({ type: "update-schedule-entry", id, entry }).catch(
          (error) => {
            console.error(error);
          },
        );
      },
      deleteScheduleEntry: (id) => {
        void postAction({ type: "delete-schedule-entry", id }).catch((error) => {
          console.error(error);
        });
      },
      toggleScheduleEntry: (id) => {
        void postAction({ type: "toggle-schedule-entry", id }).catch((error) => {
          console.error(error);
        });
      },
      clearLogs: () => {
        void postAction({ type: "clear-logs" }).catch((error) => {
          console.error(error);
        });
      },
      updateSettings: (settings) => {
        void postAction({ type: "update-settings", settings }).catch((error) => {
          console.error(error);
        });
      },
      resetDemoData: () => {
        void postAction({ type: "reset-demo-data" }).catch((error) => {
          console.error(error);
        });
      },
      refresh: () => {
        void refresh().catch((error) => {
          console.error(error);
        });
      },
    }),
    [
      audioStatus,
      currentTime,
      hostPlayerOnline,
      postAction,
      refresh,
      snapshot.logs,
      snapshot.playerStatus,
      snapshot.schedule,
      snapshot.settings,
      snapshot.status,
      snapshot.storageStatus,
      snapshot.availableSounds,
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
