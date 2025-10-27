// app/api/daily/route.ts
import { NextResponse } from "next/server";
import { formatISO } from "date-fns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const today = formatISO(new Date(), { representation: "date" });

  const { data: clusters, error: cErr } = await supabaseAdmin
    .from("daily_top_clusters")
    .select("*")
    .eq("cluster_date", today)
    .order("articles_count", { ascending: false });

  if (cErr)
    return NextResponse.json(
      { ok: false, error: cErr.message },
      { status: 500 }
    );

  const clusterIds = (clusters ?? []).map((c: any) => c.cluster_id);

  const { data: summaries } = await supabaseAdmin
    .from("summaries")
    .select("*")
    .in("cluster_id", clusterIds);

  return NextResponse.json({ ok: true, date: today, clusters, summaries });
}
