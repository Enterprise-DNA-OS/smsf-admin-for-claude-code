---
description: Render the paperwork from the records, in the practice's brand: member statements, pension letters, fund summaries for the trustees, and audit packs.
---

1. `npm run docs` renders every document. One kind: `npm run docs -- member-statement`, `-- pension-letter`, `-- fund-summary`, `-- audit-pack`.
2. Files land in `docs-out/<kind>/`. Print to PDF from the browser, or attach as is.
3. Business name, colours and the footer come from `brand.json`. A new document type is a new entry in `documents.json`.
