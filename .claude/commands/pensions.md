---
description: Every pension: this year's minimum, the 10% maximum on a TTR, what has been paid and what is left before 30 June. Record a payment or start a pension.
---

1. Run `npm run smsf -- pensions` (behind or over only: `--behind`; last year: `--fy=2025-26`).
2. Present the table, biggest amount left first. Last year: any line with something left to pay did not meet the minimum, and it goes to the auditor.
3. A payment: `npm run smsf -- pay <pension or member> <amount> [--date]`.
4. A new pension: `npm run smsf -- pension-new <member> --balance=<balance on the start day> --kind=account-based|ttr --date=<start>`. Each 1 July, the new year's balance: `npm run smsf -- pension-year <pension> <balance at 1 July>`.
5. Never work out a pension balance from memory. The balance comes from the finished accounts.
