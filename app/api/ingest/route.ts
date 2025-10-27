// app/api/ingest/route.ts
import { NextResponse } from "next/server";
import Parser from "rss-parser";
import { z } from "zod";
import { formatISO, parseISO } from "date-fns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { FEEDS } from "@/lib/feeds";
import { getDomain, urlHash } from "@/lib/url";

export const runtime = "nodejs"; // ensure Node runtime on Vercel
export const dynamic = "force-dynamic"; // don't cache

const Item = z.object({
  title: z.string().optional(),
  link: z.string().url().optional(),
  isoDate: z.string().optional(),
  pubDate: z.string().optional(),
  contentSnippet: z.string().optional(),
  content: z.string().optional(),
});

const parser = new Parser({ timeout: 15000 });

export async function GET() {
  return NextResponse.json({ ok: true });
}

async function ensureTodayCluster(): Promise<string> {
  const today = new Date();
  const todayStr = formatISO(today, { representation: "date" }); // YYYY-MM-DD

  const { data: found, error: selErr } = await supabaseAdmin
    .from("clusters")
    .select("id")
    .eq("cluster_date", todayStr)
    .limit(1);

  if (selErr) throw selErr;
  if (found && found[0]) return found[0].id;

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("clusters")
    .insert([{ cluster_date: todayStr, label: "Top stories" }])
    .select("id")
    .single();

  if (insErr) throw insErr;
  return inserted.id as string;
}

export async function POST() {
  const clusterId = await ensureTodayCluster();

  const feedResults = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const feed = await parser.parseURL(f.url);
      return { name: f.name, items: feed.items };
    })
  );

  let inserted = 0;
  let linked = 0;
  const errors: Array<{ source: string; error: string }> = [];

  for (const fr of feedResults) {
    if (fr.status === "rejected") {
      errors.push({ source: "unknown", error: String(fr.reason) });
      continue;
    }

    const { name, items } = fr.value;
    for (const raw of items ?? []) {
      const item = Item.safeParse(raw);
      if (!item.success || !item.data.link) continue;

      const link = item.data.link.trim();
      const domain = getDomain(link);
      const hash = urlHash(link);
      const title = item.data.title ?? null;

      // Prefer isoDate → fallback to pubDate → null
      const published_at = (() => {
        const ts = item.data.isoDate ?? item.data.pubDate;
        if (!ts) return null as any;
        try {
          return parseISO(ts).toISOString();
        } catch {
          return null as any;
        }
      })();

      const content = item.data.contentSnippet || item.data.content || null;

      // Upsert into articles by unique url (enforced in schema)
      const { data: articleResult, error: upErr } = await supabaseAdmin
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
              source: name,
            },
          ],
          { onConflict: "url" }
        )
        .select("id")
        .single();

      if (upErr) {
        errors.push({ source: name, error: upErr.message });
        continue;
      }

      const articleId = articleResult.id as string;

      // Link article to today’s cluster (ignore if already linked)
      const { error: linkErr } = await supabaseAdmin
        .from("cluster_members")
        .insert([{ cluster_id: clusterId, article_id: articleId, score: 1 }], {
          count: "exact",
        })
        .select("article_id")
        .single();

      if (linkErr && !String(linkErr.message).includes("duplicate key")) {
        errors.push({ source: name, error: linkErr.message });
      } else {
        linked += 1;
      }

      inserted += 1;
    }
  }

  return NextResponse.json({ ok: true, clusterId, inserted, linked, errors });
}
