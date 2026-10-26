---
description: Contributions against the caps for every member: concessional with carry-forward where the balance allows it, non-concessional with the bring-forward tier. Record a new contribution.
---

1. Run `npm run smsf -- contributions` (a fund: `--fund=NGUY`; a year: `--fy=2025-26`; only those near or over: `--over`).
2. Present the table, over-cap members first, with the room each has left.
3. A new contribution: `npm run smsf -- contribute <member> <amount> --type=employer-sg|salary-sacrifice|personal-deductible|personal-non-concessional|spouse|downsizer [--date]`. Say the room left after it, and stop if it takes the member over.
4. If the output says no caps are on file for this year, add them first with `/caps`.
