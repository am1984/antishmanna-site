// app/page.tsx
// Citadel-inspired look: deep navy palette, clean type, subtle gradients
// Drop this into your Next.js App Router project at app/page.tsx

export default function Home() {
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
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              Daily Global News,
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#1f6ad4] to-[#13a3d8]">
                distilled into 5 essentials
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70">
              A modern briefing that cuts through noise. We scan reputable
              outlets across the US & Europe and publish a five‑bullet executive
              summary—every morning.
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
              Sources include BBC, Reuters, AP, NPR, Politico EU, DW, and more.
            </div>
          </div>

          {/* Glass card preview */}
          <div className="md:pl-8">
            <div className="relative rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
              <div className="absolute right-5 top-5 h-2 w-2 rounded-full bg-emerald-400" />
              <p className="text-xs uppercase tracking-widest text-white/50">
                Today’s Brief
              </p>
              <h3 className="mt-2 text-lg font-medium text-white">
                Top stories at a glance
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-white/80">
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f6ad4]" />
                  Central bank holds rates; signals path dependent on inflation
                  data.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f6ad4]" />
                  Major tech earnings beat on cloud; guidance mixed into Q4.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f6ad4]" />
                  EU proposes new rules on AI model transparency and safety.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f6ad4]" />
                  Energy markets steady as inventories rebuild ahead of winter.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#1f6ad4]" />
                  Geopolitical talks resume; cease‑fire window extended 48
                  hours.
                </li>
              </ul>
              <div className="mt-5 flex gap-3 text-xs text-white/60">
                <span className="rounded bg-white/10 px-2 py-1">US</span>
                <span className="rounded bg-white/10 px-2 py-1">Europe</span>
                <span className="rounded bg-white/10 px-2 py-1">Markets</span>
              </div>
              <div className="mt-6 flex justify-end text-xs text-white/50">
                Demo preview
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
            desc="Top-tier outlets only; paywall-safe links included every day."
          />
          <Feature
            title="Five Bullets"
            desc="Exactly five takeaways per story—concise, neutral, factual."
          />
          <Feature
            title="Daily at 06:00 UK"
            desc="Consistent cadence optimised for your morning routine."
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
