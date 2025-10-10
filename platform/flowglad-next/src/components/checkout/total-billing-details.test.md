### Planning Test Cases for `total-billing-details.tsx`

This plan follows `llm-prompts/new-test-1-outline-test-cases.md` to enumerate scenarios and expected outcomes. It covers both the pure calculation helper (`calculateTotalBillingDetails`) and the `TotalBillingDetails` component rendering behavior.

### Functions/Units Under Test
- **calculateTotalBillingDetails(params)**: Computes `baseAmount`, `subtotalAmount`, `discountAmount`, `taxAmount`, `totalDueAmount` based on either a price flow or an invoice flow, with optional `feeCalculation` overriding pieces.
- **TotalBillingDetails component**: Renders billing lines based on checkout context state, including conditional labels and loading states.

### Shared Test Fixtures/Notes
- Use a simple `currency` such as `USD`.
- Use small integers for amounts where possible to ease assertions.
- When testing component UI, render with a minimal `CheckoutPageContext` provider mock that supplies values consumed by the component.
- For `PriceType.Usage`, the total due today is `0` and some labels are hidden.

## A) calculateTotalBillingDetails

#### A1. Guards: neither price nor invoice provided
- Arrange: `params` with `type` inconsistent or both `price` and `invoice` undefined.
- Expect: throws error 'Either price or invoice is required'.

#### A2. Guards: both price and invoice provided
- Arrange: `params` includes both `price` and `invoice` non-null.
- Expect: throws error 'Only one of price or invoice is permitted. Received both'.

#### A3. Price flow: basic no discount, no feeCalculation
- Arrange: `type: 'price'`, `price` with non-usage type (e.g., recurring), `purchase` optional/undefined.
  - Stub `calculatePriceBaseAmount` to return `1000`.
  - `discount` undefined/null.
- Act: call function.
- Expect:
  - `baseAmount = 1000`
  - `subtotalAmount = 1000`
  - `discountAmount = 0`
  - `taxAmount = null`
  - `totalDueAmount = 1000`

#### A4. Price flow: with discount but no feeCalculation
- Arrange: as A3 but with `discount` such that `calculateDiscountAmount(1000, discount)` returns `200`.
- Expect:
  - `baseAmount = 1000`
  - `subtotalAmount = 1000`
  - `discountAmount = 200`
  - `taxAmount = null`
  - `totalDueAmount = 800`

#### A5. Price flow: PriceType.Usage forces totalDueAmount 0 (no feeCalculation)
- Arrange: `price.type = Usage`, `calculatePriceBaseAmount` returns e.g. `1500`, discount null.
- Expect:
  - `baseAmount = 1500`
  - `subtotalAmount = 1500`
  - `discountAmount = 0`
  - `taxAmount = null`
  - `totalDueAmount = 0` (explicit override for usage)

#### A6. Price flow: with feeCalculation overrides
- Arrange: `feeCalculation` present with fields:
  - `baseAmount = 1200`
  - `discountAmountFixed = 300`
  - `taxAmountFixed = 90`
  - Stub `calculateTotalDueAmount(feeCalculation)` to return `990`.
  - Underlying `calculatePriceBaseAmount` can be any value; should be ignored for subtotal/total when feeCalculation is present.
- Expect:
  - `baseAmount` equals the computed base from price flow (e.g., `calculatePriceBaseAmount` return value). Note: the function returns original `baseAmount` but uses feeCalculation for the rest.
  - `subtotalAmount = feeCalculation.baseAmount = 1200`
  - `discountAmount = 300`
  - `taxAmount = 90`
  - `totalDueAmount = 990`

#### A7. Invoice flow: basic no discount, no feeCalculation
- Arrange: `type: 'invoice'`, `invoice` provided, `invoiceLineItems` provided; stub `calculateInvoiceBaseAmount` to `2000`, no discount.
- Expect:
  - `baseAmount = 2000`
  - `subtotalAmount = 2000`
  - `discountAmount = 0`
  - `taxAmount = null`
  - `totalDueAmount = 2000`

#### A8. Invoice flow: with discount, no feeCalculation
- Arrange: as A7 but with `discount` such that discount becomes `250`.
- Expect: `totalDueAmount = 1750` and other fields updated accordingly.

#### A9. Invoice flow: with feeCalculation overrides
- Arrange: `feeCalculation` present as in A6; `calculateTotalDueAmount` returns e.g. `950`.
- Expect: same override semantics as in price flow: base from invoice calculation, subtotal/discount/tax/total from `feeCalculation`.

## B) TotalBillingDetails Component Rendering

General approach: render `TotalBillingDetails` with a mocked context using `useCheckoutPageContext`. Consider mocking the underlying calculation helper to control amounts, or provide `feeCalculation`/data such that amounts are deterministic. Also test loading skeletons and conditional visibility.

#### B1. Add Payment Method flow hides component entirely
- Arrange: `flowType = AddPaymentMethod`.
- Act: render component.
- Expect: returns `null` (nothing rendered).

#### B2. Price flow, no discount, no tax, no trial, non-usage
- Arrange context:
  - `flowType = Subscription` or `OneTime` equivalent for non-invoice
  - `price` non-usage, `currency = USD`
  - Calculation produces: `baseAmount = 1000`, `discountAmount = null`, `taxAmount = null`, `totalDueAmount = 1000`
  - `editCheckoutSessionLoading = false`
- Expect:
  - Subtotal row visible with `$10.00`
  - No Discount row
  - No Tax row
  - Total label shows `Total Due Today` for subscription (or `Total` otherwise)
  - Total amount `$10.00`

#### B3. Price flow with discount visible
- Arrange: as B2 but with `discount` present such that discount is `200` and total is `800`.
- Expect:
  - Discount row visible with `$2.00`
  - Total shows `$8.00`

#### B4. Price flow with feeCalculation showing tax and overridden subtotal
- Arrange: provide `feeCalculation` so that:
  - `baseAmount(any)`, `subtotalAmount(feeCalculation.baseAmount) = 1200`
  - `discountAmount = 300`, `taxAmount = 90`, `totalDueAmount = 990`
- Expect:
  - Subtotal shown as `$12.00`
  - Discount shown as `$3.00`
  - Tax row visible with `$0.90`
  - Total shows `$9.90`

#### B5. Subscription with trial: shows "Total After Trial" and Total Due Today = $0.00
- Arrange:
  - `flowType = Subscription`
  - `subscriptionDetails.trialPeriodDays` set (e.g., 14)
  - `subscriptionDetails.pricePerBillingCycle = 1500`
  - `discountAmount` from calculation is `200`
  - `totalDueAmount` from calculation would be `1300`
- Expect:
  - A line labeled `Total After Trial` rendered with `$13.00` (i.e., `1500 - 200` bounded at >= 0)
  - Final total label `Total Due Today` amount displays `$0.00` (due to trial)

#### B6. Subscription with trial where discount exceeds price per billing cycle (clamped)
- Arrange: as B5 but `pricePerBillingCycle = 100`, `discountAmount = 200`.
- Expect:
  - `Total After Trial` shows `$0.00` (clamped at 0 via `Math.max(0, priceAfterTrial)`)
  - `Total Due Today` still `$0.00`

#### B7. Usage-based price in subscription hides total labels (hideTotalLabels)
- Arrange:
  - `flowType = Subscription`
  - `price.type = Usage`
  - Calculation may produce any base; ensure function returns `totalDueAmount = 0` as per usage rule
- Expect:
  - No Subtotal row
  - No Discount row (even if discount exists, rows should be hidden by the `hideTotalLabels` gate)
  - No Total/Total Due Today block

#### B8. Invoice flow basic rendering
- Arrange:
  - `flowType = Invoice`
  - Provide `invoice` and `invoiceLineItems` such that calculation returns `baseAmount = 2500`, `discountAmount = null`, `taxAmount = null`, `totalDueAmount = 2500`
  - `editCheckoutSessionLoading = false`
- Expect:
  - Subtotal row `$25.00`
  - No Discount row
  - No Tax row
  - Total label `Total` (not `Due Today`)
  - Total amount `$25.00`

#### B9. Invoice flow with discount & tax via feeCalculation
- Arrange:
  - `flowType = Invoice`
  - `feeCalculation` provides `baseAmount=3000`, `discountAmountFixed=500`, `taxAmountFixed=100`, `totalDueAmount=2600`
- Expect:
  - Subtotal `$30.00`
  - Discount `$5.00`
  - Tax `$1.00`
  - Total `$26.00`

#### B10. Loading state shows skeletons
- Arrange:
  - Any flow where totals are shown and `editCheckoutSessionLoading = true`
  - Calculation values can be anything; skeleton should take precedence visually
- Expect:
  - Subtotal/Total areas render `Skeleton` components (e.g., h-5 w-16 for line items, h-6 w-24 for total)
  - Amount text nodes are not visible while loading

#### B11. Currency formatting applied
- Arrange: pick a non-USD currency (e.g., `EUR`), set amounts deterministically.
- Expect: rendered amounts are formatted via `stripeCurrencyAmountToHumanReadableCurrencyAmount(currency, amount)`; verify typical formatting for the chosen currency (symbol/position varies by helper implementation, but the transformer is invoked).

#### B12. Data-testid presence on total label and amount
- Arrange: normal non-loading state where totals are rendered.
- Expect:
  - `data-testid="billing-info-total-due-label"` present on the label span
  - `data-testid="billing-info-total-due-amount"` present on the total amount span

#### B13. Discount row only when discount exists
- Arrange 1: discount null -> no Discount row
- Arrange 2: discount defined (leading to positive or zero `discountAmount`) -> Discount row present with computed amount

#### B14. Tax row only when positive
- Arrange 1: `taxAmount = null` or `0` -> Tax row hidden
- Arrange 2: `taxAmount > 0` -> Tax row visible

#### B15. Price flow: purchase optional
- Arrange: provide `purchase` or leave undefined; ensure `calculatePriceBaseAmount` is called with the same `price` and optional `purchase`. Behavior of totals remains consistent with calculation outputs.

### Notes on Isolation/Mocking Strategy
- For calculation unit tests, mock `calculatePriceBaseAmount`, `calculateInvoiceBaseAmount`, `calculateDiscountAmount`, and `calculateTotalDueAmount` as needed to force deterministic outcomes without coupling to their internal logic.
- For component tests, either:
  - mock the calculator function and focus purely on rendering paths; or
  - supply `feeCalculation` and inputs to produce predictable output without deep mocking.
- Always assert visibility/absence of rows and exact formatted amounts corresponding to the arranged values.


