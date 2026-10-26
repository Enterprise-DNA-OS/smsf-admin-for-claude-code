---
description: Code the bank lines nobody has placed yet: to a contribution with its member and type, a pension, income, an expense, a purchase or a sale.
---

1. Run `npm run smsf -- uncoded` (one fund: `--fund=PATE`).
2. For each line, suggest the coding from the narrative and the fund's history (a clearing house credit is usually an employer contribution for the member employed there). Show the suggestions as a table and wait for a yes.
3. On a yes, code each one: `npm run smsf -- code <ref> --kind=contribution --member="Raj Patel" --type=employer-sg` (or `--kind=income --holding=VDHG`, `--kind=pension --pension=P-0001`).
4. Anything you cannot place stays uncoded. Ask the trustee; never guess a member.
