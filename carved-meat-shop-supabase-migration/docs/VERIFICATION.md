# Verification — 30 October 2026

## Implemented and tested

- `npm test`: **8/8 passing**. Tests use real PostgreSQL engines rather than mocked repositories. They cover the supplied decimal fixtures and total, precision rejection, partial purchase receiving, stock transfer, fractional sales, unavailable prices, bulk threshold, services without stock, duplicate/concurrent checkout, changed retry payload rejection, insufficient location stock and repeated cart-line overselling, partial customer/supplier payments, expenses, linked partial returns, historical prices, moving weighted-average costs, immutable history, balanced journals, expense business dates, owner capital versus stock variance, and tiny split-return rounding.
- Backup verification: gzip PostgreSQL dump restored into a separate engine, with matching document/movement counts and financial reports. The full backup bundle is also restored to a new disk directory with a private expense attachment; bytes match and existing-target overwrite is refused.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**, Next.js 16.4.3 production build. Windows sandbox EPERM errors while recreating generated directories required the final build to run with local filesystem permission outside the sandbox. Next reports an unrelated parent-directory package-lock warning; it selects this application's Git repository and builds successfully.
- `npx tsx scripts/qa.ts`: **passed against the final production build**, using installed Chrome and a separate generated database/owner. Verified owner login, rejected public registration, unauthorized API access, rejected foreign-origin mutation, supplier receipt and transfer, tablet POS fractional sale, payment/change, receipt preview/reprint, expense, return, partial customer/supplier balances, balanced journals, and functional navigation for all modules.
- Browser fault injection: the server commits a sale and its response is deliberately lost. Reload retains the original request and blocks cart edits; retry produces exactly one sale. The same lost-response/reload/recovery scenario is verified for an expense. A deliberately failed attachment upload leaves its expense saved once and its editable financial form closed.
- Private expense upload/download verified with a PDF fixture. Bank-funded expense posting supported.
- Actual UI inspected at **1280×800 landscape** and **768×1024 portrait**. Navigation labels remain accessible when icons collapse. Touch targets are at least 44px. Monochrome 80mm receipt print-media screenshot and browser-generated PDF inspected. Long product names wrap separately from numeric columns; print margins and density are configurable.
- Primary button `#0369A1` / white contrast is approximately **5.9:1**; text `#0F172A` / `#F0F9FF` is approximately **16.7:1**. Accent sky blue is not used as small white-text button fill. Fonts are bundled locally to avoid runtime font-service dependencies.

## Evidence

Generated artifacts are local and ignored by Git:

- `test-results/tablet-landscape.png`
- `test-results/tablet-portrait.png`
- `test-results/tablet-pos-portrait.png`
- `test-results/tablet-receipt.png`
- `test-results/receipt-print.png`
- `test-results/receipt-80mm.pdf`

The browser suite creates random QA credentials, never prints them, never accesses production data, and shuts down its local server. QA databases remain under ignored `data/qa-*`; these are disposable fixtures, not shop records. No production owner or production prices have been seeded.

## Requires client, physical device or accountant validation

- Actual VOZY G80 and tablet OS, connection, protocol, printable width, driver output, margins/density and automatic cutting. Browser print is the fallback; no direct hardware protocol is claimed or implemented.
- Statutory invoice wording, registration/tax fields, chart mapping, opening balances, tax treatment and the proposed full-accounting depth. This application is not BIR-certified and does not calculate taxes or close financial periods.
- Actual service charge basis, live product prices, costs, opening stock, suppliers/customers and locations.
- Private-network HTTPS and production host setup, offsite backup retention and a restore rehearsal on the actual client computer. Use a local unsynchronized database directory and one server process.
- Offline checkout is not implemented. Browser cart storage and pending request recovery do not constitute an offline synchronization system.

No public deployment or physical printer test was performed.
