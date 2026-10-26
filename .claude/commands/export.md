---
description: Every table out to CSV, for a backup, an auditor, or another system.
---

1. `npm run smsf -- export` writes one CSV per table to `exports/` (another folder: `--out=<dir>`).
2. Say where the files are and the row counts. `exports/` is in `.gitignore`: member data never goes into the repo.
