---
description: Check the records against the thirteen rules in docs/compliance.md: contribution caps, age rules, pension minimums and the TTR maximum, transfer balance, in-house assets, related-party acquisitions, the investment strategy, the auditor, unallocated contributions, 30 June values and lodgment dates.
---

1. Run `npm run smsf -- compliance` (add `--json` for every breach, not just the worst).
2. Report as a table: rule, count, the worst example, the source from `docs/compliance.md`. Breached first.
3. For each breach, the step the operator can approve: the letter to draft, the value to get, the job to move, the question for the auditor.
4. If a rule in `docs/compliance.md` looks out of date (a cap, a threshold, a factor), say so and stop. Do not guess at law. The operator confirms the rule, then you update the doc, the check and `/caps` together.

This is a records check. It is not advice, and it does not replace the trustees, the practice's judgement or the approved auditor.
