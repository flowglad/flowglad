import type { IntervalUnit } from '@db-core/enums'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { DiscountRedemption } from '@/db/schema/discountRedemptions'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'

export interface CreateSubscriptionParams {
  organization: Organization.Record
  customer: Pick<
    Customer.Record,
    'id' | 'stripeCustomerId' | 'livemode' | 'organizationId'
  >
  product: Product.ClientRecord
  price: Price.ClientRecord
  quantity: number
  livemode: boolean
  startDate: Date | number
  interval?: IntervalUnit | null
  intervalCount?: number | null
  trialEnd?: Date | number
  stripeSetupIntentId?: string
  metadata?: Subscription.ClientRecord['metadata']
  name?: string
  defaultPaymentMethod?: PaymentMethod.Record
  backupPaymentMethod?: PaymentMethod.Record
  autoStart?: boolean
  discountRedemption?: DiscountRedemption.Record | null
  billingCycleAnchorDate?: Date | number
  preservedBillingPeriodEnd?: Date | number
  preservedBillingPeriodStart?: Date | number
  prorateFirstPeriod?: boolean
  preserveBillingCycleAnchor?: boolean
  doNotCharge?: boolean
}

export interface StandardCreateSubscriptionResult {
  type: 'standard'
  subscription: Subscription.Record
  subscriptionItems: SubscriptionItem.Record[]
  billingPeriod: BillingPeriod.Record | null
  billingPeriodItems: BillingPeriodItem.Record[] | null
  billingRun: BillingRun.Record | null
}

export interface NonRenewingCreateSubscriptionResult {
  type: 'non_renewing'
  subscription: Subscription.Record
  subscriptionItems: SubscriptionItem.Record[]
  billingPeriod: null
  billingPeriodItems: null
  billingRun: null
}
