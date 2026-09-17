import { NextResponse } from "next/server";
import { filtersFromSearchParams } from "@/lib/filters";
import { listLogs } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filters = filtersFromSearchParams(searchParams);
  const result = await listLogs(filters);
  return NextResponse.json(result);
}
