import type { DemoAction, DemoDefinition, Product } from "../types";
import { Sim, aud, DAY, HOUR } from "../sim";

/* ------------------------------------------------------------------ */
/* Fixtures (fictional)                                                */
/* ------------------------------------------------------------------ */

const BUSINESS = "Acme Bakery";
const OWNER = "Priya (owner)";
const GRACE_DAYS = 3;
const FIRM_DAYS = 14;
const FINAL_DAYS = 30;
const REPEAT_DAYS = 7;

type Tone = "Friendly" | "Firm" | "Final notice";

interface Invoice {
  no: string;
  client: string;
  business: string;
  email: string;
  amount: number;
  /** Days past the due date at the start of the demo (negative = not yet due). */
  overdue: number;
  paid: boolean;
  /** Days since the last reminder was drafted, or null if never chased. */
  lastChased: number | null;
  /** A final notice has already been drafted for this invoice. */
  finalDrafted: boolean;
}

/** Four fixed rows; the first row (INV-1042) is set from the demo inputs. */
const FIXED: Invoice[] = [
  { no: "INV-1038", client: "Sam Rivera", business: "Harbour Deli", email: "sam@example.com", amount: 860, overdue: 16, paid: false, lastChased: null, finalDrafted: false },
  { no: "INV-1035", client: "Jordan Lee", business: "Northside Grocer", email: "jordan@example.com", amount: 2150, overdue: 12, paid: true, lastChased: null, finalDrafted: false },
  { no: "INV-1045", client: "Casey Morgan", business: "Park Kiosk", email: "casey@example.com", amount: 420, overdue: -5, paid: false, lastChased: null, finalDrafted: false },
  { no: "INV-1031", client: "Riley Chen", business: "Bay Bistro", email: "riley@example.com", amount: 1580, overdue: 37, paid: false, lastChased: 4, finalDrafted: false },
];

const MAIN = "INV-1042";
const MAIN_AMOUNT = 1240;
const CHASED_OPTIONS = ["Never", "3 days ago", "10 days ago"];

interface Draft {
  no: string;
  tone: Tone;
  day: number;
}

type Step = "review" | "done";

interface State {
  step: Step;
  /** Days since the demo started; each run happens at 08:00 on this day. */
  day: number;
  runs: number;
  invoices: Invoice[];
  drafts: Draft[];
  lastDraftKeys: string[];
  ownerTasks: string[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function overdueNow(s: State, inv: Invoice): number {
  return inv.overdue + s.day;
}

function toneFor(days: number): Tone {
  if (days >= FINAL_DAYS) return "Final notice";
  if (days >= FIRM_DAYS) return "Firm";
  return "Friendly";
}

function chasedLabel(s: State, inv: Invoice): string {
  if (inv.lastChased === null) return "Never";
  const ago = inv.lastChased;
  return ago === 0 ? `drafted on day ${s.day + 1}` : `${ago} day${ago === 1 ? "" : "s"} ago`;
}

function draftText(inv: Invoice, tone: Tone, days: number): string {
  const first = inv.client.split(" ")[0];
  if (tone === "Friendly")
    return `Hi ${first}, a quick note from ${BUSINESS}: invoice ${inv.no} for ${aud(inv.amount)} was due ${days} days ago. It may simply have slipped through, so I've attached it again. Could you let me know when it's likely to be paid?`;
  if (tone === "Firm")
    return `Hi ${first}, invoice ${inv.no} for ${aud(inv.amount)} is now ${days} days overdue. Please arrange payment this week, or reply if there is a problem with the invoice so we can sort it out.`;
  return `Hi ${first}, invoice ${inv.no} for ${aud(inv.amount)} is ${days} days overdue and this is our final notice. Please pay within 7 days. If payment isn't received, we will need to pause further orders until the account is settled.`;
}

function sheetRecord(sim: Sim<State>) {
  const s = sim.s;
  sim.record({
    id: "sheet",
    title: "Invoice sheet (sample)",
    status: `${s.invoices.length} invoices · run ${s.runs}`,
    tone: "default",
    fields: s.invoices.map((inv) => {
      const d = overdueNow(s, inv);
      const state = inv.paid ? "Paid" : d < 0 ? `Due in ${-d} days` : `${d} days overdue`;
      return {
        label: `${inv.no} · ${inv.business} · ${aud(inv.amount)}`,
        value: `${state} · last chased: ${chasedLabel(s, inv)}`,
        tone: inv.paid ? ("ok" as const) : d >= GRACE_DAYS ? ("warn" as const) : ("default" as const),
      };
    }),
  });
}

function draftsRecord(sim: Sim<State>) {
  const s = sim.s;
  sim.record({
    id: "drafts",
    title: "Gmail drafts awaiting the owner",
    status: s.drafts.length ? `${s.drafts.length} draft${s.drafts.length === 1 ? "" : "s"} — nothing sent` : "No drafts waiting",
    tone: s.drafts.length ? "warn" : "muted",
    fields: s.drafts.length
      ? s.drafts.map((d) => {
          const inv = s.invoices.find((i) => i.no === d.no)!;
          return { label: `${d.no} · ${inv.client}`, value: `${d.tone} · ${aud(inv.amount)} · drafted day ${d.day + 1}` };
        })
      : [{ label: "Drafts", value: "None", tone: "muted" as const }],
  });
}

/* ------------------------------------------------------------------ */
/* The 08:00 run                                                       */
/* ------------------------------------------------------------------ */

function dailyRun(sim: Sim<State>) {
  const s = sim.s;
  s.runs += 1;
  s.lastDraftKeys = [];
  sim.emit("trigger", "started", `Weekday 08:00 run ${s.runs} (day ${s.day + 1})`);
  sim.emit("read", "passed", `Read ${s.invoices.length} invoices from the sheet`, "Client, email, amount, due date, status, last chased.");

  let drafted = 0;
  for (const inv of s.invoices) {
    const d = overdueNow(s, inv);
    if (inv.paid) {
      sim.emit("b_skip", "info", `${inv.no} skipped — marked paid`);
      continue;
    }
    if (d < GRACE_DAYS) {
      sim.emit("b_skip", "info", `${inv.no} skipped — ${d < 0 ? `not due for ${-d} days` : `only ${d} day${d === 1 ? "" : "s"} late, within the grace period`}`);
      continue;
    }
    if (!inv.email || !inv.amount) {
      sim.emit("b_missing", "blocked", `${inv.no} has no email on file — no draft`, "Flagged to the owner instead.");
      const key = `${inv.no}:missing:${s.day}`;
      if (sim.claim(key, "b_missing", "owner task")) {
        sim.send({ channel: "task", to: OWNER, summary: `Add a billing email for ${inv.business} (${inv.no}) so it can be chased`, status: "simulated", opKey: key });
        s.ownerTasks.push(inv.no);
      }
      continue;
    }
    if (inv.lastChased !== null && inv.lastChased < REPEAT_DAYS) {
      sim.emit("c_repeat", "blocked", `${inv.no} chased ${inv.lastChased === 0 ? "today" : `${inv.lastChased} day${inv.lastChased === 1 ? "" : "s"} ago`} — not chased again`, `No repeat within ${REPEAT_DAYS} days.`);
      sim.emit("b_recent", "info", `${inv.no} held until day ${s.day + 1 + (REPEAT_DAYS - inv.lastChased)}`);
      continue;
    }
    sim.emit("find", "passed", `${inv.no} is ${d} days overdue and unpaid`, `${inv.business} · ${aud(inv.amount)}`);
    const tone = toneFor(d);
    if (tone === "Final notice" && inv.finalDrafted) {
      sim.emit("tone", "stopped", `${inv.no}: final notice already drafted — handed to the owner`, "The agent drafts one final notice only. What happens next is the owner's call.");
      const key = `${inv.no}:after-final`;
      if (sim.claim(key, "tone", "owner task")) {
        sim.send({ channel: "task", to: OWNER, summary: `${inv.no} (${inv.business}) is still unpaid after a final notice — decide the next step`, status: "simulated", opKey: key });
        s.ownerTasks.push(inv.no);
      }
      continue;
    }
    sim.emit("tone", "passed", `${inv.no}: ${tone.toLowerCase()} tone (${d} days late)`, `Friendly from ${GRACE_DAYS} days, firm from ${FIRM_DAYS}, final notice from ${FINAL_DAYS}.`);
    sim.emit("c_amount", "passed", `${inv.no}: amount copied unchanged — ${aud(inv.amount)}`);
    const key = `${inv.no}:draft:day${s.day}`;
    if (!sim.claim(key, "draft", "draft")) continue;
    s.drafts = s.drafts.filter((x) => x.no !== inv.no);
    s.drafts.push({ no: inv.no, tone, day: s.day });
    s.lastDraftKeys.push(key);
    if (tone === "Final notice") inv.finalDrafted = true;
    sim.send({ channel: "email", to: inv.email, summary: `Gmail draft (${tone.toLowerCase()}): ${inv.no} — ${aud(inv.amount)}`, status: "held", opKey: key });
    sim.emit("c_draftonly", "passed", `${inv.no}: saved as a draft, not sent`);
    sim.emit("draft", "passed", `Draft saved for ${inv.client}`, draftText(inv, tone, d), { opKey: key, ref: inv.no });
    inv.lastChased = 0;
    sim.emit("write", "confirmed", `Sheet updated: ${inv.no} drafted on day ${s.day + 1}`);
    drafted += 1;
  }

  if (drafted) sim.say("assistant", `Good morning ${OWNER.split(" ")[0]}. ${drafted} reminder${drafted === 1 ? " is" : "s are"} waiting in Gmail drafts for you to check and send. I haven't sent anything.`);
  else sim.say("assistant", "Nothing to chase this morning. No drafts were created.");
  for (const d of s.drafts.filter((x) => x.day === s.day)) {
    const inv = s.invoices.find((i) => i.no === d.no)!;
    sim.say("system", `Draft to ${inv.email} — ${draftText(inv, d.tone, overdueNow(s, inv))}`);
  }
  sheetRecord(sim);
  draftsRecord(sim);
  return review(sim);
}

function review(sim: Sim<State>) {
  const s = sim.s;
  s.step = "review";
  const main = s.invoices.find((i) => i.no === MAIN)!;
  const acts: DemoAction[] = [];
  if (s.drafts.length) acts.push({ id: "send_all", label: `Owner: check and send ${s.drafts.length} draft${s.drafts.length === 1 ? "" : "s"} from Gmail`, actor: "staff", tone: "primary", hint: "The owner sends. The agent never does." });
  if (s.drafts.some((d) => d.no === MAIN)) acts.push({ id: "discard_main", label: `Owner: delete the ${MAIN} draft`, actor: "staff" });
  if (!main.paid) acts.push({ id: "mark_paid", label: `${main.client} pays ${MAIN} — owner marks it paid`, actor: "customer" });
  if (s.lastDraftKeys.length) acts.push({ id: "retry_draft", label: "Simulate the draft step running twice", actor: "clock", hint: "For example, an automatic retry after a timeout." });
  acts.push({ id: "run_tomorrow", label: "Next weekday 08:00 run", actor: "clock" });
  acts.push({ id: "run_next_week", label: `Advance ${REPEAT_DAYS} days and run again`, actor: "clock" });
  acts.push({ id: "end_review", label: "Owner: leave the drafts for later", actor: "staff" });
  return sim.wait("waiting_staff", acts);
}

function advanceDays(sim: Sim<State>, n: number) {
  const s = sim.s;
  s.day += n;
  sim.advance(n * DAY);
  for (const inv of s.invoices) if (inv.lastChased !== null) inv.lastChased += n;
}

/* ------------------------------------------------------------------ */
/* Demo                                                                */
/* ------------------------------------------------------------------ */

const demo: DemoDefinition<State> = {
  mode: "simulation",
  boundary: "Uses a sample invoice sheet for a fictional bakery and a simulation clock. Drafts stay in an on-screen outbox; no email is sent and no real sheet is changed.",
  assistantName: "Acme Bakery invoice assistant",
  channelLabel: "Morning summary to the owner",
  fields: [
    { kind: "number", name: "days_overdue", label: `Days ${MAIN} is overdue`, min: -10, max: 90, suffix: "days", helper: `Friendly from ${GRACE_DAYS} days late, firm from ${FIRM_DAYS}, final notice from ${FINAL_DAYS}.` },
    { kind: "select", name: "last_chased", label: `Last reminder for ${MAIN}`, options: CHASED_OPTIONS, helper: `Never chased twice within ${REPEAT_DAYS} days.` },
    { kind: "toggle", name: "paid", label: `${MAIN} already marked paid` },
    { kind: "toggle", name: "email_on_file", label: "Client email on file" },
  ],
  scenarios: [
    { id: "friendly", label: "Friendly reminder", kind: "success", description: `${MAIN} is 5 days late and has never been chased, so it gets a friendly draft.`, inputs: { days_overdue: 5, last_chased: "Never", paid: false, email_on_file: true } },
    { id: "firm", label: "Firm reminder", kind: "success", description: `${MAIN} is 18 days late and was last chased 10 days ago, so it gets a firm draft.`, inputs: { days_overdue: 18, last_chased: "10 days ago", paid: false, email_on_file: true } },
    { id: "final", label: "Final notice", kind: "success", description: `${MAIN} is 34 days late. One final notice is drafted, then it passes to the owner.`, inputs: { days_overdue: 34, last_chased: "10 days ago", paid: false, email_on_file: true } },
    { id: "recent", label: "Chased recently", kind: "exception", description: `${MAIN} was chased 3 days ago, so it is held back until 7 days have passed.`, inputs: { days_overdue: 9, last_chased: "3 days ago", paid: false, email_on_file: true } },
    { id: "paid", label: "Already paid", kind: "exception", description: `${MAIN} is marked paid in the sheet, so it is skipped.`, inputs: { days_overdue: 12, last_chased: "Never", paid: true, email_on_file: true } },
    { id: "no_email", label: "Missing email", kind: "exception", description: `${MAIN} has no client email, so the owner is asked to add one instead of a draft being written.`, inputs: { days_overdue: 8, last_chased: "Never", paid: false, email_on_file: false } },
  ],

  start(inputs, scenarioId) {
    const sim = Sim.begin<State>("invoice-chaser", scenarioId, inputs, {
      step: "review",
      day: 0,
      runs: 0,
      invoices: [],
      drafts: [],
      lastDraftKeys: [],
      ownerTasks: [],
    });
    const s = sim.s;
    const chased = sim.str("last_chased", "Never");
    const main: Invoice = {
      no: MAIN,
      client: "Alex Taylor",
      business: "Corner Café",
      email: sim.bool("email_on_file") ? "alex@example.com" : "",
      amount: MAIN_AMOUNT,
      overdue: Math.max(-30, Math.min(365, Math.round(sim.num("days_overdue")))),
      paid: sim.bool("paid"),
      lastChased: chased === "3 days ago" ? 3 : chased === "10 days ago" ? 10 : null,
      finalDrafted: false,
    };
    s.invoices = [main, ...FIXED.map((i) => ({ ...i }))];
    sim.say("system", `${BUSINESS} (sample business) keeps its invoices in a Google Sheet. The agent reads it every weekday at 08:00.`);
    return dailyRun(sim).done();
  },

  act(run, actionId) {
    const sim = Sim.from(run);
    const s = sim.s;

    switch (actionId) {
      case "send_all": {
        sim.advance(HOUR);
        for (const d of s.drafts) {
          const inv = s.invoices.find((i) => i.no === d.no)!;
          sim.send({ channel: "email", to: inv.email, summary: `Sent by ${OWNER.split(" ")[0]} from Gmail: ${d.no} (${d.tone.toLowerCase()})`, status: "simulated" });
        }
        const n = s.drafts.length;
        sim.say("staff", `${OWNER.split(" ")[0]}: Checked them, sending now.`);
        sim.emit("c_draftonly", "confirmed", `Owner sent ${n} reminder${n === 1 ? "" : "s"} from Gmail`, "The agent itself sent nothing.");
        s.drafts = [];
        draftsRecord(sim);
        s.step = "done";
        return sim
          .finish("completed", {
            kind: "success",
            summary: `The owner checked and sent ${n} reminder${n === 1 ? "" : "s"}. Each invoice is marked as chased, so none will be drafted again for ${REPEAT_DAYS} days.`,
          })
          .done();
      }

      case "discard_main": {
        sim.say("staff", `${OWNER.split(" ")[0]}: I'll deal with Corner Café myself.`);
        s.drafts = s.drafts.filter((d) => d.no !== MAIN);
        sim.emit("draft", "info", `${MAIN} draft deleted by the owner`);
        draftsRecord(sim);
        return review(sim).done();
      }

      case "mark_paid": {
        const main = s.invoices.find((i) => i.no === MAIN)!;
        main.paid = true;
        sim.advance(2 * HOUR);
        sim.say("customer", "Alex Taylor (Corner Café): Paid this morning, sorry for the delay.");
        sim.say("staff", `${OWNER.split(" ")[0]}: Marked ${MAIN} as paid in the sheet.`);
        sim.emit("b_skip", "info", `${MAIN} marked paid — it will not be chased again`);
        if (s.drafts.some((d) => d.no === MAIN)) {
          s.drafts = s.drafts.filter((d) => d.no !== MAIN);
          sim.emit("draft", "info", `${MAIN} draft deleted because it was paid`);
        }
        sheetRecord(sim);
        draftsRecord(sim);
        return review(sim).done();
      }

      case "retry_draft": {
        sim.emit("draft", "info", "Draft step ran a second time");
        for (const key of s.lastDraftKeys) sim.claim(key, "draft", "draft");
        s.lastDraftKeys = [];
        return review(sim).done();
      }

      case "run_tomorrow":
        advanceDays(sim, 1);
        return dailyRun(sim).done();

      case "run_next_week":
        advanceDays(sim, REPEAT_DAYS);
        return dailyRun(sim).done();

      case "end_review": {
        const n = s.drafts.length;
        s.step = "done";
        return sim
          .finish("completed", {
            kind: n ? "success" : "exception",
            summary: n
              ? `${n} draft${n === 1 ? "" : "s"} stay in Gmail for the owner. Nothing was sent, and no invoice amount was changed.`
              : "No drafts were waiting. Nothing was sent, and no invoice amount was changed.",
          })
          .done();
      }
    }
    return sim.done();
  },
};

/* ------------------------------------------------------------------ */
/* Product                                                             */
/* ------------------------------------------------------------------ */

export const invoiceChaser: Product = {
  id: "invoice-chaser",
  no: 21,
  slug: "invoice-chaser",
  name: "Invoice Chaser",
  outcome: "Chase overdue invoices without writing a single reminder.",
  sectorLabel: "Any business that sends invoices",
  sectors: ["Home services", "Automotive", "Appointments", "Accommodation", "Local orders"],
  outcomes: ["Reminders and follow-ups"],
  definition:
    "Every weekday morning it reads your invoice sheet, finds the unpaid invoices that are overdue and drafts a reminder for each one in a tone that suits the delay. Every reminder waits in your Gmail drafts, so you read it and press send yourself.",
  situation:
    "A bakery supplies a dozen cafés on 14-day terms. Three invoices are late, one by more than a month, and the owner only finds out when she sits down with the books on a Sunday night and has to write each reminder from scratch.",
  endState:
    "Each morning the owner opens Gmail to a short pile of ready reminders, friendly for a few days late, firm after two weeks and a final notice after a month. She checks them, sends the ones she agrees with, and the sheet shows who was chased and when.",
  handles: [
    "Reads the invoice sheet every weekday at 08:00 and finds overdue, unpaid invoices",
    `Matches the tone to the delay: friendly from ${GRACE_DAYS} days, firm from ${FIRM_DAYS}, final notice from ${FINAL_DAYS}`,
    "Saves each reminder as a Gmail draft with the invoice number and amount copied from the sheet",
    `Writes the draft date back to the sheet so no invoice is chased twice within ${REPEAT_DAYS} days`,
    "Flags invoices with no email, and any still unpaid after a final notice, to the owner",
  ],
  boundaries: [
    "Never sends an email: every reminder is a draft until the owner sends it",
    "Never changes an amount, a due date or a payment status",
    `Never chases the same invoice twice within ${REPEAT_DAYS} days`,
    "Drafts one final notice per invoice; anything after that is the owner's decision",
  ],
  delivered: [
    { title: "Gmail draft", body: "A reminder addressed to the client, quoting the invoice number, amount and days overdue, in the tone that matches the delay." },
    { title: "Sheet update", body: "The invoice's last-chased column set to the draft date, so tomorrow's run knows to leave it alone." },
    { title: "Owner flag", body: "A short note when an invoice has no email on file or is still unpaid after a final notice." },
  ],
  deployment: {
    rules: [
      "Grace period and the days that switch the tone to firm and final",
      "Minimum gap between reminders for the same invoice",
      "Wording and sign-off for each tone",
      "Which sheet columns hold the client, email, amount, due date, status and last-chased date",
    ],
    systems: ["Google Sheets (or an accounting export)", "Gmail", "A model to write the reminder"],
  },
  measures: ["Days sales outstanding", "Value of invoices more than 30 days overdue", "Owner time spent chasing each week"],
  reliability: [
    "Emails sent by the agent (target: zero)",
    "Reminders with an amount that differs from the sheet (target: zero)",
    `Invoices chased twice within ${REPEAT_DAYS} days (target: zero)`,
  ],
  harness: {
    systems:
      "Production reads a Google Sheet, writes reminders with a model and saves them as Gmail drafts. The demo uses a fictional bakery's five-row invoice sheet, a simulation clock and an outbox that holds every draft.",
    controls: [
      "Draft only: the workflow has no step that can send an email",
      "Copy the amount and invoice number from the sheet and check them before saving",
      `Skip any invoice chased in the last ${REPEAT_DAYS} days`,
      "Use a draft key per invoice and day so a retried run never creates a second draft",
      "Stop after one final notice and hand the invoice to the owner",
    ],
  },
  ctaLine: "Want this drafting reminders for your own unpaid invoices?",
  graph: {
    nodes: [
      { id: "trigger", kind: "action", row: 0, title: "Weekday 08:00 run", input: "Schedule", rule: "Monday to Friday at 08:00", output: "Run started", failure: "—", system: "Scheduler (demo: simulation clock)" },
      { id: "read", kind: "action", row: 1, title: "Read invoice sheet", input: "Invoice rows", rule: "Client, email, amount, due date, status, last chased", output: "Invoice list", failure: "Missing email → owner flag", system: "Google Sheets (demo: five sample rows)" },
      { id: "find", kind: "action", row: 2, title: "Find overdue unpaid invoices", input: "Invoice list", rule: `Unpaid and at least ${GRACE_DAYS} days past due`, output: "Invoices to chase", failure: "Paid, not due or chased recently → skipped", system: "Workflow logic" },
      { id: "tone", kind: "action", row: 3, title: "Choose tone by delay", input: "Days overdue", rule: `Friendly ${GRACE_DAYS}+, firm ${FIRM_DAYS}+, final notice ${FINAL_DAYS}+`, output: "Tone per invoice", failure: "Final notice already drafted → owner", system: "Workflow logic" },
      { id: "draft", kind: "action", row: 4, title: "Save reminder as Gmail draft", input: "Invoice and tone", rule: "One draft per invoice per day", output: "Gmail draft", failure: "Retry → duplicate ignored", system: "Model + Gmail drafts (demo: held outbox)" },
      { id: "write", kind: "action", row: 5, title: "Write draft date to sheet", input: "Saved draft", rule: "Set last chased to today", output: "Updated row", failure: "—", system: "Google Sheets (demo: sample sheet)" },
      { id: "b_missing", kind: "branch", row: 1.2, title: "Missing email", input: "Row without a client email", rule: "No draft; ask the owner to add one", output: "Owner flag", failure: "—" },
      { id: "b_skip", kind: "branch", row: 2.1, title: "Paid or not yet due", input: "Paid, not due or in grace period", rule: "Skip this run", output: "No action", failure: "—" },
      { id: "b_recent", kind: "branch", row: 3, title: "Chased in the last 7 days", input: "Last chased date", rule: `Hold until ${REPEAT_DAYS} days have passed`, output: "Held invoice", failure: "—" },
      { id: "c_repeat", kind: "check", row: 2, title: "No repeat within 7 days", input: "Last chased date", rule: `Block if chased less than ${REPEAT_DAYS} days ago`, output: "Allow / hold", failure: "Too soon → held" },
      { id: "c_amount", kind: "check", row: 3.2, title: "Amount unchanged", input: "Sheet amount and draft", rule: "Amount and invoice number copied, never edited", output: "Pass / block", failure: "Mismatch → no draft" },
      { id: "c_draftonly", kind: "check", row: 4.4, title: "Draft only, never send", input: "Reminder", rule: "Saved to Gmail drafts; the owner sends", output: "Draft", failure: "No send step exists" },
    ],
    edges: [
      { from: "trigger", to: "read", kind: "flow" },
      { from: "read", to: "find", kind: "flow" },
      { from: "find", to: "tone", kind: "flow" },
      { from: "tone", to: "draft", kind: "flow" },
      { from: "draft", to: "write", kind: "flow" },
      { from: "read", to: "b_missing", kind: "return", label: "no email" },
      { from: "find", to: "b_skip", kind: "return", label: "skip" },
      { from: "find", to: "b_recent", kind: "return", label: "too soon" },
      { from: "b_recent", to: "trigger", kind: "return", label: "next run" },
      { from: "c_repeat", to: "find", kind: "check" },
      { from: "c_amount", to: "tone", kind: "check" },
      { from: "c_draftonly", to: "draft", kind: "check" },
    ],
  },
  demo,
  liveDemo: "invoice-chaser",
};
