"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  ArrowLeftRight,
  AudioLines,
  Calendar,
  ChartLine,
  ClipboardList,
  Clock,
  Inbox,
  Layers,
  LogOut,
  Mail,
  Map as MapIcon,
  Menu,
  MessageCircleQuestion,
  Mic,
  Settings,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };
type NavSection = { title: string; items: NavItem[] };

/**
 * >= lg: fixed left sidebar (the design). < lg: a slim top bar with a menu
 * button that opens the same navigation in a sheet.
 */
export function Sidebar({ farmName, newCount }: { farmName: string; newCount: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the sheet after navigating (derived-state pattern, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[208px] shrink-0 flex-col border-r border-border bg-white px-3 py-3 lg:flex">
        <SidebarBody farmName={farmName} newCount={newCount} />
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-white px-4 py-2.5 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-1.5 hover:bg-muted">
          <Menu className="size-5" />
        </button>
        <div className="flex size-7 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-semibold text-white">
          {initials(farmName)}
        </div>
        <div className="text-[13px] font-semibold">{farmName}</div>
        <Link href="/record" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white">
          <Mic className="size-3.5" /> Record
        </Link>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[240px] p-3" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarBody farmName={farmName} newCount={newCount} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarBody({ farmName, newCount }: { farmName: string; newCount: number }) {
  const pathname = usePathname();

  const sections: NavSection[] = [
    {
      title: "Overview",
      items: [
        { href: "/", label: "Dashboard", icon: ChartLine, badge: newCount },
        { href: "/logs", label: "Activity Logs", icon: AudioLines },
        { href: "/map", label: "Map", icon: MapIcon },
      ],
    },
    {
      title: "Compliance",
      items: [
        { href: "/audit", label: "Audit Manager", icon: ClipboardList },
        { href: "/reports", label: "Reports", icon: Layers },
        { href: "/schedule", label: "Schedule", icon: Calendar },
      ],
    },
    {
      title: "Team Management",
      items: [
        { href: "/employees", label: "Employees", icon: Users },
        { href: "/performance", label: "Performance", icon: Clock },
        { href: "/messages", label: "Messages", icon: Mail },
      ],
    },
    {
      title: "Other",
      items: [
        { href: "/settings", label: "Settings", icon: Settings },
        { href: "/support", label: "Support", icon: MessageCircleQuestion },
      ],
    },
  ];

  return (
    <>
      {/* Farm / user block */}
      <div className="flex items-center gap-2.5 rounded-lg border border-border px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-semibold text-white">
          {initials(farmName)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-semibold">{farmName}</div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sprout className="size-3" /> Admin
          </div>
        </div>
        <Inbox className="size-4 text-muted-foreground" />
      </div>

      {/* Nav */}
      <nav className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto">
        {sections.map((s) => (
          <div key={s.title} className="rounded-lg border border-border px-1.5 py-1.5">
            <div className="px-2 pb-1 pt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.title}
            </div>
            {s.items.map((it) => {
              const active = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px] text-foreground/90 transition-colors hover:bg-muted",
                    active && "bg-muted font-medium",
                  )}
                >
                  <it.icon className="size-4 text-foreground/70" strokeWidth={1.75} />
                  <span className="flex-1">{it.label}</span>
                  {it.badge ? (
                    <span className="rounded-full bg-emerald-500 px-1.5 py-px text-[10px] font-semibold leading-4 text-white">
                      {it.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}

        {/* Demo entry point — not in the original design, added for the live ASR demo. */}
        <Link
          href="/record"
          className={cn(
            "flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-900 transition-colors hover:bg-emerald-100",
            pathname.startsWith("/record") && "ring-2 ring-emerald-300",
          )}
        >
          <Mic className="size-4" strokeWidth={1.75} />
          Record a log
        </Link>
      </nav>

      {/* Footer */}
      <div className="mt-3 flex flex-col gap-2">
        <button className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px] hover:bg-muted">
          <ArrowLeftRight className="size-4 text-foreground/70" strokeWidth={1.75} />
          Switch User
        </button>
        <button className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px] hover:bg-muted">
          <LogOut className="size-4 text-foreground/70" strokeWidth={1.75} />
          Log Out
        </button>
      </div>
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
