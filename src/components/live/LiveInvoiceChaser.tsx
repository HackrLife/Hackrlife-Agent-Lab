"use client";

import { useEffect, useRef, useState } from "react";
import { webhookUrl } from "@/lib/webhook";

/**
 * LiveInvoiceChaser: the Live Demo for the Invoice Chaser page.
 *
 * Left: the visitor picks one of six fictional sample invoices, grouped as
 * To be paid / Reminder sent / Already paid, gives an email and joins the
 * HackrLife newsletter. Right: the real n8n workflow runs (webhook
 * `invoice-chaser`) while the steps light up one by one; when a reminder is
 * due it is emailed to the visitor, never to the client, and the email
 * appears in the panel. The workflow allows 25 runs a day in total, 3 per
 * email and one emailed sample per address per day.
 */

type Group = "due" | "chased" | "paid";
type ReplyStatus = "sent" | "drafted" | "skipped" | "held" | "flagged" | "error";

interface AgentReply {
  status: ReplyStatus;
  message?: string;
  tone?: string;
  invoice_no?: string;
  amount_text?: string;
  days_overdue?: number;
  subject?: string;
  body?: string;
  amount_check?: string;
  runs_left_today?: number;
  subscribed?: boolean;
}

interface Sample {
  id: string;
  business: string;
  amount: string;
  note: string;
  group: Group;
}

const SAMPLES: Sample[] = [
  { id: "INV-1042", business: "Corner Café", amount: "A$1,240.00", note: "5 days overdue", group: "due" },
  { id: "INV-1038", business: "Harbour Deli", amount: "A$860.00", note: "16 days overdue", group: "due" },
  { id: "INV-1029", business: "Hilltop Bakehouse", amount: "A$975.00", note: "40 days overdue", group: "due" },
  { id: "INV-1031", business: "Bay Bistro", amount: "A$1,580.00", note: "Reminder sent 4 days ago", group: "chased" },
  { id: "INV-1022", business: "Seaside Diner", amount: "A$1,100.00", note: "Final notice already sent", group: "chased" },
  { id: "INV-1035", business: "Northside Grocer", amount: "A$2,150.00", note: "Paid in full", group: "paid" },
];

const GROUPS: { id: Group; title: string; hint: string }[] = [
  { id: "due", title: "To be paid", hint: "The agent writes a reminder and emails it to you" },
  { id: "chased", title: "Reminder sent", hint: "The agent holds back or passes it to the owner" },
  { id: "paid", title: "Already paid", hint: "The agent leaves it alone" },
];

type StepId = "in" | "check" | "write" | "verify" | "send";
type StepState = "idle" | "active" | "done" | "skipped" | "halt";

const STEPS: { id: StepId; code: string; title: string; sub: string }[] = [
  { id: "in", code: "1", title: "Agent scans and selects the invoice", sub: "Reads the invoice you picked on this page" },
  { id: "check", code: "2", title: "Agent checks status and dates", sub: "Paid? How many days overdue? Chased in the last 7 days?" },
  { id: "write", code: "3", title: "Agent crafts the reminder email", sub: "Friendly from 3 days late, firm from 14, final notice from 30" },
  { id: "verify", code: "4", title: "Second agent checks for errors in dates and amounts", sub: "Invoice number, amount and due date must match the invoice exactly" },
  { id: "send", code: "5", title: "Agent emails it to the requested address", sub: "Only to the email you gave, never to the client on the invoice" },
];

const IDLE: Record<StepId, StepState> = { in: "idle", check: "idle", write: "idle", verify: "idle", send: "idle" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BRANCH: Partial<Record<ReplyStatus, { title: string; tone: string }>> = {
  held: { title: "Hold back", tone: "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-200" },
  flagged: { title: "Pass to the owner", tone: "border-violet-500/60 bg-violet-500/10 text-violet-800 dark:text-violet-200" },
  skipped: { title: "Leave it alone", tone: "border-ink-600/30 bg-ink-900/5 text-ink-700 dark:border-paper/30 dark:bg-paper/5 dark:text-paper/80" },
};

export function LiveInvoiceChaser() {
  const shownAt = useRef<number>(0);
  const [sampleId, setSampleId] = useState("INV-1038");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<StepId, StepState>>(IDLE);
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const sample = SAMPLES.find((s) => s.id === sampleId)!;

  function reset() {
    setSteps(IDLE);
    setReply(null);
    setShowEmail(false);
  }

  function mark(id: StepId, state: StepState) {
    setSteps((s) => ({ ...s, [id]: state }));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (running) return;
    setRunning(true);
    reset();
    const to = email.trim();
    setSentTo(to);

    const request = fetch(webhookUrl("invoice-chaser"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "send",
        sample_id: sample.id,
        email: to,
        newsletter_consent: consent,
        elapsed_ms: Date.now() - shownAt.current,
        website,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AgentReply;
        if (!data || !data.status) throw new Error("empty");
        return data;
      })
      .catch((): AgentReply => ({ status: "error", message: "The live agent could not be reached just now. Please try again in a minute." }));

    mark("in", "active");
    await sleep(700);
    mark("in", "done");
    mark("check", "active");
    await sleep(900);
    if (sample.group === "due") {
      mark("check", "done");
      mark("write", "active");
    }

    const data = await request;
    setReply(data);

    if (data.status === "error") {
      setSteps((s) => {
        const next = { ...s };
        (Object.keys(next) as StepId[]).forEach((k) => {
          if (next[k] === "active") next[k] = "halt";
        });
        return next;
      });
      setRunning(false);
      return;
    }

    if (data.status === "sent" || data.status === "drafted") {
      mark("check", "done");
      mark("write", "done");
      mark("verify", "active");
      await sleep(800);
      mark("verify", "done");
      mark("send", "active");
      await sleep(900);
      mark("send", data.status === "sent" ? "done" : "halt");
      await sleep(250);
      setShowEmail(true);
    } else {
      setSteps({ in: "done", check: "done", write: "skipped", verify: "skipped", send: "skipped" });
    }
    setRunning(false);
  }

  const branch = reply ? BRANCH[reply.status] : undefined;
  const buttonText = running ? "The agent is working…" : sample.group === "due" ? "Run the agent and email me" : "Run the agent";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
      {/* Left: what the visitor does */}
      <form onSubmit={run} className="card p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 dark:text-paper/50">1 · Pick an invoice</p>
        <div className="mt-3 space-y-4">
          {GROUPS.map((g) => (
            <div key={g.id}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-paper">{g.title}</h3>
                <span className="text-right text-[11px] text-ink-500 dark:text-paper/50">{g.hint}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {SAMPLES.filter((s) => s.group === g.id).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={running}
                    onClick={() => {
                      setSampleId(s.id);
                      reset();
                    }}
                    className={`rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                      sampleId === s.id ? "border-signal bg-signal/5 ring-1 ring-signal" : "border-ink-600/15 hover:border-signal dark:border-paper/15"
                    }`}
                  >
                    <span className="block font-mono text-[11px] text-ink-500 dark:text-paper/50">
                      {s.id} · {s.amount}
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-ink-900 dark:text-paper">{s.business}</span>
                    <span className="block text-xs text-ink-600 dark:text-paper/65">{s.note}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 dark:text-paper/50">2 · Your email</p>
        <input
          id="ic-email"
          type="email"
          aria-label="Your email"
          placeholder="you@example.com"
          className="field mt-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={120}
          required
          autoComplete="email"
        />
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-ink-700 dark:text-paper/75">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 rounded border-ink-600/30 text-signal focus:ring-signal"
          />
          <span>
            Sign me up to the{" "}
            <a href="https://www.hackrlife.com/" target="_blank" rel="noopener noreferrer" className="underline decoration-ink-600/30 underline-offset-2 hover:text-signal">
              HackrLife newsletter
            </a>
            . Required for the live demo; you can unsubscribe at any time.
          </span>
        </label>
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />

        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 dark:text-paper/50">3 · Run it</p>
        <button type="submit" disabled={running} className="btn-primary mt-2 w-full disabled:opacity-60">
          {buttonText}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-ink-500 dark:text-paper/50">
          The invoices are fictional. Reminders go only to the email above, one per address per day. The live demo is limited to 25 runs a day.
        </p>
      </form>

      {/* Right: the agent at work */}
      <div className="card relative flex min-h-[560px] flex-col overflow-hidden p-6" aria-live="polite">
        <div className="canvas-dots pointer-events-none absolute inset-0" />
        <div className="relative flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 dark:text-paper/50">The agent at work</p>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-500 dark:text-paper/50">
            <span className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-signal" : reply ? (reply.status === "error" ? "bg-signal" : "bg-emerald-500") : "bg-ink-500/40"}`} />
            {running ? "running" : reply ? (reply.status === "error" ? "stopped" : "finished") : "waiting"}
          </span>
        </div>

        <ol className="relative mt-5">
          {STEPS.map((step, i) => {
            const st = steps[step.id];
            const nextSt = i < STEPS.length - 1 ? steps[STEPS[i + 1].id] : "idle";
            const lineClass =
              st === "done" && nextSt === "active"
                ? "flow-line text-signal"
                : st === "done" && (nextSt === "done" || nextSt === "halt")
                  ? "bg-emerald-500"
                  : nextSt === "skipped"
                    ? "bg-ink-600/10 dark:bg-paper/10"
                    : "bg-ink-600/20 dark:bg-paper/20";
            return (
              <li key={step.id} className="relative pb-5 last:pb-0">
                {i < STEPS.length - 1 && <span aria-hidden="true" className={`absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-[2px] ${lineClass}`} />}
                <div className="flex items-start gap-3">
                  <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
                    {st === "active" && <span className="absolute inset-0 animate-ping rounded-xl bg-signal/30" />}
                    <span
                      className={`relative flex h-10 w-10 items-center justify-center rounded-xl border font-mono text-xs font-semibold transition-colors duration-300 ${
                        st === "done"
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : st === "active"
                            ? "border-signal bg-signal text-white"
                            : st === "halt"
                              ? "border-signal bg-white text-signal dark:bg-ink-800"
                              : st === "skipped"
                                ? "border-ink-600/15 bg-white text-ink-500/50 dark:border-paper/10 dark:bg-ink-800 dark:text-paper/30"
                                : "border-ink-600/25 bg-white text-ink-600 dark:border-paper/25 dark:bg-ink-800 dark:text-paper/70"
                      }`}
                    >
                      {st === "done" ? "✓" : step.code}
                    </span>
                  </span>
                  <div
                    className={`min-w-0 flex-1 rounded-xl border px-3 py-2 transition-all duration-300 ${
                      st === "active"
                        ? "border-signal bg-white shadow-md dark:bg-ink-800"
                        : st === "skipped"
                          ? "border-ink-600/10 bg-white/50 opacity-50 dark:border-paper/10 dark:bg-ink-800/50"
                          : "border-ink-600/15 bg-white dark:border-paper/15 dark:bg-ink-800"
                    }`}
                  >
                    <p className="text-sm font-medium text-ink-900 dark:text-paper">{step.title}</p>
                    <p className="text-xs text-ink-500 dark:text-paper/55">{st === "skipped" ? "Not needed for this invoice" : step.sub}</p>
                  </div>
                  {step.id === "check" && branch && (
                    <div className={`animate-fade-up hidden w-40 flex-shrink-0 rounded-xl border px-3 py-2 sm:block ${branch.tone}`}>
                      <p className="text-sm font-semibold">{branch.title}</p>
                      <p className="text-[11px]">Branch taken</p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {reply && branch && (
          <div className={`animate-fade-up relative mt-5 rounded-xl border p-4 ${branch.tone}`}>
            <p className="text-sm font-semibold">{branch.title}</p>
            <p className="mt-1 text-sm leading-relaxed">{reply.message}</p>
          </div>
        )}

        {reply && reply.status === "error" && (
          <div className="animate-fade-up relative mt-5 rounded-xl border border-signal/50 bg-signal/5 p-4">
            <p className="text-sm font-semibold text-signal dark:text-brand-light">The agent stopped</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700 dark:text-paper/80">{reply.message}</p>
          </div>
        )}

        {showEmail && reply && reply.body && (
          <div className="animate-fade-up relative mt-5 overflow-hidden rounded-xl border border-ink-600/20 bg-white shadow-lg dark:border-paper/20 dark:bg-ink-800">
            <div className="flex items-center justify-between gap-3 border-b border-ink-600/10 bg-paper/70 px-4 py-2 dark:border-paper/10 dark:bg-ink-900/60">
              <span className="truncate font-mono text-[11px] text-ink-500 dark:text-paper/50">
                {reply.status === "sent" ? `Sent to ${sentTo}` : "Could not be emailed just now"}
              </span>
              <span className={`pill shrink-0 ${reply.status === "sent" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                {reply.status === "sent" ? "In your inbox" : "Shown here instead"}
              </span>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-ink-500 dark:text-paper/50">From: HackrLife Agent Lab · {reply.tone} reminder</p>
              <p className="mt-1 text-sm font-semibold text-ink-900 dark:text-paper">[Demo] {reply.subject}</p>
              <p className="mt-3 max-h-56 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-800 dark:text-paper/85">{reply.body}</p>
            </div>
            <p className="border-t border-ink-600/10 px-4 py-2 font-mono text-[11px] text-ink-500 dark:border-paper/10 dark:text-paper/50">
              Amount check: {reply.amount_check} · {reply.invoice_no} · {reply.amount_text}
              {reply.status === "sent" ? " · may take a minute; check spam" : ""}
            </p>
          </div>
        )}

        {!reply && !running && (
          <p className="relative mt-5 text-sm leading-relaxed text-ink-600 dark:text-paper/70">
            Pick an invoice, add your email and run the agent. Each step lights up as the real workflow runs. If a reminder is due, it lands in your inbox and appears here.
          </p>
        )}
      </div>
    </div>
  );
}
