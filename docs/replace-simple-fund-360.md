# Moving off Simple Fund 360

A few days for one person per batch of funds, done in this order. Keep Simple Fund 360 running until the member balances, the investment totals and the transaction counts from this system match the same reports from Simple Fund 360 for every fund you have moved.

Most practices move a handful of funds first, run one job each through to lodgment, then move the rest.

## 1. Set up the practice and the funds

These are short lists, quicker to enter by asking Claude Code than to export:

- **Staff.** Initials, name, role and the hourly cost you use for job costing.
- **Funds.** A short code (HARR), the name, the trustee (corporate or individual), the ABN, who manages it, the auditor, your annual fee, and when the trustees last reviewed the investment strategy.
- **This year's caps.** Already there for 2024-25 to 2026-27. Each July, add the new year with `/caps`.

Ask in plain words: "add the Kelleher Super Fund, code KELL, corporate trustee Kelleher Nominees Pty Ltd, Marco manages it, fee $2,400" and Claude Code writes the rows.

## 2. Export from Simple Fund 360

For each fund, run three reports and export each to Excel, then save as CSV:

1. **The member list** with dates of birth and balances at 1 July (a member balance or member statement summary report).
2. **The investment summary** at 30 June: every holding with its code, type, units, cost and market value.
3. **The transaction listing** for the current year (a general ledger or transaction report with the account name on every line).

If a report has no fund column, export one fund at a time and pass `--fund=CODE` on import.

## 3. Import

```
npm run smsf -- import bgl members members.csv --fund=KELL --fy=2026-27 --dry-run
npm run smsf -- import bgl members members.csv --fund=KELL --fy=2026-27
npm run smsf -- import bgl investments investments.csv --fund=KELL
npm run smsf -- import bgl transactions transactions.csv --fund=KELL
```

The dry run writes nothing and reports anything it could not read. Running an import twice is harmless: members match on fund and name, holdings on fund and code, transactions on their reference.

### What maps

Columns are matched by name, ignoring case, with the common variants of each header:

| This system | Headers it accepts |
|---|---|
| Fund | Fund Code, Fund, Fund Name, Entity, Entity Code (or `--fund`) |
| Member | Member Name, Member, Name, Full Name; Date of Birth, DOB, Birth Date |
| Member balance at 1 July | Opening Balance, Balance, Member Balance, Closing Balance, Total Balance |
| Total super balance | Total Super Balance, TSB |
| Holding | Investment Code, Code, Security Code, ASX Code, Account Code; Investment Name, Description, Security Name |
| Asset class | Investment Type, Asset Class, Type, Category (cash, term deposit, listed, managed fund, property, loan, crypto, collectible) |
| Value | Market Value, Value, Current Value, Closing Market Value; Price Date, Valuation Date, As At |
| Transaction | Date, Transaction Date; Amount, Net Amount; Account, Account Name, Ledger Account; Description, Narration; Member; Reference, Transaction ID |

Transactions are placed by their ledger account name: contributions (employer, salary sacrifice, personal, non-concessional, spouse, downsizer), pensions, lump sums, rollovers, dividends, distributions, interest and rent as income, fees and levies as expenses, income tax. Anything the importer cannot place is left as a bank line to code with `/bank`.

Example files in the shape the importer reads: `examples/sf360-members.csv`, `examples/sf360-investments.csv`, `examples/sf360-transactions.csv`.

## 4. Fill in what the exports do not carry

- **Pensions.** Each pension, its kind, the day it started and its balance at 1 July: "start an account-based pension for Andrew Kelleher, $580,000 at 1 July 2026, started 1 July 2021".
- **The member's ATO figures.** Total super balance, unused concessional cap amounts, an open bring-forward, the personal transfer balance cap and the transfer balance account, from ATO online services: `/member`.
- **Flags on holdings.** Related party, in-house, and anything bought from a related party: `/investments`.
- **Last year's job.** The stage, the due date from your lodgment program, the hours so far: `/job`.

## What does not come across

- **Historic years of accounts.** This starts at the year you move. Keep the Simple Fund 360 reports for earlier years as PDFs with the fund's records.
- **Bank and share data feeds.** Bring statements in as CSV each month with the transaction import, or have Enterprise DNA connect a feed for you.
- **Tax return lodgment and financial statement templates.** Lodge from your existing tax software. The documents here (member statements, pension letters, fund summaries, audit packs) cover the trustee and audit side.
- **Tax calculations.** Exempt current pension income, the actuarial certificate and the tax return itself are worked in your existing tools; this holds the records they need and checks the rules around them.

## Check before you switch

For every fund moved, put these next to the same Simple Fund 360 reports:

```
npm run smsf -- fund KELL
npm run smsf -- investments --fund=KELL
npm run smsf -- contributions --fund=KELL
npm run smsf -- uncoded --fund=KELL
```

Member balances at 1 July, total investments and the contributions for the year should match. Then run `/compliance`.
