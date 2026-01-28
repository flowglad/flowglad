# Setting Up Global Test State via `beforeEach`

This guide outlines the process for preparing a test suite for implementation in Flowglad's code base.

Your job is to take a suite of stubbed-out tests, whose setup and expectations have been commented out, and then set up the global test state required for each one.

Keep in mind when you do this task that this test suite will actually read and write (and then read again) from the database.

So we have to actually set up the database to prepare it for every test case.

This will require roughly the following steps:
1. Figure out the state that *all* tests will need by reading each of the commented out test cases.
2. Scan the functions in ./seedDatabase.ts to see which ones we can use to set up the database state.
3. Use those functions to setup the database, via a beforeEach(() => {...})  at the top of the file.

The goal should be that you have a test file that: correctly sets up database state for each test case, if the code being tested interacts with the database.


## Notes

1. Always declare the type of the each of the global variables, and alway set them using `let` so that they can be reassigned after each run.
2. Absolutely, never ever ever EVER use mocks or `spyOn` or any silliness like that. We are testing database reads and writes and reads.
3. If you see that there will be some tests where multiple of a resource need to get made, while others only 1, then name the resource accordingly in the global case:
e.g.:
```
let usageMeter1: UsageMeter.Record
// set up usage meter in beforeEach
beforeEach(() => {
  usageMeter = await setupUsageMeter({})
})

it('should do something', () => {
  const usageMeter2 = await setupUsageMeter({...})
})
```

## Examples
```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { core } from '@/utils/core'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupBillingPeriod,
  setupLedgerAccount,
  setupUsageMeter,
  setupLedgerTransaction,
  setupDebitLedgerEntry,
  setupCreditLedgerEntry,
  setupUsageEvent,
  setupUsageCredit,
  setupLedgerEntries,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { UsageMeter } from '@/db/schema/usageMeters'
import { PricingMeter } from '@/db/schema/pricingMeters'
import { Product } from '@/db/schema/products'
import {
  LedgerEntryStatus,
  PaymentMethodType,
  SubscriptionStatus,
  LedgerEntryType,
  LedgerTransactionType,
  UsageCreditType,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import { aggregateBalanceForLedgerAccountFromEntries } from './tableMethods/ledgerEntryMethods'

describe('Ledger Management System', async () => {
  let organization: Organization.Record
  let pricingMeter: PricingMeter.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let billingPeriod: BillingPeriod.Record
  let ledgerAccount: LedgerAccount.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    price = orgData.price
    pricingMeter = orgData.pricingMeter
    product = orgData.product

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${core.nanoid()}@test.com`,
      livemode: true,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingMeterId: pricingMeter.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ),
      currentBillingPeriodEnd: new Date(
        Date.now() + 1 * 24 * 60 * 60 * 1000
      ),
      livemode: true,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      livemode: subscription.livemode,
    })

    ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: subscription.livemode,
    })
  })
  it('....', () => {....})
```

```ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { DbTransaction } from '@/db/types'
import { BillingPeriodTransitionLedgerCommand } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  LedgerEntryType,
  UsageCreditStatus,
  UsageCreditType,
  UsageCreditSourceReferenceType,
  UsageCreditApplicationStatus,
  SubscriptionStatus,
  LedgerTransactionType,
  PriceType,
  IntervalUnit,
  BillingPeriodStatus,
  PaymentMethodType,
} from '@/types'
import {
  LedgerTransaction,
  LedgerTransaction as LedgerTransactionSchema,
} from '@/db/schema/ledgerTransactions'
import {
  LedgerAccount,
  LedgerAccount as LedgerAccountSchema,
} from '@/db/schema/ledgerAccounts'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupSubscription,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupDebitLedgerEntry,
  setupUsageEvent,
  setupUsageMeter,
  setupPrice,
  teardownOrg,
  setupPaymentMethod,
  setupBillingPeriod,
  setupBillingRun,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupProduct,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { PricingMeter } from '@/db/schema/pricingMeters'
import { UsageEvent } from '@/db/schema/usageEvents'
import {
  UsageCredit,
  UsageCredit as UsageCreditSchema,
} from '@/db/schema/usageCredits'
import { UsageCreditApplication } from '@/db/schema/usageCreditApplications'
import { LedgerEntry } from '@/db/schema/ledgerEntries'
import core from '@/utils/core'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingRun } from '@/db/schema/billingRuns'

describe('tabulateOutstandingUsageCosts', () => {
  let organization: Organization.Record
  let product: Product.Record
  let pricingMeter: PricingMeter.Record
  let price: Price.Record
  let usageBasedPrice: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    product = orgData.product
    price = orgData.price
    pricingMeter = orgData.pricingMeter

    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter For Tabulation',
      pricingMeterId: pricingMeter.id,
    })

    usageBasedPrice = await setupPrice({
      productId: product.id,
      name: 'Metered Price For Tabulation',
      type: PriceType.Usage,
      unitPrice: 10,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
      currency: organization.defaultCurrency,
      usageMeterId: usageMeter.id,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
    })
  })
  it('...',()=> {...})
  // rest of file
```

```ts
import { describe, it, expect, beforeEach } from 'bun:test'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupProduct,
  setupPrice,
} from '@/../seedDatabase'
import { PriceType, IntervalUnit, CurrencyCode } from '@/types'
import { nanoid } from '@/utils/core'
import {
  safelyInsertPrice,
  safelyUpdatePrice,
  selectPriceById,
  selectPricesAndProductByProductId,
} from './priceMethods'
import { Price } from '../schema/prices'
import { Organization } from '../schema/organizations'
import { Product } from '../schema/products'

describe('priceMethods.ts', () => {
  let organization: Organization.Record
  let product: Product.Record
  let price: Price.Record

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization

    // Setup product
    product = await setupProduct({
      organizationId: organization.id,
      name: 'Test Product',
      livemode: true,
      pricingMeterId: setup.pricingMeter.id,
    })

    // Setup price
    price = await setupPrice({
      productId: product.id,
      name: 'Test Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      setupFeeAmount: 0,
      trialPeriodDays: 0,
      currency: CurrencyCode.USD,
    })
  })
//... rest of file
```