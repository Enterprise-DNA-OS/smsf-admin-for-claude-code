---
description: Draft the end-of-year records request to a fund's trustees, or the chaser when the records are late.
---

1. Run `npm run smsf -- job <fund> --json` and `npm run smsf -- fund <fund> --json`.
2. Write `drafts/records-request-<fund>-<year>.md`: the list for this fund from its records: bank statements for every account at 30 June, the 30 June value for every holding without one (property valuations, unlisted assets), contribution and rollover statements, pension payment confirmations, any purchase or sale contracts, and the date the return is due.
3. A chaser says when the request went, what is still missing, and the lodgment date. No blame.
4. When it is sent, move the job: `npm run smsf -- job <fund> --stage=records-requested`. Never send it from here.
