---
description: One member in full: balance, contributions against the caps by year, pensions and recent transactions. Add a member or their year figures.
---

1. Run `npm run smsf -- member <name>`.
2. Present it. If they are over or near a cap, say by how much and that options exist, without advising: the member and their adviser decide.
3. New member: `npm run smsf -- member-new <fund> "Full Name" --dob=YYYY-MM-DD --balance=<1 July balance> --tsb=<total super balance last 30 June>`.
4. Year figures from ATO online services (total super balance, carry-forward available, what is left of a bring-forward, personal transfer balance cap): `npm run smsf -- member-year <name> --tsb= --carry-forward= --ncc-left= --tbc= --transfer-balance=`. Never guess these: ask for the figure.
