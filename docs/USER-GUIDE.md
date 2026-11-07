# Running the shop

**Official invoice tracking:** Invoices → Official invoice tracking & monthly reconciliation. Choose a month, then Link official invoice beside a saved sale. Record the reference number/date/amount from the existing authorized invoice and a reason. A reference cannot be linked to two different sales. Linked means the entered amount matches the original sale; it is not proof of statutory compliance. Amount differences are flagged for review. Correct invoice link appends a reasoned correction with version protection and preserves prior history. Linking does not repost stock, revenue or payment.

**Unmatched and month export:** Filter by Unmatched or show unmatched sales across all dates. Export complete month CSV always includes all sales from the selected Manila month regardless of the on-screen filter, plus returns posted in that month (including older sales), match status, unmatched totals and cross-period invoice references. It is an accountant reconciliation worksheet, not a tax return or a mechanism to omit unlinked sales. Receipt formatting is unchanged.

**Selected invoice review export:** Invoices → Accountant review — select invoices & export fields. Filter by Manila date or invoice/customer search, select invoice checkboxes, choose optional fields, and export CSV. The file is labeled as a selected subset, includes all-saved/selected sales counts and gross totals, and keeps original sale, linked return, and net amounts. It does not alter records or replace the complete ledger or statutory reports. Saved receipt printing remains available through Preview.

**Product codes:** Leave Product code blank when adding a product and the server assigns a unique code such as P000001. You can still enter your own code. Leaving the code blank while editing preserves the existing code. Existing product codes are not renumbered.

**Quick product restock:** Inventory → Restock beside the existing product. Select supplier and destination, enter additional kg and supplier cost/kg, then Save record. This atomically creates and receives the purchase, increases the existing product's stock, and records the supplier payable. Retries do not duplicate stock. Record payment separately in Purchases. This adds the entered weight; it does not replace the current balance.

1. **Set up:** Settings → edit business identity, address, contact, registration/custom invoice details, heading, footer, document prefix, margins and print density. Confirm accountant wording. Accounting → Record owner funds establishes opening cash/bank against owner capital without treating it as revenue. Products → add product codes, categories, optional brand/cut, prices and low-stock thresholds. Blank prices mean unavailable. Use a service item for grinding charges; confirm its charge unit with the client.
2. **Contacts:** Add suppliers and credit customers under Customers & suppliers. Contact history lists all linked orders, receipts, sales, payments and returns.
3. **Purchases:** Create a supplier order with actual kg and cost per kg. An order has no stock/accounting effect. Receive its lines into storage, with actual delivered weight and box count. Repeat for partial deliveries; over-receiving is rejected. Pay supplier balances separately. Supplier payments settle only received value.
4. **Move stock:** Inventory → Transfer stock. Select different source/destination locations and a reason. Total stock, cost and revenue do not change. Add more locations as needed.
5. **POS:** Search by name/code or select a category. Pick a product, enter up to three decimal places for kg, choose RETAIL / 5 KG UP / BOX and add to the cart. BOX uses actual kg and records box count separately. A bulk line below 5kg needs an owner override reason. Select the selling location. Choose a customer if payment is partial. Enter tendered cash, then Complete sale. Change is tendered less the collected sale amount; excess tender is not extra revenue. A stale cart price is rejected so you can confirm the current price.
6. **Invoices:** Save invoice draft to defer posting. Open the draft in POS to post it once; an already posted draft cannot post again. Payment on an existing invoice changes cash and receivable only, never stock or sales revenue. The invoice table shows outstanding balances.
7. **Receipts:** Preview any saved sale. Switch between the invoice and a clearly labeled internal order slip. Browser print opens the system dialog with an 80mm monochrome layout. Canceling, failing or reprinting leaves the saved sale intact. The app cannot confirm paper output. Direct hardware mode produces an honest unconfigured message.
8. **Returns / reversals:** Invoices → Return / reverse. Select the original line and actual return quantity, enter a reason, and decide whether physical stock returns to the original location. Unpaid invoice balances reduce first; the rest is a cash refund. Return each full line to reverse a whole sale. Cumulative quantities and rounded refund values cannot exceed the original sale. All original and reversal records remain visible.
9. **Counts / losses:** Inventory → Record count. Opening inventory is only allowed before any movement for a product. Physical count sets the selected location to actual kg, with an explicit cost if stock increases. Positive count variances and other additions post to inventory variance; opening inventory posts to opening equity. Spoilage removes kg and records its cost as an expense. Every change requires a reason.
10. **Expenses:** Record category, business date, payee, amount, Cash or Bank account, notes and an optional PDF/PNG/JPEG up to 5MB. Attachments require owner login to download. If an upload fails, the expense remains saved and the app reports the upload failure.
11. **Accounting:** Select daily, weekly, monthly, yearly or custom dates for profit, ledger and cash movement. Trial balance, balance sheet, receivables and payables show current cumulative balances. Export the general ledger for the accountant; Inventory exports all movements and Settings exports all transaction records. Exports do not suppress any sale or reversal.
12. **End of day:** Reconcile cash tender/change against payments, review receivables/payables and stock, check journal balance, then make a secure backup after stopping the server. Keep the archive off the shop computer too.

Only the owner is provisioned in this version. Do not share the owner password with staff who should have restricted access. Stock/cost or accounting changes cannot be deleted through the application; reasons and audit records make changes traceable.


### BOX counts and decimal weights

Weight (kg) accepts up to three decimal places, such as 1.250 kg. The separate
box count is a whole number (0, 1, 2, ...). BOX pricing still uses the actual
kilograms; a fractional box count is rejected before adding the item. Switching
price tiers clears the old box count. Retail and bulk sales do not submit hidden
box values. After updating, reload the app and retry an existing retail cart;
its weights and prices are preserved.
