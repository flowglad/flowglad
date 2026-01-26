import type { Customer } from '@/db/schema/customers'
import type { Membership } from '@/db/schema/memberships'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { Subscription } from '@/db/schema/subscriptions'
import type { User } from '@/db/schema/users'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectMembershipsAndUsersByMembershipWhere } from '@/db/tableMethods/membershipMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'

/**
 * Base notification context containing only organization data.
 */
export interface BaseNotificationContext {
  organization: Organization.Record
}

/**
 * Notification context with customer data.
 */
export interface CustomerNotificationContext
  extends BaseNotificationContext {
  customer: Customer.Record
}

/**
 * Full subscription notification context with subscription, price, and payment method data.
 */
export interface SubscriptionNotificationContext
  extends CustomerNotificationContext {
  subscription: Subscription.Record
  price: Price.Record | null
  paymentMethod: PaymentMethod.Record | null
}

/**
 * Notification context with organization members (users and memberships).
 */
export interface OrganizationMembersNotificationContext
  extends BaseNotificationContext {
  customer: Customer.Record
  usersAndMemberships: Array<{
    user: User.Record
    membership: Membership.Record
  }>
}

/**
 * Notification context with organization members but no customer.
 * Used for organization-only notifications like payouts enabled, onboarding completed.
 */
export interface OrganizationOnlyMembersNotificationContext
  extends BaseNotificationContext {
  usersAndMemberships: Array<{
    user: User.Record
    membership: Membership.Record
  }>
}

// Parameters for different fetch scenarios
interface BaseParams {
  organizationId: string
}

interface CustomerParams extends BaseParams {
  customerId: string
}

interface SubscriptionParams extends CustomerParams {
  subscriptionId: string
  include?: ('price' | 'defaultPaymentMethod')[]
}

interface OrganizationMembersParams extends CustomerParams {
  include: ['usersAndMemberships']
}

// ============================================================================
// Function Overloads for Type Safety
// ============================================================================

/**
 * Builds notification context with subscription data.
 * Returns organization, customer, subscription, price, and payment method.
 * The subscription is always fetched when subscriptionId is provided.
 * The include array controls optional extras: 'price' and 'defaultPaymentMethod'.
 */
export async function buildNotificationContext(
  params: {
    organizationId: string
    customerId: string
    subscriptionId: string
    include?: ('price' | 'defaultPaymentMethod')[]
  },
  transaction: DbTransaction
): Promise<SubscriptionNotificationContext>

/**
 * Builds notification context with organization members (no customer).
 * Returns organization and users/memberships for the organization.
 */
export async function buildNotificationContext(
  params: {
    organizationId: string
    include: ['usersAndMemberships']
  },
  transaction: DbTransaction
): Promise<OrganizationOnlyMembersNotificationContext>

/**
 * Builds notification context with organization members.
 * Returns organization, customer, and users/memberships for the organization.
 */
export async function buildNotificationContext(
  params: {
    organizationId: string
    customerId: string
    include: ['usersAndMemberships']
  },
  transaction: DbTransaction
): Promise<OrganizationMembersNotificationContext>

/**
 * Builds notification context with customer data.
 * Returns organization and customer.
 */
export async function buildNotificationContext(
  params: {
    organizationId: string
    customerId: string
  },
  transaction: DbTransaction
): Promise<CustomerNotificationContext>

/**
 * Builds base notification context.
 * Returns only organization data.
 */
export async function buildNotificationContext(
  params: {
    organizationId: string
  },
  transaction: DbTransaction
): Promise<BaseNotificationContext>

// ============================================================================
// Implementation
// ============================================================================

/**
 * Builds notification context by fetching required data for email notifications.
 *
 * This helper centralizes the common data-fetching pattern used across notification tasks,
 * eliminating duplicated queries and ensuring consistent error handling.
 *
 * @example
 * ```ts
 * // Fetch full subscription context (subscription is always fetched when subscriptionId provided)
 * const ctx = await buildNotificationContext({
 *   organizationId,
 *   customerId,
 *   subscriptionId,
 *   include: ['price', 'defaultPaymentMethod'],
 * }, transaction)
 * // ctx.organization, ctx.customer, ctx.subscription, ctx.price, ctx.paymentMethod
 *
 * // Fetch subscription context without extras
 * const ctx = await buildNotificationContext({
 *   organizationId,
 *   customerId,
 *   subscriptionId,
 * }, transaction)
 * // ctx.organization, ctx.customer, ctx.subscription (price/paymentMethod will be null)
 *
 * // Fetch organization members context
 * const ctx = await buildNotificationContext({
 *   organizationId,
 *   customerId,
 *   include: ['usersAndMemberships'],
 * }, transaction)
 * // ctx.organization, ctx.customer, ctx.usersAndMemberships
 *
 * // Fetch basic customer context
 * const ctx = await buildNotificationContext({
 *   organizationId,
 *   customerId,
 * }, transaction)
 * // ctx.organization, ctx.customer
 * ```
 *
 * @throws Error if required data is not found (organization, customer, subscription)
 */
export async function buildNotificationContext(
  params: {
    organizationId: string
    customerId?: string
    subscriptionId?: string
    include?: (
      | 'price'
      | 'defaultPaymentMethod'
      | 'usersAndMemberships'
    )[]
  },
  transaction: DbTransaction
): Promise<
  | BaseNotificationContext
  | CustomerNotificationContext
  | SubscriptionNotificationContext
  | OrganizationMembersNotificationContext
  | OrganizationOnlyMembersNotificationContext
> {
  // Fetch organization (required for all contexts)
  const organization = await selectOrganizationById(
    params.organizationId,
    transaction
  )
  if (!organization) {
    throw new Error(
      `Organization not found: ${params.organizationId}`
    )
  }

  const include = params.include ?? []

  // Fetch customer if customerId provided
  let customer: Customer.Record | undefined
  if (params.customerId) {
    customer = await selectCustomerById(
      params.customerId,
      transaction
    )
    if (!customer) {
      throw new Error(`Customer not found: ${params.customerId}`)
    }
  }

  // Fetch subscription data when subscriptionId is provided (always required for SubscriptionNotificationContext)
  let subscription: Subscription.Record | undefined
  let price: Price.Record | null = null
  let paymentMethod: PaymentMethod.Record | null = null

  if (params.subscriptionId) {
    subscription = await selectSubscriptionById(
      params.subscriptionId,
      transaction
    )
    if (!subscription) {
      throw new Error(
        `Subscription not found: ${params.subscriptionId}`
      )
    }

    // Fetch price if requested and subscription has priceId
    if (include.includes('price') && subscription.priceId) {
      price = (
        await selectPriceById(subscription.priceId, transaction)
      ).unwrap()
    }
  }

  // Fetch payment method if requested
  if (params.customerId && include.includes('defaultPaymentMethod')) {
    const paymentMethods = await selectPaymentMethods(
      { customerId: params.customerId },
      transaction
    )
    // Return default payment method, or first one if no default
    paymentMethod =
      paymentMethods.find((pm) => pm.default) ??
      paymentMethods[0] ??
      null
  }

  // Fetch users and memberships if requested
  let usersAndMemberships:
    | Array<{ user: User.Record; membership: Membership.Record }>
    | undefined

  if (include.includes('usersAndMemberships')) {
    usersAndMemberships =
      await selectMembershipsAndUsersByMembershipWhere(
        { organizationId: params.organizationId },
        transaction
      )
  }

  // Return appropriate context based on what was requested
  if (subscription && customer) {
    return {
      organization,
      customer,
      subscription,
      price,
      paymentMethod,
    }
  }

  if (usersAndMemberships && customer) {
    return {
      organization,
      customer,
      usersAndMemberships,
    }
  }

  if (usersAndMemberships && !customer) {
    return {
      organization,
      usersAndMemberships,
    }
  }

  if (customer) {
    return {
      organization,
      customer,
    }
  }

  return { organization }
}
