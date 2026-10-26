---
description: One fund in full: trustee, auditor, strategy review, members and balances, investments, pensions, jobs and notes. Add a new fund.
---

1. Run `npm run smsf -- fund <code or name>`. A partial name works; if more than one fund matches, list them and ask.
2. Present it top to bottom. End with anything on this fund from `npm run smsf -- compliance --json` (filter by fund code).
3. A new fund: `npm run smsf -- fund-new <CODE> "Fund name" --trustee=".." --manager=JT --fee=2500 --auditor=".."`.
