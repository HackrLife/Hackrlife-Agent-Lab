import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { products, getProduct } from "@/lib/catalogue";
import { StatusBadge } from "@/components/Badge";
import { FeatureList } from "@/components/FeatureList";
import { Eyebrow } from "@/components/Section";
import { ProductExperience } from "@/components/product/ProductExperience";
import { LiveInvoiceChaser } from "@/components/live/LiveInvoiceChaser";
import { AgentArchitecture } from "@/components/live/AgentArchitecture";

/** Pre-render every product page at build time. */
export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const p = getProduct(params.slug);
  if (!p) return { title: "Solution not found" };
  return {
    title: p.name,
    description: `${p.outcome} ${p.definition.split(". ")[0]}.`,
    openGraph: { title: `${p.name} · HackrLife Agent Lab`, description: p.outcome },
  };
}

export default function ProductPage({ params }: { params: { slug: string } }) {
  const p = getProduct(params.slug);
  if (!p) notFound();
  const book = `/book?product=${p.slug}`;

  return (
    <article>
      {/* 1. Definition and fit */}
      <section className="relative overflow-hidden border-b border-ink-600/10 dark:border-paper/10">
        <div className="blueprint pointer-events-none absolute inset-0 opacity-40" />
        <div className="container-lab relative py-14 sm:py-20">
          <Link href="/agents" className="font-mono text-xs text-ink-500 hover:text-ink-900 dark:text-paper/50 dark:hover:text-paper">
            ← All solutions
          </Link>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="pill border border-ink-600/15 bg-white/60 text-ink-600 dark:border-paper/15 dark:bg-ink-800/60 dark:text-paper/70">
              {String(p.no).padStart(2, "0")} · {p.sectorLabel}
            </span>
            <StatusBadge mode={p.demo.mode} />
            {p.liveDemo && <span className="pill bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Live agent</span>}
            {p.sectors.map((s) => (
              <Link key={s} href={`/agents?sector=${encodeURIComponent(s)}`} className="pill bg-data/15 text-data-600 hover:bg-data/25 dark:bg-data/20 dark:text-data">
                {s}
              </Link>
            ))}
          </div>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-tight text-ink-900 dark:text-paper sm:text-5xl">{p.name}</h1>
          <p className="mt-3 max-w-2xl font-display text-xl text-signal dark:text-brand-light">{p.outcome}</p>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-600 dark:text-paper/70">{p.definition}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {p.liveDemo ? (
              <a href="#live" className="btn-primary">Try the live demo</a>
            ) : (
              <a href="#demo" className="btn-primary">Try demo</a>
            )}
            <Link href={book} className="btn-ghost">Book a demo for my business</Link>
          </div>
        </div>
      </section>

      <div className="container-lab space-y-16 py-16">
        {p.liveDemo === "invoice-chaser" ? (
          <>
            {/* 2. What it is, what it does and why it matters */}
            <section className="grid gap-6 md:grid-cols-2">
              <div className="card p-6">
                <Eyebrow>Why it matters</Eyebrow>
                <p className="text-base leading-relaxed text-ink-800 dark:text-paper/85">{p.situation}</p>
                <div className="mt-5 border-t border-ink-600/10 pt-4 dark:border-paper/10">
                  <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-paper/50">With the agent</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700 dark:text-paper/75">{p.endState}</p>
                </div>
              </div>
              <FeatureList title="What it does" items={p.handles} tone="signal" />
            </section>

            {/* 3. Live demo */}
            <section id="live" className="scroll-mt-24">
              <Eyebrow>Live demo</Eyebrow>
              <h2 className="font-display text-3xl font-semibold text-ink-900 dark:text-paper">Run the real agent</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600 dark:text-paper/70">
                This is the actual n8n workflow and Claude, not a simulation. Pick an invoice on the left and run it. On the right you can watch each step as the agent decides what to do, and when a reminder is due it arrives in your inbox. Nothing is ever sent to the client on the invoice.
              </p>
              <div className="mt-6">
                <LiveInvoiceChaser />
              </div>
            </section>

            {/* 4. Agent architecture */}
            <section id="architecture" className="scroll-mt-24">
              <Eyebrow>Agent architecture</Eyebrow>
              <h2 className="font-display text-3xl font-semibold text-ink-900 dark:text-paper">How {p.name} is built</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600 dark:text-paper/70">
                The production agent runs every weekday at 08:00. Blue steps do the work, purple paths handle exceptions and amber checks are the controls a step cannot pass without. Click any step to see what goes in, the rule it applies and what comes out.
              </p>
              <div className="mt-6">
                <AgentArchitecture graph={p.graph} />
              </div>
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <div className="card p-6">
                  <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-paper">Harness controls</h3>
                  <ul className="mt-4 space-y-2.5">
                    {p.harness.controls.map((c) => (
                      <li key={c} className="flex gap-3 text-sm leading-relaxed text-ink-700 dark:text-paper/75">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
                <FeatureList title="What it never does" items={p.boundaries} tone="muted" />
                <div className="card p-6 text-sm leading-relaxed text-ink-700 dark:text-paper/75">
                  <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-paper">The stack</h3>
                  <p className="mt-3">
                    <span className="font-semibold text-ink-900 dark:text-paper">In production:</span> a schedule in n8n reads the invoice sheet in Google Sheets, Claude writes each reminder, a second check compares the invoice number, amount and due date in the reminder with the sheet, and the reminder is saved as a Gmail draft for the owner to send.
                  </p>
                  <p className="mt-3">
                    <span className="font-semibold text-ink-900 dark:text-paper">In this demo:</span> the page calls a separate public n8n workflow with the same rules. It only knows six fictional invoices, emails nobody but the visitor, and is limited to 25 runs a day.
                  </p>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>

        {/* 2 + 3. Situation / What it handles */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <Eyebrow>A real customer situation</Eyebrow>
            <p className="text-base leading-relaxed text-ink-800 dark:text-paper/85">{p.situation}</p>
            <div className="mt-5 border-t border-ink-600/10 pt-4 dark:border-paper/10">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-paper/50">Where the owner wants to be</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-700 dark:text-paper/75">{p.endState}</p>
            </div>
          </div>
          <div className="space-y-6">
            <FeatureList title="What it handles" items={p.handles} tone="signal" />
            <FeatureList title="What it deliberately does not do" items={p.boundaries} tone="muted" />
          </div>
        </section>

        {/* 4 + 5. Interactive demo, workflow and harness */}
        <ProductExperience slug={p.slug} />

        {/* 6. What gets delivered */}
        <section>
          <Eyebrow>What gets delivered</Eyebrow>
          <h2 className="font-display text-3xl font-semibold text-ink-900 dark:text-paper">The records your business receives</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {p.delivered.map((d) => (
              <div key={d.title} className="card p-6">
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-paper">{d.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-700 dark:text-paper/75">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 7 + 8. Custom deployment / Measurement */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="card p-6">
            <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-paper">Custom deployment</h3>
            <p className="mt-2 text-sm text-ink-600 dark:text-paper/65">Configured for your business during a paid implementation. Integrations are confirmed during discovery, never assumed.</p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-paper/50">Your business rules</p>
            <ul className="mt-2 space-y-2">
              {p.deployment.rules.map((r) => (
                <li key={r} className="flex gap-3 text-sm leading-relaxed text-ink-700 dark:text-paper/75">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-signal" />
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-paper/50">Systems we connect</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.deployment.systems.map((s) => (
                <span key={s} className="pill border border-ink-600/15 normal-case tracking-normal text-ink-700 dark:border-paper/15 dark:text-paper/75">{s}</span>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-paper">Measurement</h3>
            <p className="mt-2 text-sm text-ink-600 dark:text-paper/65">We measure completed business against a baseline, not messages sent. No results are promised before discovery.</p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-paper/50">Business results</p>
            <ul className="mt-2 space-y-2">
              {p.measures.map((m) => (
                <li key={m} className="flex gap-3 text-sm leading-relaxed text-ink-700 dark:text-paper/75">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                  {m}
                </li>
              ))}
            </ul>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-wide text-ink-500 dark:text-paper/50">Operational reliability</p>
            <ul className="mt-2 space-y-2">
              {p.reliability.map((m) => (
                <li key={m} className="flex gap-3 text-sm leading-relaxed text-ink-700 dark:text-paper/75">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </section>

          </>
        )}

        {/* 9. Book a conversation */}
        <section className="relative overflow-hidden rounded-2xl border border-ink-600/15 bg-ink-900 px-7 py-12 text-paper dark:border-paper/15 sm:px-12">
          <div className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full bg-signal/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <h2 className="font-display text-3xl font-semibold">{p.ctaLine}</h2>
            <p className="mt-3 text-base leading-relaxed text-paper/70">
              Book a call about {p.name}. We start with discovery: your current process, volumes, systems and who handles exceptions. The proposal then defines the integrations, approvals and acceptance tests before anything goes live.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={book} className="btn-signal">Book a demo for my business</Link>
              <Link href="/agents" className="btn-ghost border-paper/20 bg-transparent text-paper hover:border-paper/50 hover:bg-paper/5">
                Explore more solutions
              </Link>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
