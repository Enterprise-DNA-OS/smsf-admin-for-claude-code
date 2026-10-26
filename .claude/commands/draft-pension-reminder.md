---
description: Draft the letter to a trustee whose pension minimum is not paid yet: the minimum, what has been paid, what is left and the 30 June date.
---

1. Run `npm run smsf -- pensions --json` and pick the pension (or every pension with something left to pay).
2. Render the formal letter: `npm run docs -- pension-letter`.
3. Write `drafts/pension-reminder-<fund>-<member>.md`: the minimum for the year and how it was worked out (balance at 1 July, the factor for their age), what has been paid, what is left, and that it must be paid by 30 June. State facts, no advice on how to fund it.
4. Never send it. Attach the rendered letter when a person sends it.
