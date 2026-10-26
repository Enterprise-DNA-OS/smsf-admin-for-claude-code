---
description: Bring funds across from Simple Fund 360: the member list, the investment summary and the transaction listing, saved as CSV. Dry run first, then import.
---

1. Make sure the fund exists first (`/funds`). A new one: `npm run smsf -- fund-new <CODE> "Fund name"`.
2. Dry run each file: `npm run smsf -- import bgl members <file.csv> --fund=<CODE> --fy=<year> --dry-run`, then `investments`, then `transactions`. Show the counts and anything it could not read.
3. On a yes, run each without `--dry-run`. Running it twice is harmless.
4. Check the totals against the same Simple Fund 360 reports: member balances, total investments by fund, and the transaction count. Then `npm run smsf -- uncoded --fund=<CODE>` for anything the importer could not place.
5. Column names and what maps: `docs/replace-simple-fund-360.md`. If the operator's export has other columns, map them in `scripts/smsf.mjs` (`importCmd`) and add the case to the smoke test.
