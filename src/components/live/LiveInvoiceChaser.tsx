"use client";

import { useEffect, useState } from "react";
import { webhookUrl } from "@/lib/webhook";

/**
 * LiveInvoiceChaser: sends one fictional invoice to the real Invoice Chaser
 * agent (n8n webhook `invoice-chaser`) and shows what it decided and, when a
 * reminder is due, the draft Claude wrote. The public workflow only returns
 * the draft to this page: it sends no email and writes to no sheet.
 */

type Status = "drafted" | "skipped" | "held" | "flagged" | "error";

interface AgentReply {
  status: Status;
  message?: string;
  tone?: string;
  invoice_no?: string;
  amount_text?: string;
  days_overdue?: number;
  subject?: string;
  body?: string;
  amount_check?: string;
}

interface Form {
  sender: string;
  client_name: string;
  client_business: string;
  invoice_no: string;
  amount: string;
  due_date: string;
  last_chased: string;
  final_sent: boolean;
  paid: boolean;
  website: string;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const PRESETS: { id: string; label: string; make: () => Partial<Form> }[] = [
  { id: "friendly", label: "5 days late", make: () => ({ client_name: "Alex Taylor", client_business: "Corner Café", invoice_no: "INV-1042", amount: "1240", due_date: isoDaysAgo(5), last_chased: "", final_sent: false, paid: false }) },
  { id: "firm", label: "18 days late", make: () => ({ client_name: "Sam Rivera", client_business: "Harbour Deli", invoice_no: "INV-1038", amount: "860", due_date: isoDaysAgo(18), last_chased: "", final_sent: false, paid: false }) },
  { id: "final", label: "40 days late", make: () => ({ client_name: "Morgan Blake", client_business: "Hilltop Bakehouse", invoice_no: "INV-1029", amount: "975", due_date: isoDaysAgo(40), last_chased: isoDaysAgo(19), final_sent: false, paid: false }) },
  { id: "recent", label: "Chased 3 days ago", make: () => ({ client_name: "Riley Chen", client_business: "Bay Bistro", invoice_no: "INV-1031", amount: "1580", due_date: isoDaysAgo(37), last_chased: isoDaysAgo(3), final_sent: false, paid: false }) },
  { id: "paid", label: "Already paid", make: () => ({ client_name: "Jordan Lee", client_business: "Northside Grocer", invoice_no: "INV-1035", amount: "2150", due_date: isoDaysAgo(12), last_chased: "", final_sent: false, paid: true }) },
];

const STATUS_LABEL: Record<Status, { word: string; cls: string }> = {
  drafted: { word: "Reminder drafted", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  skipped: { word: "Skipped", cls: "bg-ink-900/8 text-ink-700 dark:bg-paper/10 dark:text-paper/80" },
  held: { word: "Held back", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  flagged: { word: "Passed to the owner", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  error: { word: "Needs a change", cls: "bg-signal/15 text-signal dark:text-brand-light" },
};

export function LiveInvoiceChaser() {
  const [f, setF] = useState<Form>({
    sender: "Acme Bakery",
    client_name: "",
    client_business: "",
    invoice_no: "",
    amount: "",
    due_date: "",
    last_chased: "",
    final_sent: false,
    paid: false,
    website: "",
  });
  const [active, setActive] = useState("friendly");
  const [phase, setPhase] = useState<"idle" | "sending" | "done" | "offline">("idle");
  const [reply, setReply] = useState<AgentReply | null>(null);

  useEffect(() => {
    setF((s) => ({ ...s, ...PRESETS[0].make() }));
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function preset(id: string) {
    const p = PRESETS.find((x) => x.id === id)!;
    setActive(id);
    setF((s) => ({ ...s, ...p.make() }));
    setPhase("idle");
    setReply(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === "sending") return;
    setPhase("sending");
    setReply(null);
    try {
      const res = await fetch(webhookUrl("invoice-chaser"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: f.sender,
          client_name: f.client_name,
          client_business: f.client_business,
          invoice_no: f.invoice_no,
          amount: f.amount,
          due_date: f.due_date,
          last_chased: f.last_chased,
          last_tone: f.final_sent ? "Final notice" : "",
          paid: f.paid,
          website: f.website,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as AgentReply;
      if (!data || !data.status) throw new Error("empty");
      setReply(data);
      setPhase("done");
    } catch {
      setPhase("offline");
    }
  }

  const st = reply ? STATUS_LABEL[reply.status] ?? STATUS_LABEL.error : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={submit} className="card p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 dark:text-paper/50">Start from an example</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => preset(p.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                active === p.id ? "border-signal text-signal dark:text-brand-light" : "border-ink-600/20 text-ink-700 hover:border-signal dark:border-paper/20 dark:text-paper/75"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ic-sender" className="label">Your business name</label>
            <input id="ic-sender" className="field" value={f.sender} onChange={set("sender")} maxLength={60} required />
          </div>
          <div>
            <label htmlFor="ic-client" className="label">Client name</label>
            <input id="ic-client" className="field" value={f.client_name} onChange={set("client_name")} maxLength={60} required />
          </div>
          <div>
            <label htmlFor="ic-biz" className="label">Client business</label>
            <input id="ic-biz" className="field" value={f.client_business} onChange={set("client_business")} maxLength={60} required />
          </div>
          <div>
            <label htmlFor="ic-no" className="label">Invoice number</label>
            <input id="ic-no" className="field" value={f.invoice_no} onChange={set("invoice_no")} maxLength={20} required />
          </div>
          <div>
            <label htmlFor="ic-amount" className="label">Amount (A$)</label>
            <input id="ic-amount" className="field" inputMode="decimal" value={f.amount} onChange={set("amount")} required />
          </div>
          <div>
            <label htmlFor="ic-due" className="label">Due date</label>
            <input id="ic-due" type="date" className="field" value={f.due_date} onChange={set("due_date")} required />
          </div>
          <div>
            <label htmlFor="ic-last" className="label">Last reminder <span className="font-normal text-ink-500 dark:text-paper/50">(optional)</span></label>
            <input id="ic-last" type="date" className="field" value={f.last_chased} onChange={set("last_chased")} />
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm text-ink-700 dark:text-paper/75">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={f.final_sent} onChange={set("final_sent")} className="h-4 w-4 rounded border-ink-600/30 text-signal focus:ring-signal" />
            The last reminder was a final notice
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={f.paid} onChange={set("paid")} className="h-4 w-4 rounded border-ink-600/30 text-signal focus:ring-signal" />
            Marked paid
          </label>
        </div>

        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.website} onChange={set("website")} />

        <button type="submit" disabled={phase === "sending"} className="btn-primary mt-6 w-full disabled:opacity-60">
          {phase === "sending" ? "The agent is working…" : "Run the real agent"}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-ink-500 dark:text-paper/50">
          Please use made-up details. What you type goes to our n8n workflow and to Claude to write the draft, and appears in the run log. Nothing is emailed or saved to a sheet.
        </p>
      </form>

      <div className="card flex flex-col p-6" aria-live="polite">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-500 dark:text-paper/50">What the agent did</p>

        {phase === "idle" && (
          <p className="mt-4 text-sm leading-relaxed text-ink-600 dark:text-paper/70">
            Pick an example or type your own invoice, then run the agent. It applies the same rules as the weekday workflow: friendly from 3 days late, firm from 14, a final notice from 30, and never twice within 7 days.
          </p>
        )}

        {phase === "sending" && (
          <p className="mt-4 text-sm text-ink-600 dark:text-paper/70">Checking the invoice and, if a reminder is due, asking Claude to write it. This usually takes a few seconds.</p>
        )}

        {phase === "offline" && (
          <p className="mt-4 text-sm leading-relaxed text-ink-600 dark:text-paper/70">
            The live agent could not be reached just now. The simulation below runs the same rules in your browser.
          </p>
        )}

        {phase === "done" && reply && st && (
          <div className="mt-4 flex flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill ${st.cls}`}>{st.word}</span>
              {reply.tone && <span className="pill border border-ink-600/15 text-ink-700 dark:border-paper/15 dark:text-paper/75">{reply.tone}</span>}
              {typeof reply.days_overdue === "number" && reply.days_overdue >= 0 && (
                <span className="font-mono text-xs text-ink-500 dark:text-paper/50">{reply.days_overdue} days overdue</span>
              )}
            </div>
            {reply.message && <p className="mt-3 text-sm leading-relaxed text-ink-700 dark:text-paper/80">{reply.message}</p>}

            {reply.status === "drafted" && reply.body && (
              <div className="mt-5 rounded-xl border border-ink-600/15 bg-paper/60 dark:border-paper/15 dark:bg-ink-800/60">
                <div className="flex items-center justify-between border-b border-ink-600/10 px-4 py-2.5 dark:border-paper/10">
                  <p className="text-sm font-semibold text-ink-900 dark:text-paper">{reply.subject}</p>
                  <span className="pill bg-amber-500/15 text-amber-700 dark:text-amber-300">Draft · not sent</span>
                </div>
                <p className="whitespace-pre-line px-4 py-4 text-sm leading-relaxed text-ink-800 dark:text-paper/85">{reply.body}</p>
                <p className="border-t border-ink-600/10 px-4 py-2.5 font-mono text-[11px] text-ink-500 dark:border-paper/10 dark:text-paper/50">
                  Amount check: {reply.amount_check ?? "—"} · {reply.invoice_no} · {reply.amount_text}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
