---
description: The caps and thresholds on file by financial year, and the pension minimum factors. Add a new year each July.
---

1. Run `npm run smsf -- caps`.
2. If there is no row for the current year, get the figures from the ATO's key superannuation rates and thresholds page and add them: `npm run smsf -- caps-add 2027-28 --cc=.. --ncc=.. --tbc=.. --source="ATO key super rates, checked <date>"`. Never enter a figure you have not seen on the ATO's page.
