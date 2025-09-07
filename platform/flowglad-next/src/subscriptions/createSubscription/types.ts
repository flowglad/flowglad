import { Organization } from '@/db/schema/organizations'
import { Customer } from '@/db/schema/customers'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { IntervalUnit } from '@/types'
import { Subscription } from '@/db/schema/subscriptions'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { BillingRun } from '@/db/schema/billingRuns'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'

export interface CreateSubscriptionParams {
  organization: Organization.Record
  customer: Pick<
    Customer.Record,
    'id' | 'stripeCustomerId' | 'livemode' | 'organizationId'
  >
  product: Product.Record
  price: Price.Record
  quantity: number
  livemode: boolean
  startDate: Date
  interval: IntervalUnit
  intervalCount: number
  trialEnd?: Date
  stripeSetupIntentId?: string
  metadata?: Subscription.ClientRecord['metadata']
  name?: string
  defaultPaymentMethod?: PaymentMethod.Record
  backupPaymentMethod?: PaymentMethod.Record
  autoStart?: boolean
  discountRedemption?: DiscountRedemption.Record | null
  previousSubscriptionId?: string // ID of canceled free subscription when upgrading
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
