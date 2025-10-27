// app/api/ingest/route.ts

// ─────────────────────────────────────────────────────────
// Next/Vercel runtime
// ─────────────────────────────────────────────────────────
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────
import Parser from "rss-parser";
import { z } from "zod";
import { formatISO, parseISO } from "date-fns";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // server-only client
import { FEEDS } from "@/lib/feeds";
import { getDomain, urlHash } from "@/lib/url";

// ─────────────────────────────────────────────────────────
// Optional auth: set CRON_SECRET in Vercel → Settings → Environment Variables
// ─────────────────────────────────────────────────────────
function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") || "";
  return expected ? got === `Bearer ${expected}` : true; // allow if not set
}

// Liberal RSS item schema (feeds vary)
const Item = z.object({
  title: z.string().optional(),
  link: z.string().url().optional(),
  isoDate: z.string().optional(),
  pubDate: z.string().optional(),
  contentSnippet: z.string().optional(),
  content: z.string().optional(),
});

// Shared parser with browsery headers to avoid 403s
const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) antishmanna-site/1.0",
    Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
  },
});

// Helper: ensure a “today” cluster exists and return its id
async function ensureTodayCluster(): Promise<string> {
  const today = formatISO(new Date(), { representation: "date" }); // YYYY-MM-DD

  const { data: found, error: selErr } = await supabaseAdmin
    .from("clusters")
    .select("id")
    .eq("cluster_date", today)
    .limit(1);

  if (selErr) throw selErr;
  if (found?.[0]?.id) return found[0].id as string;

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("clusters")
    .insert([{ cluster_date: today, label: "Top stories" }])
    .select("id")
    .single();

  if (insErr) throw insErr;
  return inserted!.id as string;
}

// Fetch one feed with retries & backoff
async function fetchFeed(name: string, url: string, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const feed = await parser.parseURL(url);
      return { name, items: feed.items ?? [] };
    } catch (e: any) {
      if (i === retries) throw new Error(`${name}: ${e?.message || e}`);
      await new Promise((r) => setTimeout(r, 500 * (i + 1))); // 0.5s, 1s, ...
    }
  }
  return { name, items: [] };
}

// Core ingestion runner
async function runIngestion() {
  const clusterId = await ensureTodayCluster();

  // Pull all feeds in parallel; a failure in one won’t kill the run
  const results = await Promise.allSettled(
    FEEDS.map((f) => fetchFeed(f.name, f.url))
  );

  let articlesUpserted = 0;
  let linksUpserted = 0;
  const errors: Array<{ source: string; error: string }> = [];

  for (const r of results) {
    if (r.status === "rejected") {
      errors.push({ source: "fetch", error: String(r.reason) });
      continue;
    }

    const { name: source, items } = r.value;

    for (const raw of items) {
      const parsed = Item.safeParse(raw);
      if (!parsed.success || !parsed.data.link) continue;

      const link = parsed.data.link.trim();
      const domain = getDomain(link);
      const hash = urlHash(link);
      const title = parsed.data.title ?? null;

      // Prefer isoDate; fallback to pubDate; else null
      const ts = parsed.data.isoDate ?? parsed.data.pubDate ?? null;
      let published_at: string | null = null;
      if (ts) {
        try {
          published_at = parseISO(ts).toISOString();
        } catch {
          published_at = null;
        }
      }

      const content = parsed.data.contentSnippet || parsed.data.content || null;

      // Upsert article by URL (url is UNIQUE)
      const { data: articleRow, error: upErr } = await supabaseAdmin
        .from("articles")
        .upsert(
          [
            {
              url: link,
              domain,
              title,
              published_at: published_at as any,
              content,
              hash,
              language: null,
              status: "processed",
              source,
            },
          ],
          { onConflict: "url" }
        )
        .select("id")
        .single();

      if (upErr) {
        errors.push({ source, error: upErr.message });
        continue;
      }

      articlesUpserted += 1;
      const articleId = articleRow!.id as string;

      // Link article to today’s cluster (idempotent on PK)
      const { error: linkErr } = await supabaseAdmin
        .from("cluster_members")
        .upsert([{ cluster_id: clusterId, article_id: articleId, score: 1 }], {
          onConflict: "cluster_id,article_id",
        })
        .select("article_id")
        .single();

      if (linkErr) {
        errors.push({ source, error: linkErr.message });
      } else {
        linksUpserted += 1;
      }
    }
  }

  return { ok: true, clusterId, articlesUpserted, linksUpserted, errors };
}

// Handlers (Vercel Cron calls GET)
export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runIngestion();
    return Response.json(result);
  } catch (e: any) {
    return Response.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

// Keep POST for manual triggers
export async function POST(req: Request) {
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runIngestion();
    return Response.json(result);
  } catch (e: any) {
    return Response.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
