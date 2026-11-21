# Sample invoices (fictional)

Eight invoices from Acme Bakery, a made-up wholesale bakery, to eight made-up cafés and shops. They are the test data for the Invoice Chaser agent (agent 21).

- `invoices.csv` has one row per invoice with the columns the agent reads: `invoice_no, client, business, email, amount, due_date, status, last_chased, last_tone, agent_note`. Import it into a Google Sheet to test the n8n workflow.
- `INV-xxxx.md` is a readable copy of each invoice with its line items.

Every name, business, address and amount is invented, and the email addresses use the reserved `example.com` domain, so nothing can reach a real person.

| Invoice | Business | Amount | Due | What the agent should do on 21 November 2026 |
|---|---|---:|---|---|
| INV-1042 | Corner Café | A$1,240.00 | 16 Nov 2026 | Friendly draft (5 days late) |
| INV-1038 | Harbour Deli | A$860.00 | 5 Nov 2026 | Firm draft (16 days late) |
| INV-1035 | Northside Grocer | A$2,150.00 | 9 Nov 2026 | Skip: paid |
| INV-1045 | Park Kiosk | A$420.00 | 26 Nov 2026 | Skip: not yet due |
| INV-1031 | Bay Bistro | A$1,580.00 | 15 Oct 2026 | Hold: chased 4 days ago |
| INV-1029 | Hilltop Bakehouse | A$975.00 | 12 Oct 2026 | Final notice draft (40 days late) |
| INV-1027 | Station Coffee | A$640.00 | 10 Nov 2026 | Note to owner: no email on file |
| INV-1022 | Seaside Diner | A$1,100.00 | 1 Oct 2026 | Note to owner: unpaid after a final notice |
