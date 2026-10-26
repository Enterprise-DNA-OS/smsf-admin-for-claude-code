# SMSF Admin for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs doing, what is wrong, what is late | `/attention` |
| The Monday review | `/weekly-review` |
| A quick picture of the practice | `/stats`, `/funds` |
| One fund in full, a new fund | `/fund` |
| Members, ages, birthdays that matter | `/members` |
| One member, their caps, their ATO figures | `/member` |
| Who is over or near a cap, a new contribution | `/contributions` |
| Pension minimums, the TTR maximum, a payment, a new pension | `/pensions` |
| Holdings, values, in-house assets, related parties | `/investments` |
| Bank lines to code, a bank statement to enter | `/bank` |
| Income, expenses, purchases, sales, rollovers, tax | `/add` |
| Where every job is | `/jobs` |
| Move a job, add hours, set a due date | `/job` |
| Audit queries, logging one, recording an answer | `/queries` |
| What has to happen before 30 June | `/eofy` |
| Which funds make or lose money | `/profitability` |
| Who has what | `/staff` |
| The trustees reviewed the investment strategy | `/strategy` |
| The caps, a new year's caps | `/caps` |
| Are we compliant | `/compliance` |
| Member statements, pension letters, fund summaries, audit packs | `/documents` |
| A dashboard | `/view`, `/new-view` |
| A pension minimum reminder | `/draft-pension-reminder` |
| A note to a member over or near a cap | `/draft-cap-warning` |
| The records request or the chaser | `/draft-records-request` |
| A reply to the auditor | `/draft-audit-response` |
| Data from Simple Fund 360 | `/import` |
| All the data out | `/export` |
| A note on a fund | `/log` |
| Change a field, a rule, a stage | `/customise` |

If an ask fits nothing here, run the CLI directly (`npm run smsf -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never give financial or tax advice to a member. Report the figures and the rule; the member, their adviser and the trustees decide.
- Never enter a balance, a total super balance, a carry-forward amount or a cap you had to guess. Ask for the figure and where it came from.
- Never tell anyone a fund is compliant because `smsf compliance` is clean. It is a records check; the approved auditor gives the opinion.
- Never code a contribution to a member on a guess. Unknown lines stay uncoded until the trustee says whose they are.
- Never lodge from here. The return is lodged from the practice's tax software; this records the date.

## Where things live

- `scripts/smsf.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis, the compliance rules with sources, and the guide for moving off Simple Fund 360.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/simple-fund-360
