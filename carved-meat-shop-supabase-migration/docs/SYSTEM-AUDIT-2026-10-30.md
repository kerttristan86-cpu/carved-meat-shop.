# System audit — 30 October 2026

## Verdict

The tested local shop workflows pass after the fixes below. This is an operational application with remaining Android/printer, BIR/accountant, and deployment checks; the audit does not certify those areas or prove every possible input works.

## Actual stock warning investigation

Read the production product settings and balances while the server was paused, without editing business data:

| Product | Total stock | Saved low-stock threshold | Result |
| --- | ---: | ---: | --- |
| Pork Head | 9.000 kg | 10.000 kg | Low stock: total is at or below the saved threshold |
| Beef Tapa | 0.000 kg | 5.000 kg | Out of stock |

The warning calculation was correct, but hiding the threshold and calling zero stock merely “Low stock” made it confusing. Inventory now displays the threshold and a distinct Out of stock status. Change a threshold under Products → Edit; no thresholds were changed during this audit.

## Confirmed failures fixed

1. **Partial-receipt cost rounding.** Three deliveries of 0.500 kg at PHP219.99/kg previously posted PHP330.00 rather than PHP329.99. Receiving now posts cumulative rounded entitlement minus previously received cost. Tests cover separate deliveries, repeated purchase-line indices in one request, and tiny values. Existing financial history is not rewritten.
2. **POS crash from oversized/corrupt cart input.** The add-line regex allowed quantities rejected later by the decimal parser during render. Shared validation now runs before adding a line, and saved cart lines are validated before restoration. Invalid lines do not crash the cart.
3. **Report timezone boundary.** Last 7 days previously used a UTC date derived from a browser-local timestamp, potentially including eight Manila dates shortly after midnight. Period starts now use the Manila calendar date.
4. **Database startup recovery.** A rejected database-initialization promise previously remained cached until restart. Rejection now clears the cached promise, closes partially initialized engines and releases only its own acquired lock. Tests verify retry after a blocked lock and migration failure, plus preservation of a replacement lock. Live/stale locks are still deliberately refused rather than unsafely stolen.

## Verification

- `npm test`: **22/22 passed**, including real PostgreSQL workflow/restore tests and the new regressions.
- Production build: **passed**, including TypeScript checks.
- Full Chrome browser suite: **passed**, using a separate generated database and owner. Includes authorization, registration closure, origin checks, new stock labels and thresholds, product restock, automatic product codes, fractional POS checkout/change, partial balances, returns, expenses, private attachments, safe upload failure, uncertain-response recovery after reload, receipt preview/reprint, print bounds, and tablet portrait/landscape screenshots.
- Restarted the actual local app as a hidden background process; authentication endpoint returned HTTP 200.

The review covered transaction engine/money calculations, stock and valuation ledgers, payments/returns, reporting, UI/cart request recovery, auth/API access, attachment access, migrations, database ownership and backup/restore. Candidate findings were checked against existing guards and reproduced before being accepted. No confirmed authentication bypass or duplicate posting was found in the reviewed/tested retry paths; that is a coverage statement, not a security certification.

## Not verified or not implemented

- End-to-end printing from the client's actual Android tablet to the VOZY; current browser fallback remains device-dependent and Android integration is unfinished.
- Statutory invoice approval, BIR registration/permits, tax calculations, financial period closing and accountant acceptance of the proposed bookkeeping scope.
- Multi-server PostgreSQL deployment, concurrent load at production scale, offline financial synchronization, production-network HTTPS and real offsite disaster recovery.
- Browser-local pending requests/carts on other devices cannot be inspected by the server-side audit.

Production quantities, prices, thresholds and financial history were not changed. Regression/browser tests used separate disposable databases.
