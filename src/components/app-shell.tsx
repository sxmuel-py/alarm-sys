"use client";

import { useBellSystem } from "@/components/bell-provider";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "Dashboard", marker: "D" },
  { href: "/schedule", label: "Schedule", marker: "S" },
  { href: "/logs", label: "Logs", marker: "L" },
  { href: "/settings", label: "Settings", marker: "G" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, setStatus, settings } = useBellSystem();
  const statusLabel =
    status === "active"
      ? "Active"
      : status === "emergency-stopped"
        ? "Stopped"
        : "Paused";
  const statusClass =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "emergency-stopped"
        ? "bg-red-50 text-red-700 ring-red-200"
        : "bg-amber-50 text-amber-700 ring-amber-200";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:flex">
      <aside className="border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="relative flex size-12 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
                <Image
                  src="/logo.png"
                  alt="Childrens International school Lekki logo"
                  width={40}
                  height={48}
                  className="h-full w-full object-contain"
                  priority
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  Bell Control
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {settings.schoolName}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-4 py-3 lg:flex-col lg:overflow-visible lg:px-3 lg:py-5">
            {navigation.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-w-max items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-blue-50 text-blue-800 ring-1 ring-blue-100"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  <span
                    className={`flex size-7 items-center justify-center rounded-md text-xs ${
                      active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {item.marker}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto hidden border-t border-slate-200 p-4 lg:block">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  System
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusClass}`}
                >
                  {statusLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStatus(status === "active" ? "paused" : "active")}
                className="mt-4 w-full rounded-lg bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
              >
                {status === "active" ? "Pause Schedule" : "Resume Schedule"}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 lg:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
