<h1 align="center">SMSF Admin for Claude Code</h1>

<p align="center">
  <strong>The open-source SMSF administration system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Simple Fund 360 data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=simple-fund-360">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/simple-fund-360?utm_source=github&utm_medium=readme&utm_campaign=simple-fund-360">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-simple-fund-360">Instead of Simple Fund 360</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

SMSF Admin for Claude Code does the fund administration you pay Simple Fund 360 for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Simple Fund 360 screens cannot.

Simple Fund 360 Professional is $130 ex GST per fund per year, plus $45 ex GST per fund per year for each add-on, with Bank Data and Share Data sold separately ([bglcorp.com/pricing](https://www.bglcorp.com/pricing/), checked 26 October 2026). A practice running 400 funds with both data add-ons pays 400 x $220 = $88,000 a year, and the bill grows with every fund it takes on. This costs nothing, or a setup fee and a retainer if Enterprise DNA runs it for you.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=simple-fund-360).

It is built for an Australian accounting practice or SMSF specialist administering ten to a few hundred funds: funds and trustees, members and their balances year by year, contributions against the concessional and non-concessional caps (carry-forward and bring-forward included), account-based and transition to retirement pensions against the minimum and the 10% maximum, investments with 30 June values and in-house and related-party flags, the bank lines still to code, the year's job on every fund from records request to lodgment, the auditor's queries, and the hours and fees behind each job. The words are the words an SMSF accountant already uses.

**Nothing sends, lodges or talks to another system on its own.** Pension reminders, cap warnings, records requests and audit responses are drafted here and a person sends them; the return is lodged from your tax software. The checks are real, though: a contribution coded without a member is refused, a contribution that takes a member over a cap says so the moment it is entered, and a payment that takes a transition to retirement pension past 10% is flagged on the spot.

```
/attention                 everything that wants a decision, worst first
/pensions                  every pension's minimum (and TTR maximum), what is paid, what is left before 30 June
/contributions             every member against the caps, with carry-forward and bring-forward worked out
/jobs                      the job board: every fund by stage, the lodgment date, open audit queries
/bank                      code the bank lines nobody has placed yet
/compliance                thirteen rules: caps, age rules, pension standards, transfer balance, in-house assets, section 66, the strategy, the auditor, 30 June values, lodgment
/eofy                      the June checklist before 30 June
/weekly-review             the Monday review, written from three commands
```

The caps and minimums read three views, `contribution_room`, `pension_status` and `job_board`. The member card, the June checklist, the compliance check and the audit pack can never disagree about who is over a cap or how much a pension still has to pay.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No per-fund fee, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/smsf-admin-for-claude-code.git
cd smsf-admin-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database and loads Harbourside SMSF Partners (a made-up Sydney practice with eight funds and fourteen members: a member $5,000 over the concessional cap whose $8,000 of carry-forward is locked because her balance is over $500,000, a $20,000 personal contribution accepted from a 77 year old, last year's pension minimum missed by $8,000, a transition to retirement pension paid $4,000 past its 10% maximum, a member $45,000 over their transfer balance cap, a fund with 7.5% in a loan to a related company, a residential unit bought from a member's brother, an investment strategy two years old, a job still waiting on records with the return due in 30 days, a contribution sitting unallocated for months, a property with no 30 June value, a return 10 days late, a new pension with nothing paid yet this year, and bank lines nobody has coded), then prints the practice, the pensions and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/fund CHEN`, `/pensions`, `/contributions`, `/jobs`, `/eofy`. When you are ready for real data, delete `.data/` and start with `/import`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md), and put your practice name, logo and colours in [brand.json](brand.json) so the statements and letters carry them.

## Your first hour: ten things to ask for

1. "What needs attention today?"
2. "Which pensions are behind on the minimum, and how much does each member still have to draw?"
3. "Is anyone over a contribution cap this year? Count carry-forward only where it can be used."
4. "Here is the bank statement for the Patel fund. Code the lines and tell me what you could not place."
5. "Show me the Chen fund in full."
6. "The auditor asked for the loan agreement on CHEN. Log it and draft the reply."
7. "Move the Patel job to records in and add an hour and a half."
8. "Which jobs will miss the lodgment date if nothing changes this week?"
9. "Bring in this Simple Fund 360 member list and investment summary for the Kelleher fund."
10. "Draft the pension reminder letters for everyone with something left to pay."

## Ten questions answered from your own records

Every one is a real command or query on the demo data today.

1. Which pensions are behind on this year's minimum, and how much has each member still to draw before 30 June? (`pensions --behind`)
2. Which members are over or within $5,000 of the concessional cap, counting carry-forward only where their balance allows it? (`contributions --over`)
3. How much non-concessional room does each member have, with their bring-forward tier worked out from their total super balance? (`contributions`)
4. Which pensions missed last year's minimum, and by how much? (`compliance`, rule R4)
5. Which funds hold more than 5% in in-house assets, and in what? (`investments --in-house`)
6. Which returns are late, and which jobs are not with the auditor inside 45 days of the due date? (`jobs`, `compliance` R10 and R13)
7. Which audit queries have sat open longest, and who is each one waiting on? (`queries`)
8. Which funds does the practice lose money on, fee against hours? (`profitability`)
9. Which members turn 75 this year, and when does their window for voluntary contributions close? (`members`)
10. Which contributions have been sitting unallocated past the 28-day limit? (`compliance` R11)

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-fund fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first: breaches, pensions behind, caps, jobs, queries, bank lines. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/stats` | The practice in six lines. |
| `/funds` | Every fund: manager, members, pensions, assets, in-house share, last year's job. |
| `/fund` | One fund in full: trustee, auditor, members, investments, pensions, jobs, notes. Add a fund. |
| `/members` | Every member: age, balance, transfer balance, the birthday that changes things this year. |
| `/member` | One member in full, with contributions against the caps by year. Add a member or their ATO figures. |
| `/contributions` | Every member against the caps, with carry-forward and bring-forward. Record a contribution. |
| `/pensions` | Every pension's minimum and TTR maximum against what is paid. Record a payment, start a pension. |
| `/investments` | Holdings, values, valuation dates, related-party and in-house flags, the 5% test. |
| `/bank` | Code the bank lines nobody has placed yet. |
| `/add` | Income, expenses, purchases, sales, rollovers and tax. |
| `/jobs` | The job board for last year's accounts and audit. |
| `/job` | One fund's job: move its stage, add hours, set the due date, reassign it. |
| `/queries` | The auditor's queries, oldest first. Log one, record the answer. |
| `/eofy` | The June checklist: pensions to pay, caps, carry-forward room, notices of intent, strategy reviews. |
| `/profitability` | Fee against hours on every fund, worst first. |
| `/staff` | Who has which funds, open jobs and hours. |
| `/strategy` | Record the trustees' investment strategy review. |
| `/caps` | The caps and thresholds by year, and the pension factors. Add a new year. |
| `/compliance` | Thirteen rules checked against the records, each with its source. |
| `/documents` | Member statements, pension letters, fund summaries and audit packs in your brand. |
| `/view` | This week, pensions and the job board as printable pages. |
| `/new-view` | Add a dashboard in plain language. |
| `/draft-pension-reminder` | Draft the letter to a trustee whose minimum is not paid yet. |
| `/draft-cap-warning` | Draft the note to a member over or near a cap. |
| `/draft-records-request` | Draft the end-of-year records request, or the chaser. |
| `/draft-audit-response` | Draft the reply to an auditor's query from the records. |
| `/import` | Bring members, investments and transactions across from Simple Fund 360 exports. |
| `/export` | Every table to CSV. |
| `/log` | A dated note on a fund. |
| `/customise` | Change a field, a rule or a stage in plain language. |

Every command is a short recipe over one CLI: `npm run smsf -- help` lists it all.

## Instead of Simple Fund 360

Set up your funds by asking for them, export the member list, the investment summary and the transaction listing from Simple Fund 360 as CSV, then:

```
npm run smsf -- import bgl members members.csv --fund=KELL --dry-run
npm run smsf -- import bgl members members.csv --fund=KELL
npm run smsf -- import bgl investments investments.csv --fund=KELL
npm run smsf -- import bgl transactions transactions.csv --fund=KELL
```

Put the balances and totals next to the same Simple Fund 360 reports before you switch. The full guide, what maps and what does not: [docs/replace-simple-fund-360.md](docs/replace-simple-fund-360.md). The rules the compliance check uses, with sources: [docs/compliance.md](docs/compliance.md).

## Architecture

```
smsf-admin-for-claude-code/
  CLAUDE.md                 how the practice wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/smsf.mjs          the one CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis, the compliance rules and the Simple Fund 360 guide
  documents.json, views.json  the paperwork and dashboards, as SQL
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs SMSF Admin for Claude Code for your business, migrates your Simple Fund 360 data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=simple-fund-360)
- Read more: [enterprisedna.co/omni/instead-of/simple-fund-360](https://enterprisedna.co/omni/instead-of/simple-fund-360?utm_source=github&utm_medium=readme&utm_campaign=simple-fund-360)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
