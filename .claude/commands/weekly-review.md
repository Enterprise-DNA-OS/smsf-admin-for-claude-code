---
description: The Monday review for the SMSF team, written from three commands: the job board, pensions and caps, and the five things that matter.
---

Run these three and write the review from what they return. Nothing they do not support goes in.

```
npm run smsf -- jobs
npm run smsf -- pensions --behind
npm run smsf -- attention
```

Then, no more than a page:

1. **The week in one line.** From `npm run smsf -- stats`: jobs lodged of total, queries open, breaches.
2. **The job board.** Count by stage, and every job late or inside 45 days of its due date.
3. **Pensions and caps.** Who is behind on the minimum, who is over or near a cap.
4. **The audit.** Queries open, who each one is waiting on, oldest first.
5. **People.** Hours and open jobs by person (`npm run smsf -- staff`).
6. **Five things to do this week**, from the attention list, with why each made it.
7. **One thing to decide.** The single item that needs a partner, not a process.

`npm run view -- week` and `npm run view -- jobs` render the same numbers as printable pages.
