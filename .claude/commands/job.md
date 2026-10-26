---
description: One fund's job: show it, move it to the next stage, add hours, set the due date or reassign it.
---

1. Show: `npm run smsf -- job <fund>` (another year: `--fy=2026-27`).
2. Move: `npm run smsf -- job <fund> --stage=records-in|in-progress|review|with-auditor|signed|lodged`. Moving a stage stamps its date (records in, sent to auditor, signed, lodged).
3. Time: `--hours=+1.5` adds, `--hours=12` sets. Due date: `--due=YYYY-MM-DD`. Reassign: `--assign=MK`.
4. Next year's job: `npm run smsf -- job <fund> --fy=<year> --stage=not-started --due=<date from the lodgment program>`.
5. Before moving to `lodged`, run `/compliance` for the fund. Lodging is done in the practice's tax software; this records that it happened.
