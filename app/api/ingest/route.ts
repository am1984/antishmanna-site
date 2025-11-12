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
import { parseISO } from "date-fns";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // server-only client
import { FEEDS } from "@/lib/feeds";
import { getDomain, urlHash } from "@/lib/url";
import { franc } from "franc";

// ─────────────────────────────────────────────────────────
// Optional auth: set CRON_SECRET in Vercel → Settings → Environment Variables
// ─────────────────────────────────────────────────────────
function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") || "";
  return expected ? got === `Bearer ${expected}` : true; // allow if not set
}

// ─────────────────────────────────────────────────────────
// AFTER-INGEST: trigger LLM clustering via internal API
// ─────────────────────────────────────────────────────────
async function triggerClusterLLM(origin: string) {
  const url = `${origin.replace(/\/$/, "")}/api/cluster/llm`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.CRON_SECRET) {
    headers["Authorization"] = `Bearer ${process.env.CRON_SECRET}`;
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 300_000); // 300s safety

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ trigger: "auto-after-ingest" }),
      cache: "no-store",
      signal: ctrl.signal,
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      // response might not be JSON; ignore
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, error: String(err?.message || err) };
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────
// Helpers: Google News unwrap + text extraction
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

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?(?:nav|header|footer|aside|noscript)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Fix mojibake (UTF-8 read as Latin-1)
function fixMojibake(text: string): string {
  if (!text) return text;

  const map: Record<string, string> = {
    "â€™": "’",
    "â€˜": "‘",
    "â€œ": "“",
    "â€": "”",
    "â€": "—",
    "â€“": "–",
    "Ã©": "é",
    Ã: "à",
    Â: "",
  };

  let t = text;
  for (const bad in map) {
    t = t.replace(new RegExp(bad, "g"), map[bad]);
  }

  try {
    if (/[ÂÃâ€]/.test(t)) {
      const repaired = Buffer.from(t, "latin1").toString("utf8");
      if (repaired && repaired !== t) t = repaired;
    }
  } catch {}

  return t;
}

function cleanContent(text: string): string {
  if (!text) return text;

  let t = text
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")
    .replace(/¬†/g, " ");

  t = t
    .replace(
      /\s+(AP News|Reuters|Bloomberg\.?com?|The Associated Press)\s*$/i,
      ""
    )
    .trim();

  t = fixMojibake(t);
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

// Lazy-import jsdom + readability inside the function to reduce bundle size
async function extractFullText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) antishmanna-site/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.8",
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) return null;

    const html = await res.text();
    const safeHtml = html.length > 2_500_000 ? html.slice(0, 2_500_000) : html;

    const [{ JSDOM }, { Readability }] = await Promise.all([
      import("jsdom"),
      import("@mozilla/readability"),
    ]);

    const dom = new JSDOM(safeHtml, { url });
    const article = new Readability(dom.window.document).parse();
    let text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";

    if (!text || text.length < 200) {
      text = stripHtmlToText(safeHtml);
    }

    return text && text.length >= 200 ? text : null;
  } catch (err) {
    console.error("[extractFullText] error", url, err);
    return null;
  }
}

// Hybrid policy: which sources always get full-text extraction?
const FULLTEXT_SOURCES = new Set(["Reuters", "AP News", "Bloomberg"]);

// Optional: guard that Google News items truly come from the expected domain.
function domainMatchesExpected(url: string, source: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (source === "Reuters") return h.endsWith("reuters.com");
    if (source === "AP News") return h.endsWith("apnews.com");
    if (source === "Bloomberg") return h.endsWith("bloomberg.com");
  } catch {}
  return true;
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
      const feed = await parser.parseString(xml);

      return { name, items: feed.items ?? [] };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }

  throw new Error(`${name}: ${lastErr?.message || String(lastErr)}`);
}

// Core ingestion runner
async function runIngestion() {
  const results = await Promise.allSettled(
    FEEDS.map((f) => fetchFeed(f.name, f.url))
  );

  let articlesUpserted = 0;
  const errors: Array<{ source: string; error: string }> = [];

  for (const r of results) {
    if (r.status === "rejected") {
      errors.push({ source: "fetch", error: String(r.reason) });
      continue;
    }

    const { name: source, items } = r.value;

    for (const raw of items) {
      try {
        const parsed = Item.safeParse(raw);
        if (!parsed.success || !parsed.data.link) continue;

        const rawLink = parsed.data.link.trim();
        const linkUnwrapped = unwrapGoogleNewsLink(rawLink);

        // if (!domainMatchesExpected(linkUnwrapped, source)) continue;

        const domain = getDomain(linkUnwrapped);
        const hash = urlHash(linkUnwrapped);
        let title = parsed.data.title ?? null;
        if (title) title = cleanContent(title);

        const ts = parsed.data.isoDate ?? parsed.data.pubDate ?? null;
        let published_at: string | null = null;
        if (ts) {
          try {
            published_at = parseISO(ts).toISOString();
          } catch {}
        }

        const TWELVE_HOURS = 12 * 60 * 60 * 1000;
        if (published_at) {
          const ageMs = Date.now() - new Date(published_at).getTime();
          if (ageMs > TWELVE_HOURS) continue;
        }

        const MIN_FULLTEXT = 200;

        let content = parsed.data.contentSnippet || parsed.data.content || null;

        if (FULLTEXT_SOURCES.has(source)) {
          const full = await extractFullText(linkUnwrapped);
          if (full && full.length >= MIN_FULLTEXT) {
            content = full;
          }
        } else {
          if (!content || content.trim().length < 40) {
            const maybeFull = await extractFullText(linkUnwrapped);
            if (maybeFull && maybeFull.length >= MIN_FULLTEXT) {
              content = maybeFull;
            }
          }
        }

        if (!content || !content.trim()) {
          content = title || "(no summary)";
        }

        content = cleanContent(content);

        if (content.length < 70) {
          continue;
        }

        const lang = franc(content);
        if (lang !== "eng" && lang !== "und") continue;

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
      } catch (err: any) {
        console.error("[ingest:item] error", source, err?.message || err);
        errors.push({ source, error: String(err?.message || err) });
      }
    }
  }

  return { ok: true, articlesUpserted, errors };
}

// ─────────────────────────────────────────────────────────
// Handlers (Vercel Cron calls GET)
// ─────────────────────────────────────────────────────────
export async function GET(req: Request) {
  if (!isAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await runIngestion();

    // Trigger LLM only if we actually ingested something
    let llm: any = null;
    if (result.articlesUpserted > 0) {
      const origin =
        process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
      llm = await triggerClusterLLM(origin);
    }

    return Response.json({ ...result, llm });
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

    let llm: any = null;
    if (result.articlesUpserted > 0) {
      const origin =
        process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
      llm = await triggerClusterLLM(origin);
    }

    return Response.json({ ...result, llm });
  } catch (e: any) {
    return Response.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
