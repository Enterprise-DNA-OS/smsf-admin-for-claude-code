# Compliance: the rules this system checks

`/compliance` (or `npm run smsf -- compliance`) checks the records against the rules below and reports every breach with the rule and its source. The rules are written for an Australian self managed super fund under the Superannuation Industry (Supervision) Act 1993 (the SIS Act), the SIS Regulations 1994 and the Income Tax Assessment Act 1997, with the yearly caps from the ATO.

This is a records check. It finds what the records say happened. It is not advice, and it does not replace the trustees, the practice's own judgement or the approved SMSF auditor. Confirm each rule against the current version of its source at [legislation.gov.au](https://www.legislation.gov.au/) and [ato.gov.au](https://www.ato.gov.au/) before you rely on it. When a rule, a cap or a threshold changes, change it here, in the check in `scripts/smsf.mjs` (`complianceRows`) and in `/caps` in the same edit.

| Rule | What a breach looks like in the data | Source |
|---|---|---|
| R1 Concessional contributions inside the cap | A member's employer, salary sacrifice and personal deductible contributions for a year above the concessional cap, plus unused carry-forward amounts only where their total super balance at the prior 30 June was under $500,000 | ITAA 1997 Division 291; the cap from the ATO's key superannuation rates and thresholds |
| R2 Non-concessional contributions inside the cap | A member's personal after-tax and spouse contributions above their limit: nil at or over the general transfer balance cap, otherwise one, two or three years of the cap by the bring-forward tier, or what is left of a bring-forward already triggered | ITAA 1997 Division 292; the bring-forward thresholds from the ATO's key rates |
| R3 Contributions accepted only within the age rules | A contribution other than a mandated employer contribution or a downsizer contribution received more than 28 days after the end of the month the member turned 75 | SIS Regulations 1994, reg 7.04 |
| R4 Pension minimum paid for every finished year | An account-based pension that paid less than its minimum for a year that has ended: the balance at 1 July (or at the start) times the factor for the member's age, pro-rated in the first year, nil if it started on or after 1 June, rounded to the nearest $10 | SIS Regulations 1994, reg 1.06(9A) and Schedule 7 |
| R5 Transition to retirement pension under 10% | A transition to retirement pension that paid more than 10% of its balance at 1 July in a year | SIS Regulations 1994, reg 6.01 (definition of transition to retirement income stream) |
| R6 Transfer balance inside the personal cap | A member's transfer balance account above their personal transfer balance cap | ITAA 1997 Division 294 |
| R7 In-house assets no more than 5% | A fund whose in-house assets are more than 5% of the market value of its assets | SIS Act 1993, Part 8 (sections 82 to 84) |
| R8 No assets bought from related parties outside the exceptions | A holding bought from a related party that is not listed securities, business real property or units in a widely held trust | SIS Act 1993, section 66 |
| R9 Investment strategy reviewed, insurance considered | A fund whose trustees have not reviewed the investment strategy in the last 12 months, or whose review did not consider insurance for the members | SIS Regulations 1994, reg 4.09 |
| R10 Auditor appointed 45 days before the return is due | A job not yet with the auditor when the annual return is due in less than 45 days | SIS Act 1993, section 35C(1) |
| R11 Contributions allocated within 28 days | A contribution with no member, more than 28 days after the end of the month it was received | SIS Regulations 1994, reg 7.08(2) |
| R12 Assets valued at market value at 30 June | A holding in a fund whose accounts for a year are not lodged, with no value at or after 30 June of that year | SIS Regulations 1994, reg 8.02B |
| R13 Annual return lodged by its due date | A job not lodged after the due date recorded for it | The ATO's SMSF annual return lodgment due dates, and the practice's lodgment program |

## The caps

`rules_years` holds one row a year: the concessional cap, the non-concessional cap, the general transfer balance cap, and the carry-forward balance limit. The demo ships three years, from the ATO's key superannuation rates and thresholds pages:

| Year | Concessional | Non-concessional | General transfer balance cap |
|---|---|---|---|
| 2024-25 | $30,000 | $120,000 | $1,900,000 |
| 2025-26 | $30,000 | $120,000 | $2,000,000 |
| 2026-27 | $32,500 | $130,000 | $2,100,000 |

A year with no row uses the latest year on file and says so on every report. Add each new year in July with `/caps`. The bring-forward tiers are worked from the year's caps: under the transfer balance cap less two years of the non-concessional cap, three years; under the cap less one year, two years; under the cap, one year; at or over it, nil. Members 75 or older at 1 July get one year.

## The pension factors

`pension_factors` holds Schedule 7: under 65, 4%; 65 to 74, 5%; 75 to 79, 6%; 80 to 84, 7%; 85 to 89, 9%; 90 to 94, 11%; 95 and over, 14%.

## What the records cannot see

- **Sole purpose, arm's length and lending to members.** Whether a lease, a loan or a deal is on commercial terms is a judgement on documents. The system flags related-party holdings and in-house assets so a person looks at them.
- **The member's other funds.** Caps apply across all of a member's super. The total super balance, carry-forward amounts and the transfer balance account come from ATO online services and are entered each year with `/member`.
- **Lodgment.** The annual return is lodged from the practice's tax software. This records the date it happened.
