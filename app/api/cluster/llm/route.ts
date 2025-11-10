// app/api/cluster/llm/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// -------------------------------
// ENV + Clients
// -------------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -------------------------------
// Config & Guards
// -------------------------------
function cleanModelEnv(v?: string | null) {
  return (v ?? "").trim().replace(/^["']/, "").replace(/["']$/, "");
}
const MODEL = process.env.NEWS_CLUSTER_MODEL || "gpt-5";
const TEMPERATURE = 0;

// If your route should be protected for cron/scheduler calls, set CRON_SECRET in env.
// When set, this header must match: x-cron-secret: <CRON_SECRET>
const CRON_REQUIRED = Boolean(process.env.CRON_SECRET);
const DEFAULT_WINDOW_HOURS = 12;
const DEFAULT_TOP_N = 8;

// Optional cost tracking (set envs to non-zero if you want estimates)
const PRICE_IN_PER_1K = Number(process.env.NEWS_MODEL_PRICE_IN_PER_1K ?? 0);
const PRICE_OUT_PER_1K = Number(process.env.NEWS_MODEL_PRICE_OUT_PER_1K ?? 0);

// -------------------------------
// Types
// -------------------------------
type ArticleRow = {
  id: string;
  title: string | null;
  source: string | null;
  published_at: string | null;
  content: string | null;
};

type LLMCluster = {
  topic_label: string;
  member_ids: string[];
  market_impact_score: number;
  size: number;
  sources_count: number;
  freshness_score: number;
  breaking: boolean;
  total_score: number;
  rank: number; // 1..N
};

type LLMResponse = {
  clusters: LLMCluster[];
  top_summaries: { cluster_rank: number; summary: string }[];
};

// -------------------------------
// Utils
// -------------------------------
function startOfDayInTZ(date: Date, timeZone = "Europe/London") {
  // Returns a Date representing 00:00:00 of 'date' in the given TZ, converted to UTC.
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value])
  );
  const isoLocalMidnight = `${parts.year}-${parts.month}-${parts.day}T00:00:00`;
  return new Date(
    new Date(isoLocalMidnight).toLocaleString("en-US", { timeZone })
  );
}

function hashPrompt(str: string) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function trunc(s: string | null | undefined, n: number) {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}

function safeNumber(n: unknown, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

// -------------------------------
// Prompt builder (embedding + agglomerative intent; ≤50-word summaries)
// -------------------------------
function buildPrompt(
  articles: ArticleRow[],
  opts?: {
    windowStartISO?: string;
    windowEndISO?: string;
    topN?: number;
    tz?: string;
  }
) {
  const topN = Math.max(1, Math.min(12, opts?.topN ?? DEFAULT_TOP_N));

  const listing = articles
    .filter((a) => a.title && a.title.trim().length > 0)
    .map((a) => {
      const embedText = `${a.title} - ${trunc(a.content, 300)}`;
      const summaryText = `${a.title} - ${trunc(a.content, 400)}`;
      const src = a.source ? ` | ${a.source}` : "";
      const pub = a.published_at ? ` | ${a.published_at}` : "";
      return `- [${a.id}] ${a.title}${src}${pub}
  EMBED_TEXT: ${embedText}
  SUMMARY_TEXT: ${summaryText}`;
    })
    .join("\n");

  const windowInfo =
    opts?.windowStartISO && opts?.windowEndISO
      ? `Clustering window: ${opts.windowStartISO} → ${opts.windowEndISO}${
          opts?.tz ? ` (timezone: ${opts.tz})` : ""
        }`
      : `Clustering window: (not specified)`;

  return `
SYSTEM/TOOL INSTRUCTION (deterministic)
- You are a news clustering-and-summarisation assistant, with excellent understanding of drivers that move financial markets.
- Temperature = 0 (deterministic).
- Embedding method = ext-embedding-3-small.
- Clustering method:
  • Algorithm = Agglomerative Clustering
  • affinity = "precomputed" (cosine distance)
  • linkage = "average"
  • distance_threshold ≈ 0.6

TASK
Goal: Group these articles into topic clusters, rank clusters by how much they will move financial markets (largest impact ranked higher), then write a ≤50-word summary for each of the top ${topN} clusters.

1) Embeddings-based clustering
• Create a semantic embedding for each article using the provided embedding method on the concatenation:
  EMBED_TEXT (title + " - " + first 300 characters of content).
• Cluster using the specified clustering method/threshold (tune threshold slightly if necessary to avoid over/under-splitting).
• Clusters should reflect the same *market-moving topic*, not generic keywords.

2) Rank clusters by market impact
• For each cluster, compute a primary "market_impact_score" in [0,1] = your estimate of how much this topic is likely to move markets now.
• Then compute "total_score" used for ranking with tie-breakers:
  total_score = market_impact_score
              + 0.4*log1p(cluster_size)
              + 0.3*log1p(unique_sources)
              + 0.5*freshness
  where "freshness" is the normalized recency (0–1) of the newest article within the provided window.

3) Summarise only the top ${topN}
• Take the top ${topN} clusters by total_score.
• Read titles and SUMMARY_TEXT (title + first 400 chars of content) of members in that cluster.
• Produce one ≤50-word factual, concise key-takeaway "summary" per selected cluster. No hype. No repetition.

4) Output (JSON-only; no prose)
Return a single JSON object with two arrays:

{
  "clusters": [
    {
      "topic_label": "string (≤80 chars, specific market topic)",
      "member_ids": ["<articles.id>", "..."],
      "market_impact_score": 0.0,        // 0–1
      "size": 0,                         // member_ids length
      "sources_count": 0,                // distinct sources in members
      "freshness_score": 0.0,            // 0–1 based on newest article in window
      "breaking": false,                 // true only if clearly a sudden development
      "total_score": 0.0,                // formula above
      "rank": 0                          // 1..N across ALL clusters (by total_score desc)
    }
  ],
  "top_summaries": [
    {
      "cluster_rank": 0,                 // rank of the cluster being summarised (1..N)
      "summary": "≤50 words"
    }
  ]
}

CONSTRAINTS
• Deterministic output (temperature=0).
• No personal data. No opinions. Be precise.
• If fewer than ${topN} clusters exist, return as many as available in "top_summaries".
• Arrays must be consistent: every "cluster_rank" in "top_summaries" must correspond to a cluster object with the same "rank" in "clusters".
• Do not include any fields other than those specified above.

${windowInfo}

ARTICLES
${listing}
  `.trim();
}

// -------------------------------
// Handler
// -------------------------------
export async function POST(req: Request) {
  try {
    // Optional cron header guard
    if (CRON_REQUIRED) {
      const header = req.headers.get("x-cron-secret");
      if (!header || header !== process.env.CRON_SECRET) {
        return NextResponse.json(
          { ok: false, error: "unauthorized" },
          { status: 401 }
        );
      }
    }

    const { windowHours, topN } = await req
      .json()
      .catch(() => ({ windowHours: undefined, topN: undefined }));

    const hours = Number.isFinite(Number(windowHours))
      ? Math.max(1, Math.min(48, Number(windowHours)))
      : DEFAULT_WINDOW_HOURS;
    const top = Number.isFinite(Number(topN))
      ? Math.max(1, Math.min(12, Number(topN)))
      : DEFAULT_TOP_N;

    const now = new Date();
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - hours * 60 * 60 * 1000);

    // 1) Fetch recent articles
    const { data: articles, error: artErr } = await supabase
      .from("articles")
      .select("id, title, source, published_at, content")
      .gte("published_at", windowStart.toISOString())
      .lte("published_at", windowEnd.toISOString())
      .order("published_at", { ascending: false })
      .limit(250);

    if (artErr) throw artErr;
    const rows: ArticleRow[] = (articles || []).filter(
      (a) => a.title && a.title.trim().length > 0
    ) as ArticleRow[];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          modelUsed: MODEL,
          message: "No articles in window; nothing to cluster.",
        },
        { status: 200 }
      );
    }

    // 2) Build prompt + hash
    const prompt = buildPrompt(rows, {
      windowStartISO: windowStart.toISOString(),
      windowEndISO: windowEnd.toISOString(),
      topN: top,
      tz: "Europe/London",
    });
    const promptHash = hashPrompt(prompt);

    // 3) LLM call (Chat Completions; deterministic for gpt-5)
    console.log("cluster/llm using model:", MODEL);

    const completion = await openai.chat.completions.create({
      model: MODEL, // should resolve to "gpt-5"
      //temperature: 0, // deterministic clustering
      response_format: { type: "json_object" }, // forces well-formed JSON
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.choices?.[0]?.message?.content ?? "";
    let parsed: LLMResponse;
    try {
      parsed = JSON.parse(text) as LLMResponse;
    } catch {
      return NextResponse.json(
        {
          ok: false,
          modelUsed: MODEL,
          error: "LLM returned invalid JSON.",
          raw: text.slice(0, 2000),
        },
        { status: 502 }
      );
    }

    const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : [];
    const topSummaries = Array.isArray(parsed.top_summaries)
      ? parsed.top_summaries
      : [];
    if (clusters.length === 0) {
      return NextResponse.json(
        { ok: true, modelUsed: MODEL, message: "LLM produced zero clusters." },
        { status: 200 }
      );
    }

    // 4) Create run snapshot
    const runDate = startOfDayInTZ(now, "Europe/London");
    const { data: runRow, error: runErr } = await supabase
      .from("cluster_runs")
      .insert([
        {
          run_date: new Date(
            runDate.getFullYear(),
            runDate.getMonth(),
            runDate.getDate()
          )
            .toISOString()
            .slice(0, 10), // YYYY-MM-DD
          window_start: windowStart.toISOString(),
          window_end: windowEnd.toISOString(),
          model: MODEL,
          prompt_hash: promptHash,
        },
      ])
      .select("id")
      .single();

    if (runErr) throw runErr;
    const runId = runRow.id as string;

    // after you've computed runDate and runDateStr once
    const runDateStr = new Date(
      runDate.getFullYear(),
      runDate.getMonth(),
      runDate.getDate()
    )
      .toISOString()
      .slice(0, 10); // "YYYY-MM-DD"

    // 5) Insert clusters (fresh daily IDs) preserving order
    const { data: insertedClusters, error: cErr } = await supabase
      .from("clusters")
      .insert(
        clusters.map((c) => ({
          label: c.topic_label?.slice(0, 80) || null,
          cluster_date: runDateStr, // ✅ REQUIRED by your schema
        }))
      )
      .select("id, label");

    if (cErr) throw cErr;

    // Map insertion order back to clusters order (avoid label collision issues)
    const clusterIdByIndex: string[] = [];
    const clusterIdByRank = new Map<number, string>();
    clusters.forEach((c, i) => {
      const insertedId = insertedClusters?.[i]?.id as string;
      clusterIdByIndex.push(insertedId);
      clusterIdByRank.set(c.rank, insertedId);
    });

    // 6) Insert cluster_members
    const memberRows = clusters.flatMap((c, i) => {
      const cid = clusterIdByIndex[i];
      return (c.member_ids || []).map((aid) => ({
        cluster_id: cid,
        article_id: aid,
        score: null as number | null,
      }));
    });
    if (memberRows.length > 0) {
      const { error: cmErr } = await supabase
        .from("cluster_members")
        .insert(memberRows);
      if (cmErr) throw cmErr;
    }

    // 7) Insert clusters_in_run
    const cirRows = clusters.map((c, i) => ({
      run_id: runId,
      cluster_id: clusterIdByIndex[i],
      size: c.size ?? c.member_ids?.length ?? 0,
      sources_count: c.sources_count ?? 0,
      breaking_flag: !!c.breaking,
      freshness_score: Number(c.freshness_score ?? 0),
      total_score: Number(c.total_score ?? 0),
      rank: Number(c.rank ?? null),
      derived_label: c.topic_label?.slice(0, 80) ?? null,
      details: { market_impact_score: Number(c.market_impact_score ?? 0) },
    }));
    if (cirRows.length > 0) {
      const { error: cirErr } = await supabase
        .from("clusters_in_run")
        .insert(cirRows);
      if (cirErr) throw cirErr;
    }

    // 8) Insert top_daily_clusters from top_summaries (fallback to top ranks)
    const topRanks =
      topSummaries.length > 0
        ? topSummaries
            .map((s) => Number(s.cluster_rank))
            .filter((r) => Number.isFinite(r))
        : clusters
            .map((c) => Number(c.rank))
            .filter((r) => Number.isFinite(r))
            .sort((a, b) => a - b)
            .slice(0, top);

    const topRows = topRanks.map((rk) => ({
      run_id: runId,
      cluster_id: clusterIdByRank.get(rk)!,
      rank: rk,
      total_score: Number(
        clusters.find((c) => c.rank === rk)?.total_score ?? 0
      ),
    }));
    if (topRows.length > 0) {
      const { error: topErr } = await supabase
        .from("top_daily_clusters")
        .insert(topRows);
      if (topErr) throw topErr;
    }

    // 9) Insert summaries (≤50 words each)
    const tokensIn = completion.usage?.prompt_tokens ?? 0;
    const tokensOut = completion.usage?.completion_tokens ?? 0;
    const costEstimate =
      (tokensIn / 1000) * PRICE_IN_PER_1K +
      (tokensOut / 1000) * PRICE_OUT_PER_1K;

    const summariesRows = topSummaries
      .map((s) => {
        const cid = clusterIdByRank.get(Number(s.cluster_rank));
        if (!cid) return null;
        return {
          run_id: runId,
          cluster_id: cid,
          bullet_1: null,
          bullet_2: null,
          bullet_3: null,
          bullet_4: null,
          bullet_5: null,
          summary_text: trunc(s.summary, 300),
          model: MODEL,
          tokens_in: tokensIn || null,
          tokens_out: tokensOut || null,
          cost_estimate: Number.isFinite(costEstimate) ? costEstimate : null,
        };
      })
      .filter(Boolean) as any[];

    if (summariesRows.length > 0) {
      const { error: sumErr } = await supabase
        .from("summaries")
        .insert(summariesRows);
      if (sumErr) throw sumErr;
    }

    // 10) Response
    return NextResponse.json(
      {
        ok: true,
        modelUsed: MODEL,
        runId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        counts: {
          articles: rows.length,
          clusters_total: clusters.length,
          top_n: topRanks.length,
        },
        top_ranks: topRanks,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Cluster route error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
