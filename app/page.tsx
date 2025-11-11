// app/page.tsx
// Citadel-inspired look: deep navy palette, clean type, subtle gradients
// Drop this into your Next.js App Router project at app/page.tsx

import { supabase } from "@/lib/supabase";

export default async function Home() {
  // Read top summaries for the latest run from the view
  const { data: topSummaries } = await supabase
    .from("latest_run_top_summaries")
    .select("rank, summary_text")
    .order("rank", { ascending: true })
    .limit(8);

  // Build the 8 bullets (or fewer) directly from the view rows
  let summaryBullets: string[] = (topSummaries ?? [])
    .map((r: any) => r?.summary_text as string)
    .filter(Boolean)
    .slice(0, 8);

  // Fallback placeholder if the view is empty
  if (!summaryBullets.length) {
    summaryBullets = [
      "Fetching real data…",
      "RSS ingestion pipeline not yet active.",
      "Once active this card updates daily.",
      "Clusters = groups of similar articles.",
      "Summaries = 8-bullet executive view.",
      "Coverage: US, Europe, Markets…",
      "Neutral tone, linkable sources.",
      "Auto-generated each morning.",
    ];
  }

  return (
    <main className="min-h-screen bg-[#0b1730] text-white">
      {/* Top gradient accent */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1000px_600px_at_70%_-10%,rgba(30,96,180,0.35),transparent_60%)]" />

      {/* Navbar */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1730]/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-[#1f6ad4] to-[#13a3d8]" />
            <span className="text-sm tracking-widest text-white/80">
              ANTISH MANNA
            </span>
          </div>
          <nav className="hidden gap-8 text-sm text-white/70 md:flex">
            <a className="hover:text-white transition" href="#about">
              About
            </a>
            <a className="hover:text-white transition" href="#features">
              Features
            </a>
            <a className="hover:text-white transition" href="#contact">
              Contact
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 py-24 md:py-28">
        <div className="grid items-center gap-12 md:grid-cols-2">
          {/* Left column: heading, copy, sources */}
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Daily Global News,
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#1f6ad4] to-[#13a3d8]">
                distilled into 8 essentials
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
              A modern briefing that cuts through noise. I systematically scan
              reputable financial news outlets globally and publish an
              eight-bullet executive summary every morning.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#learn-more"
                className="group inline-flex items-center rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                Learn more
              </a>
              <a
                href="#contact"
                className="inline-flex items-center rounded-lg bg-gradient-to-r from-[#1f6ad4] to-[#13a3d8] px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(31,106,212,0.35)] hover:opacity-95"
              >
                Contact
              </a>
            </div>
            <div className="mt-6 text-xs text-white/50">
              Sources include Bloomberg, Reuters, MarketWatch, CNBC and Yahoo
              Finance.
            </div>
          </div>

          {/* (Optional) keep an empty right column for spacing on desktop */}
          <div />

          {/* Pane placed as its own grid item that spans both columns */}
          <div className="mt-8 md:col-span-2 w-full">
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
              <div className="absolute right-5 top-5 h-2 w-2 rounded-full bg-emerald-400" />
              <p className="text-xs uppercase tracking-widest text-white/50">
                Today’s Brief
              </p>
              <h3 className="mt-2 text-lg font-medium text-white">
                Top stories at a glance
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-white/80">
                {summaryBullets.map((b, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f6ad4]" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex gap-3 text-xs text-white/60">
                <span className="rounded bg-white/10 px-2 py-1">US</span>
                <span className="rounded bg-white/10 px-2 py-1">Europe</span>
                <span className="rounded bg-white/10 px-2 py-1">Markets</span>
              </div>
              <div className="mt-6 flex justify-end text-xs text-white/50">
                Live preview
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature bullets */}
      <section id="features" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 md:grid-cols-3">
          <Feature
            title="Curated Sources"
            desc="Top-tier financial news outlets only; paywall-safe links included every day."
          />
          <Feature
            title="Eight Bullets"
            desc="Top 8 market-moving news themes summarised; neutral, factual."
          />
          <Feature
            title="Daily at 06:00 UK"
            desc="Consistent cadence optimised for the morning routine."
          />
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-10 text-sm text-white/60">
          <p>© {new Date().getFullYear()} antishmanna.com</p>
          <div className="flex gap-6">
            <a className="hover:text-white" href="#">
              Privacy
            </a>
            <a className="hover:text-white" href="#">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
      <h4 className="text-base font-semibold text-white">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{desc}</p>
    </div>
  );
}
