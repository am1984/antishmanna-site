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
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// ─────────────────────────────────────────────────────────
// Optional auth: set CRON_SECRET in Vercel → Settings → Environment Variables
// ─────────────────────────────────────────────────────────
function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") || "";
  return expected ? got === `Bearer ${expected}` : true; // allow if not set
}

// ─────────────────────────────────────────────────────────
// Helpers: Google News unwrap + full-text extraction
// ─────────────────────────────────────────────────────────
function unwrapGoogleNewsLink(link: string): string {
  try {
    const u = new URL(link);
    if (u.hostname.includes("news.google.com")) {
      const real = u.searchParams.get("url");
      if (real) return real;
    }
  } catch {}
  return link;
}

async function extractFullText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) antishmanna-site/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;

    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article?.textContent) return null;

    return article.textContent.replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

// Hybrid policy: which sources always get full-text extraction?
const FULLTEXT_SOURCES = new Set(["Reuters", "AP News", "Bloomberg"]);

// Optional: guard that Google News items truly come from the expected domain.
function domainMatchesExpected(url: string, source: string): boolean {
  try {
    const h = new URL(url).hostname;
    if (source === "Reuters") return h.endsWith("reuters.com");
    if (source === "AP News") return h.endsWith("apnews.com");
    if (source === "Bloomberg") return h.endsWith("bloomberg.com");
  } catch {}
  return true; // be permissive for others
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

async function fetchFeed(name: string, url: string, retries = 2) {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) antishmanna-site/1.0",
    Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: "https://www.google.com/",
  };

  let lastErr: any = null;

  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);

      const xml = await res.text();
      // Some feeds include stray attributes / bad entities; let parser try from string
      const feed = await parser.parseString(xml);

      return { name, items: feed.items ?? [] };
    } catch (e) {
      lastErr = e;
      // brief backoff on retryable errors
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }

  throw new Error(`${name}: ${lastErr?.message || String(lastErr)}`);
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

      // Unwrap Google News → real publisher URL
      const rawLink = parsed.data.link.trim();
      const linkUnwrapped = unwrapGoogleNewsLink(rawLink);

      // Optional safety: skip if Google slipped an unexpected domain
      if (!domainMatchesExpected(linkUnwrapped, source)) continue;

      const domain = getDomain(linkUnwrapped);
      const hash = urlHash(linkUnwrapped);
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

      // Freshness filter: ≤ 12h
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      if (published_at) {
        const ageMs = Date.now() - new Date(published_at).getTime();
        if (ageMs > TWELVE_HOURS) continue;
      }

      // Start with feed snippet
      let content = parsed.data.contentSnippet || parsed.data.content || null;

      // HYBRID: always full-text for Reuters/AP/Bloomberg; else keep snippet
      if (FULLTEXT_SOURCES.has(source)) {
        const full = await extractFullText(linkUnwrapped);
        if (full && full.length > 200) {
          content = full;
        } else {
          // If extraction failed, fall back to snippet, but enforce minimum quality
          if (!content || content.trim().length < 120) continue;
        }
      } else {
        // Native RSS (BBC, Politico, etc.) – only use snippet if meaningful
        if (!content || content.trim().length < 120) {
          // optional light fallback: try full text if snippet is too thin
          const maybeFull = await extractFullText(linkUnwrapped);
          if (maybeFull && maybeFull.length > 200) {
            content = maybeFull;
          } else {
            continue; // still too weak → drop
          }
        }
      }

      // Upsert article by URL (url is UNIQUE)
      const { data: articleRow, error: upErr } = await supabaseAdmin
        .from("articles")
        .upsert(
          [
            {
              url: linkUnwrapped,
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
