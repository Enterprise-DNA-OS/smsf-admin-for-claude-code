---
description: The auditor's queries: open ones oldest first, who each is waiting on. Log a new one or record the answer.
---

1. Run `npm run smsf -- queries` (all, answered too: `--all`).
2. New query: `npm run smsf -- query <fund> "the question" --waiting=practice|trustee`. The job moves to audit-queries.
3. Answered: `npm run smsf -- answer Q-0003 "what was sent"`. When the last one on a job is answered, the job goes back to the auditor.
4. A reply to draft: `/draft-audit-response`.
