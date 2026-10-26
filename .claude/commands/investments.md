---
description: Every fund's holdings with values, valuation dates, related-party and in-house flags, and each fund's in-house share against the 5% limit. Update a value or add a holding.
---

1. Run `npm run smsf -- investments` (one fund: `--fund=CHEN`; in-house only: `--in-house`; related parties: `--related`).
2. Present the holdings, then the by-fund totals. Call out any fund over 5% in-house and any holding with no 30 June value for an unfinished year.
3. A new value: `npm run smsf -- value <fund> <code> <market value> --date=YYYY-MM-DD --basis="Independent valuation"`.
4. A new holding: `npm run smsf -- invest <fund> <code> --name=".." --class=listed-shares --value=.. [--related] [--in-house] [--from-related]`. Ask whether it was bought from a related party; the answer decides whether section 66 applies.
