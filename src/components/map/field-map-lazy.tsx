"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** maplibre touches `window` at import time, so it must never render on the server. */
export const FieldMapLazy = dynamic(() => import("./field-map").then((m) => m.FieldMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-xl" />,
});
