---
description: Draft the reply to an auditor's query from the fund's records.
---

1. Run `npm run smsf -- queries` and `npm run smsf -- job <fund> --json` to read the query in full, then `npm run smsf -- fund <fund> --json` for the records it is about.
2. Write `drafts/audit-response-<query>.md`: answer only what was asked, from the records, and list the documents to attach. Anything the records do not show: say what is needed and from whom (usually the trustee).
3. Render the audit pack if it helps: `npm run docs -- audit-pack`.
4. Never send it. When it is sent, record it: `npm run smsf -- answer <Q-number> "what was sent"`.
