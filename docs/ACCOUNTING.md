# Bookkeeping scope and assumptions

This is operational accrual bookkeeping. The proposed full-accounting scope requires client and accountant review; it is not confirmed statutory accounting and does not calculate VAT, withholding tax, filing totals, payroll, depreciation, foreign currency, fiscal close or bank reconciliation. Expense and stock reversal policies need review before expanding the supported operations. No hidden sales, dual books, tax suppression or deletable posted transactions are provided.

| Account | Treatment |
| --- | --- |
| Cash, Bank | Asset; customer/supplier payments currently use Cash; expenses choose Cash or Bank |
| Accounts receivable | Asset for posted customer invoice totals less collected payments and return credits |
| Inventory | Asset at moving weighted-average actual purchase cost |
| Accounts payable | Liability for received purchases less supplier payments |
| Opening equity, Owner capital | Initial stock value before first movement, and separately recorded owner cash/bank funding |
| Sales revenue | Accrual revenue when a sale posts, reduced by linked returns |
| Cost of goods sold | Cost removed from inventory when the sale posts; reversed at original cost if returned stock is restocked |
| Operating expenses | Cash or bank expenses at the user-entered business date |
| Spoilage | Inventory cost removed for spoilage |
| Inventory variance | Cost of count losses / gains and positive adjustments; gains are credits |

Purchase orders and drafts do not post. Receiving debits Inventory and credits Payable. Checkout debits Receivable and credits Revenue, then debits COGS and credits Inventory. Collection debits Cash and credits Receivable. Supplier payment debits Payable and credits Cash. Transfers have no journal effect. Returns debit Revenue, credit remaining Receivable first, then credit Cash for a refund; physical restocking debits Inventory and credits COGS at original cost. Non-restocked returns leave original COGS in place.

All postings and stock changes occur in one database transaction. Retry keys and request fingerprints prevent repeated posting; immutable history tables reject UPDATE/DELETE. Invoice/document numbers use one generated sequence shared across document types. Gaps are possible after rolled-back transactions; numbers are never reused. Saved sale identity, prefix, invoice details, prices and costs are snapshots. Later price/template edits do not rewrite old sales.

Weights use integer grams; currency uses integer centavos. Decimal.js handles multiplication and proportion with half-up rounding to centavos. Each line rounds once; the sale total is the sum of lines. Inventory moving average is maintained across all locations for each product, as total centavos / total grams. Partial outflows remove a proportional rounded cost; the final outflow removes the remaining value. Partial returns use the difference between cumulative rounded entitlement and prior returns, so split returns cannot manufacture cents.

5 KG UP defaults to a minimum of 5.000kg **per product line**, with a recorded owner reason for exceptions. Different products are not aggregated. BOX is PHP/kg, never an assumed fixed box weight. Box counts describe deliveries/sales but are not a separate box-inventory ledger. Service quantities allow three decimals in configurable units, with no automatic stock deduction. Actual grinding charge basis remains a client decision.

P&L separates revenue, COGS, gross profit, operating costs and net profit. Cash movement is a period's net Cash journal change, not revenue. Bank expenses affect Bank and profit, not Cash. Asset balances can be negative if opening cash/bank funding has not been recorded; record opening cash/bank using Accounting → Record owner funds, which credits Owner capital. General manual journals are not exposed. Resolve opening monetary balances with the accountant before live use; do not infer cash-on-hand from profit. Period reports use Asia/Manila; stock and balance sheets are current cumulative positions. Expense journals use their entered business date; other postings use creation time. There is no closed-period enforcement or backdated purchase/sale posting.

General-ledger CSV contains every entry in the chosen period. Transaction export and stock export include all histories without selective report suppression. Journal sums are checked before insertion and trial balance reconciliation is exposed. Reports require accountant review for chart mapping, opening balances, taxes and statutory presentation.
