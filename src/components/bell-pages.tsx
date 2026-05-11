"use client";

import { useBellSystem } from "@/components/bell-provider";
import {
  BellSource,
  BellTone,
  ScheduleEntry,
  dayLabels,
  defaultSettings,
  formatDateTime,
  formatDuration,
  formatLongTime,
  getTodaysOperationalSchedule,
  timeToSeconds,
} from "@/lib/bell-data";
import { FormEvent, useMemo, useState } from "react";

const weekdays = [1, 2, 3, 4, 5];
const toneOptions: BellTone[] = ["classic", "short", "chime"];

type ScheduleDraft = Omit<ScheduleEntry, "id">;

const emptyDraft: ScheduleDraft = {
  label: "",
  time: "08:00",
  days: weekdays,
  tone: "classic",
  enabled: true,
  note: "",
};

export function DashboardPage() {
  const {
    currentTime,
    status,
    audioStatus,
    setStatus,
    emergencyStop,
    schedule,
    logs,
    ringBell,
  } = useBellSystem();
  const operational = getTodaysOperationalSchedule(schedule, currentTime);
  const nextBell = operational.next;
  const countdown = nextBell
    ? formatDuration(
        (dateAtTodayTime(currentTime, nextBell.time).getTime() -
          currentTime.getTime()) /
          1000,
      )
    : "No active bells";
  const lastTriggered = logs.find(
    (log) =>
      (log.source === "automatic" || log.source === "manual") &&
      log.message.toLowerCase().includes("bell triggered"),
  );
  const lastSystemAction = logs[0]?.message ?? "System initialized";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automatic School Bell System"
        title="Operations Dashboard"
        action={
          <>
            <button
              type="button"
              onClick={() => ringBell()}
              className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              Ring Bell Now
            </button>
            <button
              type="button"
              onClick={emergencyStop}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Emergency Stop
            </button>
          </>
        }
      />

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
        Demo Mode: Audio is currently playing from this computer only. PA system
        integration is not connected yet.
      </div>

      {status === "emergency-stopped" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          Emergency stop is active. Automatic bell triggers are disabled until the
          schedule is resumed by an operator.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Current Time" value={formatLongTime(currentTime)} />
        <MetricCard
          label="Next Upcoming Bell"
          value={nextBell ? nextBell.label : "None today"}
          detail={
            nextBell
              ? `Today at ${nextBell.time}`
              : "Today's active schedule is complete"
          }
        />
        <MetricCard label="Countdown" value={countdown} />
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">System Status</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <SchedulerPill status={status} />
            <button
              type="button"
              onClick={() => setStatus(status === "active" ? "paused" : "active")}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {status === "active" ? "Pause" : "Resume"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Completed Today"
          value={`${operational.completed.length}`}
          detail="Bells whose scheduled time has passed"
        />
        <MetricCard
          label="Remaining Today"
          value={`${operational.remaining.length}`}
          detail="Enabled bells still ahead today"
        />
        <MetricCard
          label="Last Triggered Bell"
          value={lastTriggered ? lastTriggered.message : "No bell triggered"}
          detail={
            lastTriggered
              ? `${formatDateTime(lastTriggered.timestamp)} - ${audioStatusLabel(audioStatus)}`
              : "Waiting for first manual or automatic trigger"
          }
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Panel
          title="Today's Operational View"
          action={`${operational.today.length} active bells`}
        >
          <div className="divide-y divide-slate-100">
            {operational.today.map((entry) => {
              const entrySeconds = timeToSeconds(entry.time);
              const nowSeconds = timeToSeconds(
                `${currentTime.getHours().toString().padStart(2, "0")}:${currentTime
                  .getMinutes()
                  .toString()
                  .padStart(2, "0")}`,
              );
              const isCompleted = entrySeconds <= nowSeconds;
              const isNext = nextBell?.id === entry.id;

              return (
                <div
                  key={entry.id}
                  className="grid gap-3 py-4 sm:grid-cols-[96px_1fr_auto]"
                >
                  <span className="font-mono text-sm font-semibold text-blue-800">
                    {entry.time}
                  </span>
                  <div>
                    <p className="font-medium text-slate-950">{entry.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{entry.note}</p>
                  </div>
                  <ScheduleStatePill
                    label={
                      isNext ? "Next" : isCompleted ? "Completed" : "Remaining"
                    }
                    tone={entry.tone}
                  />
                </div>
              );
            })}
            {operational.today.length === 0 ? (
              <EmptyState label="No enabled bells for today" />
            ) : null}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Reliability Status">
            <dl className="space-y-3 text-sm">
              <ReliabilityRow label="Scheduler status">
                <SchedulerPill status={status} compact />
              </ReliabilityRow>
              <ReliabilityRow label="Audio status">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                    audioStatus === "enabled"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {audioStatusLabel(audioStatus)}
                </span>
              </ReliabilityRow>
              <ReliabilityRow label="Storage status">
                <span className="font-semibold text-slate-950">
                  LocalStorage active
                </span>
              </ReliabilityRow>
              <ReliabilityRow label="Last system action">
                <span className="text-right font-medium text-slate-700">
                  {lastSystemAction}
                </span>
              </ReliabilityRow>
            </dl>
          </Panel>

          <Panel title="Recent Activity" action={`${logs.length} logs`}>
            <ActivityList logs={logs.slice(0, 5)} />
          </Panel>
        </div>
      </section>
    </div>
  );
}

export function SchedulePage() {
  const {
    schedule,
    addScheduleEntry,
    updateScheduleEntry,
    deleteScheduleEntry,
    toggleScheduleEntry,
  } = useBellSystem();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ScheduleDraft>(emptyDraft);

  const editing = editingId
    ? schedule.find((entry) => entry.id === editingId) ?? null
    : null;

  function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanDraft = {
      ...draft,
      label: draft.label.trim(),
      note: draft.note.trim(),
      days: draft.days.length > 0 ? draft.days : weekdays,
    };

    if (!cleanDraft.label) return;

    if (editingId) {
      updateScheduleEntry(editingId, cleanDraft);
    } else {
      addScheduleEntry(cleanDraft);
    }

    setEditingId(null);
    setDraft(emptyDraft);
  }

  function beginEdit(entry: ScheduleEntry) {
    setEditingId(entry.id);
    setDraft({
      label: entry.label,
      time: entry.time,
      days: entry.days,
      tone: entry.tone,
      enabled: entry.enabled,
      note: entry.note,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Timetable Management"
        title="Schedule"
        action={
          editing ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft);
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel Edit
            </button>
          ) : null
        }
      />

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel title={editing ? "Edit Bell" : "Add Bell"}>
          <form className="space-y-4" onSubmit={submitSchedule}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Bell label</span>
              <input
                value={draft.label}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, label: event.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-200 transition focus:border-blue-500 focus:ring-4"
                placeholder="e.g. Period 2 begins"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Time</span>
                <input
                  type="time"
                  value={draft.time}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, time: event.target.value }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-200 transition focus:border-blue-500 focus:ring-4"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tone</span>
                <select
                  value={draft.tone}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      tone: event.target.value as BellTone,
                    }))
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm capitalize outline-none ring-blue-200 transition focus:border-blue-500 focus:ring-4"
                >
                  {toneOptions.map((tone) => (
                    <option key={tone} value={tone}>
                      {tone}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700">Days</p>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {dayLabels.map((day, index) => (
                  <label
                    key={day}
                    className={`flex items-center justify-center rounded-lg border px-2 py-2 text-sm font-semibold ${
                      draft.days.includes(index)
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={draft.days.includes(index)}
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          days: current.days.includes(index)
                            ? current.days.filter((dayIndex) => dayIndex !== index)
                            : [...current.days, index].sort(),
                        }))
                      }
                      className="sr-only"
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Note</span>
              <input
                value={draft.note}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, note: event.target.value }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-200 transition focus:border-blue-500 focus:ring-4"
                placeholder="e.g. Primary block"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <span className="text-sm font-medium text-slate-700">Enabled</span>
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, enabled: event.target.checked }))
                }
                className="size-4 accent-blue-700"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              {editing ? "Save Bell" : "Add Bell"}
            </button>
          </form>
        </Panel>

        <Panel title="Weekly Timetable" action={`${schedule.length} entries`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-4 font-semibold">Time</th>
                  <th className="py-3 pr-4 font-semibold">Bell</th>
                  <th className="py-3 pr-4 font-semibold">Days</th>
                  <th className="py-3 pr-4 font-semibold">Tone</th>
                  <th className="py-3 pr-4 font-semibold">State</th>
                  <th className="py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedule.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-4 pr-4 font-mono font-semibold text-blue-800">
                      {entry.time}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-medium text-slate-950">{entry.label}</p>
                      <p className="mt-1 text-slate-500">{entry.note}</p>
                    </td>
                    <td className="py-4 pr-4 text-slate-600">
                      {entry.days.map((day) => dayLabels[day]).join(", ")}
                    </td>
                    <td className="py-4 pr-4 capitalize text-slate-600">
                      {entry.tone}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill enabled={entry.enabled} />
                    </td>
                    <td className="py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(entry)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleScheduleEntry(entry.id)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          {entry.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteScheduleEntry(entry.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}

export function LogsPage() {
  const { logs, clearLogs } = useBellSystem();
  const [filter, setFilter] = useState<BellSource | "all">("all");
  const filteredLogs = useMemo(
    () => (filter === "all" ? logs : logs.filter((log) => log.source === filter)),
    [filter, logs],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audit Trail"
        title="Event Logs"
        action={
          <button
            type="button"
            onClick={clearLogs}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Clear Logs
          </button>
        }
      />

      <Panel
        title="Activity"
        action={
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as BellSource | "all")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium outline-none ring-blue-200 focus:border-blue-500 focus:ring-4"
          >
            <option value="all">All sources</option>
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
            <option value="system">System</option>
          </select>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-4 font-semibold">Timestamp</th>
                <th className="py-3 pr-4 font-semibold">Source</th>
                <th className="py-3 pr-4 font-semibold">Event</th>
                <th className="py-3 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-4 pr-4 font-mono text-slate-600">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="py-4 pr-4">
                    <SourcePill source={log.source} />
                  </td>
                  <td className="py-4 pr-4 font-medium text-slate-950">
                    {log.message}
                  </td>
                  <td className="py-4 text-slate-600">{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLogs.length === 0 ? <EmptyState label="No matching logs" /> : null}
        </div>
      </Panel>
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, resetDemoData, ringBell } = useBellSystem();
  const [draft, setDraft] = useState(settings);

  function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateSettings(draft);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="System Configuration" title="Settings" />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Bell Settings">
          <form className="space-y-5" onSubmit={submitSettings}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">School name</span>
              <input
                value={draft.schoolName}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    schoolName: event.target.value,
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-200 transition focus:border-blue-500 focus:ring-4"
              />
            </label>

            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium text-slate-700">
                Bell volume
                <span className="font-mono text-slate-500">{draft.bellVolume}%</span>
              </span>
              <input
                type="range"
                min="10"
                max="100"
                value={draft.bellVolume}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bellVolume: Number(event.target.value),
                  }))
                }
                className="mt-3 w-full accent-blue-700"
              />
            </label>

            <label className="block">
              <span className="flex items-center justify-between text-sm font-medium text-slate-700">
                Bell duration
                <span className="font-mono text-slate-500">
                  {draft.bellDuration}s
                </span>
              </span>
              <input
                type="range"
                min="1"
                max="8"
                value={draft.bellDuration}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    bellDuration: Number(event.target.value),
                  }))
                }
                className="mt-3 w-full accent-blue-700"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Automatic trigger window
              </span>
              <select
                value={draft.autoTriggerWindowSeconds}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    autoTriggerWindowSeconds: Number(event.target.value),
                  }))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-blue-200 transition focus:border-blue-500 focus:ring-4"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              >
                Save Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  updateSettings(draft);
                  ringBell();
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Test Bell
              </button>
            </div>
          </form>
        </Panel>

        <Panel title="Demo Storage">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Storage</dt>
                  <dd className="font-semibold text-slate-950">Browser JSON</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">PA integration</dt>
                  <dd className="font-semibold text-slate-950">Not connected</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Authentication</dt>
                  <dd className="font-semibold text-slate-950">Disabled</dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              onClick={() => {
                setDraft(defaultSettings);
                resetDemoData();
              }}
              className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              Reset Demo Data
            </button>
          </div>
        </Panel>

        <Panel title="PA Integration Notes">
          <ul className="space-y-3 text-sm leading-6 text-slate-600">
            <li>
              Current MVP plays bell audio locally through the computer.
            </li>
            <li>
              Final deployment would connect the dedicated PC audio output to the
              existing PA mixer/amplifier input.
            </li>
            <li>
              The existing PA system must be inspected before connection.
            </li>
            <li>
              Building zones and microphone override behavior must be confirmed.
            </li>
            <li>
              First real-world test should be done on one building or one audio
              zone only.
            </li>
          </ul>
        </Panel>
      </section>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
          {title}
        </h1>
      </div>
      {action ? <div className="flex items-center gap-3">{action}</div> : null}
    </header>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {action ? (
          <div className="text-sm font-medium text-slate-500">{action}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-3 min-h-9 text-2xl font-semibold tracking-normal text-slate-950">
        {value}
      </p>
      {detail ? <p className="mt-2 text-sm text-slate-500">{detail}</p> : null}
    </div>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        enabled
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
      }`}
    >
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

function SchedulerPill({
  status,
  compact = false,
}: {
  status: ReturnType<typeof useBellSystem>["status"];
  compact?: boolean;
}) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    paused: "bg-amber-50 text-amber-700 ring-amber-200",
    "emergency-stopped": "bg-red-50 text-red-700 ring-red-200",
  };
  const labels = {
    active: "Running",
    paused: "Paused",
    "emergency-stopped": "Emergency stopped",
  };

  return (
    <span
      className={`rounded-full font-semibold ring-1 ${styles[status]} ${
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
    >
      {labels[status]}
    </span>
  );
}

function ScheduleStatePill({ label, tone }: { label: string; tone: BellTone }) {
  const styles =
    label === "Next"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : label === "Completed"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
      <span
        className={`h-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles}`}
      >
        {label}
      </span>
      <span className="h-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
        {tone}
      </span>
    </div>
  );
}

function ReliabilityRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="flex justify-end">{children}</dd>
    </div>
  );
}

function SourcePill({ source }: { source: BellSource }) {
  const styles = {
    automatic: "bg-blue-50 text-blue-700 ring-blue-200",
    manual: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    system: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${styles[source]}`}
    >
      {source}
    </span>
  );
}

function ActivityList({ logs }: { logs: ReturnType<typeof useBellSystem>["logs"] }) {
  if (logs.length === 0) return <EmptyState label="No recent activity" />;

  return (
    <div className="divide-y divide-slate-100">
      {logs.map((log) => (
        <div key={log.id} className="py-4">
          <div className="flex items-center justify-between gap-3">
            <SourcePill source={log.source} />
            <span className="font-mono text-xs text-slate-500">
              {formatDateTime(log.timestamp)}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-950">{log.message}</p>
          <p className="mt-1 text-sm text-slate-500">{log.detail}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
      {label}
    </div>
  );
}

function audioStatusLabel(status: ReturnType<typeof useBellSystem>["audioStatus"]) {
  return status === "enabled" ? "Enabled" : "Not enabled";
}

function dateAtTodayTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const target = new Date(date);
  target.setHours(hours, minutes, 0, 0);

  return target;
}
