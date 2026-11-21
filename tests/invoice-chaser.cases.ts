import assert from "node:assert/strict";
import type { PathCase } from "./harness";

const drafts = (r: any) => r.outbox.filter((o: any) => o.channel === "email" && o.status === "held");
const sentByAgent = (r: any) => r.outbox.filter((o: any) => o.channel === "email" && o.status !== "held" && !o.summary.startsWith("Sent by Priya"));

export const cases: PathCase[] = [
  {
    name: "friendly draft for a 5-day-late invoice; owner sends",
    scenario: "friendly",
    steps: ["send_all"],
    expect: {
      status: "completed",
      outcome: "success",
      events: ["INV-1042: friendly tone", "INV-1042: amount copied unchanged — A$1,240", "Sheet updated: INV-1042 drafted", "INV-1038: firm tone", "Owner sent 2 reminders"],
      noEvents: ["INV-1035 is", "INV-1045 is"],
      check: (r) => {
        assert.equal(drafts(r).length, 2);
        assert.equal(sentByAgent(r).length, 0);
      },
    },
  },
  {
    name: "firm tone at 18 days",
    scenario: "firm",
    steps: [],
    expect: { status: "waiting_staff", events: ["INV-1042: firm tone (18 days late)"], records: { drafts: "2 drafts" } },
  },
  {
    name: "final notice drafted once, then handed to the owner",
    scenario: "final",
    steps: ["run_next_week"],
    expect: {
      status: "waiting_staff",
      events: ["INV-1042: final notice tone", "INV-1042: final notice already drafted — handed to the owner"],
      check: (r) => assert.equal(drafts(r).filter((d: any) => d.summary.includes("INV-1042")).length, 1),
    },
  },
  {
    name: "chased 3 days ago: held, then drafted once 7 days have passed",
    scenario: "recent",
    steps: ["run_tomorrow", "run_next_week"],
    expect: {
      events: ["INV-1042 chased 3 days ago — not chased again", "INV-1042 chased 4 days ago — not chased again", "Draft saved for Alex Taylor"],
      check: (r) => assert.equal(drafts(r).filter((d: any) => d.summary.includes("INV-1042")).length, 1),
    },
  },
  {
    name: "paid invoice is skipped",
    scenario: "paid",
    steps: ["end_review"],
    expect: { status: "completed", events: ["INV-1042 skipped — marked paid"], noEvents: ["Draft saved for Alex Taylor"] },
  },
  {
    name: "missing email: owner flag, no draft",
    scenario: "no_email",
    steps: [],
    expect: {
      events: ["INV-1042 has no email on file — no draft"],
      noEvents: ["Draft saved for Alex Taylor"],
      check: (r) => assert.equal(r.outbox.filter((o: any) => o.channel === "task").length, 1),
    },
  },
  {
    name: "retried draft step never creates a second draft",
    scenario: "friendly",
    steps: ["retry_draft"],
    expect: { events: ["Duplicate draft ignored"], check: (r) => assert.equal(drafts(r).length, 2) },
  },
  {
    name: "running again the next day drafts nothing new",
    scenario: "friendly",
    steps: ["run_tomorrow"],
    expect: { events: ["INV-1042 chased 1 day ago — not chased again"], check: (r) => assert.equal(drafts(r).length, 2) },
  },
  {
    name: "payment arrives: draft removed and invoice never chased again",
    scenario: "friendly",
    steps: ["mark_paid", "run_next_week"],
    expect: { events: ["INV-1042 draft deleted because it was paid", "INV-1042 skipped — marked paid"], check: (r) => assert.equal(drafts(r).filter((d: any) => d.summary.includes("INV-1042")).length, 1) },
  },
];
