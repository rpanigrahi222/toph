"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Global search — writes `q` into the URL, which the logs table reads. */
export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlValue = sp.get("q") ?? "";
  const [value, setValue] = useState(urlValue);
  // Resync when the URL changes from elsewhere (e.g. clearing filters).
  const [lastUrl, setLastUrl] = useState(urlValue);
  if (urlValue !== lastUrl) {
    setLastUrl(urlValue);
    setValue(urlValue);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      if (next.toString() !== sp.toString()) {
        // Searching from a non-log page jumps to the Activity Logs view.
        const target = pathname === "/" || pathname.startsWith("/logs") ? pathname : "/logs";
        router.replace(`${target}?${next.toString()}`);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className="flex h-8 w-full items-center sm:w-[270px] gap-2 rounded-full border border-border bg-white px-3 text-[13px] text-muted-foreground focus-within:border-foreground/30">
      <Search className="size-3.5" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search"
        className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
