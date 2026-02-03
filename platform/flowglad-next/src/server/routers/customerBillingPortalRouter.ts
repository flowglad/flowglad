import {
  checkoutSessionClientSelectSchema,
  customerBillingCreatePricedCheckoutSessionInputSchema,
} from '@db-core/schema/checkoutSessions'
import { customerClientSelectSchema } from '@db-core/schema/customers'
import { invoiceWithLineItemsClientSchema } from '@db-core/schema/invoiceLineItems'
import { paymentMethodClientSelectSchema } from '@db-core/schema/paymentMethods'
import { pricingModelWithProductsAndUsageMetersSchema } from '@db-core/schema/prices'
import { purchaseClientSelectSchema } from '@db-core/schema/purchases'
import { subscriptionClientSelectSchema } from '@db-core/schema/subscriptions'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { headers } from 'next/headers'
import { z } from 'zod'
import {
  adminTransaction,
  adminTransactionWithResult,
} from '@/db/adminTransaction'
import {
  authenticatedTransaction,
  authenticatedTransactionWithResult,
} from '@/db/authenticatedTransaction'
import { selectBetterAuthUserById } from '@/db/tableMethods/betterAuthSchemaMethods'
import {
  selectCustomerById,
  selectCustomers,
  setUserIdForCustomerRecords,
} from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import {
  isSubscriptionCurrent,
  isSubscriptionInTerminalState,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import {
  scheduleSubscriptionCancellation,
  uncancelSubscription,
} from '@/subscriptions/cancelSubscription'
import {
  richSubscriptionClientSelectSchema,
  subscriptionCancellationParametersSchema,
  uncancelSubscriptionSchema,
} from '@/subscriptions/schemas'
import { SubscriptionCancellationArrangement } from '@/types'
import { customerAuth } from '@/utils/auth/customerAuth'
import { merchantAuth } from '@/utils/auth/merchantAuth'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import {
  customerBillingCreateAddPaymentMethodSession,
  customerBillingCreatePricedCheckoutSession,
  customerBillingTransaction,
  setDefaultPaymentMethodForCustomer,
} from '@/utils/bookkeeping/customerBilling'
import core from '@/utils/core'
import {
  getCustomerBillingPortalEmail,
  setCustomerBillingPortalEmail,
  setCustomerBillingPortalOrganizationId,
} from '@/utils/customerBillingPortalState'
import { maskEmail } from '@/utils/email'
import {
  customerProtectedProcedure,
  customerSessionProcedure,
  publicProcedure,
  router,
} from '../trpc'

/**
 * Description for customerId input fields in customer billing portal procedures.
 */
const CUSTOMER_ID_DESCRIPTION =
  'The customer ID for this operation. Must match a customer the authenticated user has access to.'

// Enhanced getBilling procedure with pagination support for invoices
const getBillingProcedure = customerProtectedProcedure
  .input(
    z.object({
      customerId: z.string().describe(CUSTOMER_ID_DESCRIPTION),
      invoicePagination: z
        .object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(10),
        })
        .optional()
        .describe('Pagination parameters for invoices'),
    })
  )
  .output(
    z.object({
      customer: customerClientSelectSchema,
      subscriptions: richSubscriptionClientSelectSchema.array(),
      invoices: invoiceWithLineItemsClientSchema.array(),
      invoicePagination: z
        .object({
          page: z.number(),
          pageSize: z.number(),
          totalCount: z.number(),
          totalPages: z.number(),
        })
        .optional()
        .describe('Pagination metadata for invoices'),
      paymentMethods: paymentMethodClientSelectSchema.array(),
      purchases: purchaseClientSelectSchema.array(),
      currentSubscriptions: richSubscriptionClientSelectSchema
        .array()
        .optional()
        .describe(
          'The current subscriptions for the customer. By default, customers can only have one active subscription at a time. This will only return multiple subscriptions if you have enabled multiple subscriptions per customer.'
        ),
      currentSubscription: richSubscriptionClientSelectSchema
        .optional()
        .describe(
          'The most recently created current subscription for the customer. If createdAt timestamps tie, the most recently updated subscription will be returned. If updatedAt also ties, subscription id is used as the final tiebreaker.'
        ),
      catalog: pricingModelWithProductsAndUsageMetersSchema,
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
    })
  )
  .query(async ({ ctx, input }) => {
    const { customer, organizationId } = ctx

    if (!organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'organizationId is required',
      })
    }

    const {
      pricingModel,
      invoices,
      paymentMethods,
      currentSubscriptions,
      currentSubscription,
      purchases,
      subscriptions,
    } = await authenticatedTransaction(
      async ({ transaction, cacheRecomputationContext }) => {
        return customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId,
          },
          transaction,
          cacheRecomputationContext
        )
      },
      {
        apiKey: ctx.apiKey,
        customerId: customer.id,
      }
    )

    // Apply pagination to invoices if requested
    let paginatedInvoices = invoices
    let invoicePaginationMetadata:
      | {
          page: number
          pageSize: number
          totalCount: number
          totalPages: number
        }
      | undefined

    if (input.invoicePagination) {
      const { page, pageSize } = input.invoicePagination
      const totalCount = invoices.length
      const totalPages = Math.ceil(totalCount / pageSize)
      const startIndex = (page - 1) * pageSize
      const endIndex = startIndex + pageSize

      paginatedInvoices = invoices.slice(startIndex, endIndex)

      invoicePaginationMetadata = {
        page,
        pageSize,
        totalCount,
        totalPages,
      }
    }

    return {
      customer,
      invoices: paginatedInvoices,
      invoicePagination: invoicePaginationMetadata,
      paymentMethods,
      currentSubscriptions: currentSubscriptions.map((item) =>
        richSubscriptionClientSelectSchema.parse(item)
      ),
      currentSubscription: currentSubscription
        ? richSubscriptionClientSelectSchema.parse(
            currentSubscription
          )
        : undefined,
      purchases,
      subscriptions,
      catalog: pricingModel,
      pricingModel,
    }
  })

// cancelSubscription procedure - copy from subscriptionsRouter
const cancelSubscriptionProcedure = customerProtectedProcedure
  .input(
    z.object({
      customerId: z.string().describe(CUSTOMER_ID_DESCRIPTION),
      id: z.string().describe('The subscription ID to cancel'),
      cancellation: subscriptionCancellationParametersSchema,
    })
  )
  .output(
    z.object({
      subscription: subscriptionClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { customer, livemode } = ctx

    // First transaction: Validate cancellation is allowed (customer-scoped RLS)
    await authenticatedTransaction(
      async ({ transaction }) => {
        // Verify the subscription belongs to the customer
        const subscription = (
          await selectSubscriptionById(input.id, transaction)
        ).unwrap()

        if (subscription.customerId !== customer.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You do not have permission to cancel this subscription',
          })
        }

        // Check subscription is not in terminal state
        if (isSubscriptionInTerminalState(subscription.status)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Subscription is already in a terminal state and cannot be cancelled',
          })
        }

        // Check subscription renews (non-renewing subscriptions can't be cancelled)
        if (!subscription.renews) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Non-renewing subscriptions cannot be cancelled',
          })
        }

        if (subscription.cancelScheduledAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Cancellation already scheduled for this subscription',
          })
        }

        // Customers can only cancel at end of billing period
        if (
          input.cancellation.timing ===
          SubscriptionCancellationArrangement.Immediately
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Immediate cancellation is not available through the customer billing portal',
          })
        }
      },
      {
        apiKey: ctx.apiKey,
        customerId: customer.id,
      }
    )

    // Second transaction: Actually perform the cancellation (admin-scoped, bypasses RLS)
    // Note: Validation above ensures only AtEndOfCurrentBillingPeriod reaches here
    return (
      await adminTransactionWithResult(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const ctx = {
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }
          const subscriptionResult =
            await scheduleSubscriptionCancellation(input, ctx)
          const subscription = subscriptionResult.unwrap()
          return Result.ok({
            subscription: {
              ...subscription,
              current: isSubscriptionCurrent(
                subscription.status,
                subscription.cancellationReason
              ),
            },
          })
        },
        {
          livemode,
        }
      )
    ).unwrap()
  })

// uncancelSubscription procedure
const uncancelSubscriptionProcedure = customerProtectedProcedure
  .input(
    z.object({
      customerId: z.string().describe(CUSTOMER_ID_DESCRIPTION),
      id: z.string().describe('The subscription ID to uncancel'),
    })
  )
  .output(
    z.object({
      subscription: subscriptionClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { customer, livemode } = ctx

    // First transaction: Validate uncancel is allowed (customer-scoped RLS)
    await authenticatedTransaction(
      async ({ transaction }) => {
        // Verify the subscription belongs to the customer
        const subscription = (
          await selectSubscriptionById(input.id, transaction)
        ).unwrap()

        if (subscription.customerId !== customer.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You do not have permission to uncancel this subscription',
          })
        }

        // Check subscription is in cancellation_scheduled status
        if (subscription.status !== 'cancellation_scheduled') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'Subscription must be in cancellation_scheduled status to uncancel',
          })
        }

        // Check that cancellation is actually scheduled
        if (!subscription.cancelScheduledAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'No cancellation scheduled for this subscription',
          })
        }
      },
      {
        apiKey: ctx.apiKey,
        customerId: customer.id,
      }
    )

    // Second transaction: Actually perform the uncancel (admin-scoped, bypasses RLS)
    return (
      await adminTransactionWithResult(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          const ctx = {
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }
          const subscription = (
            await selectSubscriptionById(input.id, transaction)
          ).unwrap()
          const uncancelResult = await uncancelSubscription(
            subscription,
            ctx
          )
          const updatedSubscription = uncancelResult.unwrap()
          return Result.ok({
            subscription: {
              ...updatedSubscription,
              current: isSubscriptionCurrent(
                updatedSubscription.status,
                updatedSubscription.cancellationReason
              ),
            },
          })
        },
        {
          livemode,
        }
      )
    ).unwrap()
  })

// requestMagicLink procedure
const requestMagicLinkProcedure = publicProcedure
  .input(
    z.object({
      organizationId: z.string().describe('The organization ID'),
      email: z.email().describe('The customer email address'),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
    })
  )
  .mutation(async ({ input }) => {
    const { organizationId, email } = input

    try {
      // Verify organization exists
      const organizationResult = await adminTransaction(
        async ({ transaction }) => {
          return selectOrganizationById(organizationId, transaction)
        }
      )

      if (Result.isError(organizationResult)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }
      const organization = organizationResult.unwrap()

      // Set the organization ID for the billing portal session
      await setCustomerBillingPortalOrganizationId(organizationId)

      // Check if customers exist and handle user creation/linking in single transaction
      await adminTransaction(async ({ transaction }) => {
        // Find livemode customers by email and organizationId
        // Note: Intentionally includes archived customers - they should still be able
        // to access the billing portal to view historical invoices and billing data
        const customers = await selectCustomers(
          {
            email,
            organizationId,
            livemode: true,
          },
          transaction
        )

        if (customers.length > 0) {
          // Customer found - proceed with user account handling
          const [user] = await selectUsers({ email }, transaction)

          let userId: string

          if (!user || !user.betterAuthId) {
            // Create new user account for the customer
            const result = await merchantAuth.api.createUser({
              body: {
                email,
                password: core.nanoid(),
                name: customers
                  .map((customer) => customer.name)
                  .join(' '),
              },
            })
            const safelyCreatedUser =
              await betterAuthUserToApplicationUser(result.user)
            userId = safelyCreatedUser.id

            // Link customers to the new user
            await setUserIdForCustomerRecords(
              { customerEmail: email, userId },
              transaction
            )
          } else {
            userId = user.id

            // If some customers have no user id, set the user id for the customers
            if (
              customers.some((customer) => customer.userId === null)
            ) {
              await setUserIdForCustomerRecords(
                { customerEmail: email, userId },
                transaction
              )
            }
          }

          // Get better auth user for email verification status
          await selectBetterAuthUserById(
            user.betterAuthId!,
            transaction
          )
        }
        // Always return success (even if no customer found) for security
        return { success: true }
      })

      await customerAuth.api.signInMagicLink({
        body: {
          email, // required
          callbackURL: core.safeUrl(
            `/billing-portal/${organizationId}/magic-link-success`,
            core.NEXT_PUBLIC_APP_URL
          ),
        },
        // This endpoint requires session cookies.
        headers: await headers(),
      })

      return { success: true }
    } catch (error) {
      console.error('requestMagicLinkProcedure error:', error)
      if (!core.IS_PROD) {
        throw error
      }
      // If organization not found, throw error
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
        throw error
      }
      // For any other errors, quietly return success for security
      return { success: true }
    }
  })

// createAddPaymentMethodSession procedure
const createAddPaymentMethodSessionProcedure =
  customerProtectedProcedure
    .input(
      z.object({
        customerId: z.string().describe(CUSTOMER_ID_DESCRIPTION),
      })
    )
    .output(
      z.object({
        sessionUrl: z.url().describe('The Stripe setup session URL'),
      })
    )
    .mutation(async ({ ctx }) => {
      const { customer } = ctx

      // Check if customer exists and throw early
      if (!customer) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'You do not have permission to create a payment method setup session',
        })
      }

      // Customer should never be undefined at this point
      const session =
        await customerBillingCreateAddPaymentMethodSession(customer)
      return {
        sessionUrl: session.url,
      }
    })

// setDefaultPaymentMethod procedure
const setDefaultPaymentMethodProcedure = customerProtectedProcedure
  .input(
    z.object({
      customerId: z.string().describe(CUSTOMER_ID_DESCRIPTION),
      paymentMethodId: z
        .string()
        .describe('The payment method ID to set as default'),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      paymentMethod: paymentMethodClientSelectSchema,
    })
  )
  .mutation(async ({ input, ctx }) => {
    const { customer } = ctx
    const { paymentMethodId } = input

    return (
      await authenticatedTransactionWithResult(
        async ({
          transaction,
          cacheRecomputationContext,
          invalidateCache,
          emitEvent,
          enqueueLedgerCommand,
        }) => {
          // Verify ownership BEFORE making any mutations
          const existingPaymentMethod = (
            await selectPaymentMethodById(
              paymentMethodId,
              transaction
            )
          ).unwrap()
          if (existingPaymentMethod.customerId !== customer.id) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'You do not have permission to update this payment method',
            })
          }

          const effectsCtx = {
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }
          const { paymentMethod } =
            await setDefaultPaymentMethodForCustomer(
              {
                paymentMethodId,
              },
              effectsCtx
            )

          return Result.ok({
            success: true,
            paymentMethod,
          })
        },
        {
          apiKey: ctx.apiKey,
          customerId: customer.id,
        }
      )
    ).unwrap()
  })

/**
 * Get all customers for the authenticated user at the organization.
 *
 * Uses customerSessionProcedure instead of customerProtectedProcedure because
 * this is called before a customer is selected (on the select-customer page).
 * The organizationId is read from the customer session's contextOrganizationId,
 * which was set during OTP/magic-link verification.
 */
const getCustomersForUserAndOrganizationProcedure =
  customerSessionProcedure
    .input(z.object({}))
    .output(
      z.object({
        customers: customerClientSelectSchema.array(),
      })
    )
    .query(async ({ ctx }) => {
      const userId = ctx.user.id
      // organizationId comes from customer session's contextOrganizationId
      // (set during OTP verification, validated by customerSessionProcedure)
      const { organizationId } = ctx

      // Note: Intentionally includes archived customers - they should still be able
      // to access the billing portal to view historical invoices and billing data.
      //
      // Uses adminTransaction because customer billing portal users don't have
      // merchant RLS context (authenticatedTransaction relies on merchant sessions
      // and membership-based JWT claims). Security is enforced at the procedure
      // level by customerSessionProcedure (validates user session + organizationId)
      // and the query filter (userId + organizationId + livemode).
      const customers = await adminTransaction(
        async ({ transaction }) => {
          return selectCustomers(
            {
              userId,
              organizationId,
              livemode: true,
            },
            transaction
          )
        }
      )
      return { customers }
    })

const createCheckoutSessionWithPriceProcedure =
  customerProtectedProcedure
    .input(
      z.object({
        customerId: z.string().describe(CUSTOMER_ID_DESCRIPTION),
        checkoutSession:
          customerBillingCreatePricedCheckoutSessionInputSchema,
      })
    )
    .output(
      z.object({
        checkoutSession: checkoutSessionClientSelectSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const checkoutSessionInput = input.checkoutSession
      return await customerBillingCreatePricedCheckoutSession({
        checkoutSessionInput,
        customer: ctx.customer,
      })
    })

const createAddPaymentMethodCheckoutSessionProcedure =
  customerProtectedProcedure
    .input(
      z.object({
        customerId: z.string().describe(CUSTOMER_ID_DESCRIPTION),
      })
    )
    .output(
      z.object({
        checkoutSession: checkoutSessionClientSelectSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await customerBillingCreateAddPaymentMethodSession(
        ctx.customer
      )
    })

// sendOTPToCustomer procedure
const sendOTPToCustomerProcedure = publicProcedure
  .input(
    z.object({
      customerId: z.string().describe('The customer ID'),
      organizationId: z.string().describe('The organization ID'),
    })
  )
  .output(
    z.object({
      success: z.boolean(),
      email: z
        .string()
        .optional()
        .describe('Masked email for display'),
    })
  )
  .mutation(async ({ input }) => {
    const { customerId, organizationId } = input
    const startTime = Date.now()

    // Helper to ensure minimum response time to prevent timing attacks
    const ensureMinResponseTime = async () => {
      const elapsed = Date.now() - startTime
      const minDelay = 500 // ms
      if (elapsed < minDelay) {
        await new Promise((resolve) =>
          setTimeout(resolve, minDelay - elapsed)
        )
      }
    }

    try {
      // 1. Fetch customer and organization, verify they match in a single transaction
      const { customer, organization } = await adminTransaction(
        async ({ transaction }) => {
          const customerResult = await selectCustomerById(
            customerId,
            transaction
          )

          if (Result.isError(customerResult)) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Customer not found',
            })
          }
          const customer = customerResult.unwrap()

          // Verify customer belongs to organization
          if (customer.organizationId !== organizationId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Customer does not belong to organization',
            })
          }

          if (!customer.email) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Customer email is required',
            })
          }

          // Fetch and verify organization exists
          const organizationResult = await selectOrganizationById(
            organizationId,
            transaction
          )

          if (Result.isError(organizationResult)) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Organization not found',
            })
          }

          return {
            customer,
            organization: organizationResult.unwrap(),
          }
        }
      )

      // 2. Set organization ID for billing portal session
      await setCustomerBillingPortalOrganizationId(organizationId)

      // 3. Create/link user account if needed
      await adminTransaction(async ({ transaction }) => {
        const email = customer.email!

        // Find livemode customers by email and organizationId
        // Note: Intentionally includes archived customers - they should still be able
        // to access the billing portal to view historical invoices and billing data
        const customers = await selectCustomers(
          {
            email,
            organizationId,
            livemode: true,
          },
          transaction
        )

        if (customers.length > 0) {
          // Customer found - proceed with user account handling
          const [user] = await selectUsers({ email }, transaction)

          let userId: string

          if (!user || !user.betterAuthId) {
            // Create new user account for the customer
            const result = await merchantAuth.api.createUser({
              body: {
                email,
                password: core.nanoid(),
                name: customers
                  .map((customer) => customer.name)
                  .join(' '),
              },
            })
            const safelyCreatedUser =
              await betterAuthUserToApplicationUser(result.user)
            userId = safelyCreatedUser.id

            // Link customers to the new user
            await setUserIdForCustomerRecords(
              { customerEmail: email, userId },
              transaction
            )
          } else {
            userId = user.id

            // If some customers have no user id, set the user id for the customers
            if (
              customers.some((customer) => customer.userId === null)
            ) {
              await setUserIdForCustomerRecords(
                { customerEmail: email, userId },
                transaction
              )
            }
          }

          // Get better auth user for email verification status
          if (user?.betterAuthId) {
            await selectBetterAuthUserById(
              user.betterAuthId,
              transaction
            )
          }
        }
        // Always return success (even if no customer found) for security
        return { success: true }
      })

      // 4. Store email in secure cookie for server-side OTP verification
      // This prevents exposing actual email to client
      await setCustomerBillingPortalEmail(customer.email)

      // 5. Send OTP using Better Auth
      await customerAuth.api.sendVerificationOTP({
        body: {
          email: customer.email,
          type: 'sign-in',
        },
        headers: await headers(),
      })

      // 6. Return success with masked email only (actual email stored server-side)
      await ensureMinResponseTime()
      return {
        success: true,
        email: maskEmail(customer.email),
      }
    } catch (error) {
      console.error('sendOTPToCustomerProcedure error:', error)
      if (!core.IS_PROD) {
        throw error
      }
      // Only throw NOT_FOUND for organization to prevent enumeration
      // (aligns with requestMagicLinkProcedure error handling pattern)
      if (
        error instanceof TRPCError &&
        error.code === 'NOT_FOUND' &&
        error.message === 'Organization not found'
      ) {
        await ensureMinResponseTime()
        throw error
      }
      // For any other errors, quietly return success for security
      // Ensure minimum response time to prevent timing attacks
      await ensureMinResponseTime()
      return { success: true }
    }
  })

export const customerBillingPortalRouter = router({
  getBilling: getBillingProcedure,
  cancelSubscription: cancelSubscriptionProcedure,
  uncancelSubscription: uncancelSubscriptionProcedure,
  requestMagicLink: requestMagicLinkProcedure,
  createAddPaymentMethodSession:
    createAddPaymentMethodSessionProcedure,
  setDefaultPaymentMethod: setDefaultPaymentMethodProcedure,
  createCheckoutSessionWithPrice:
    createCheckoutSessionWithPriceProcedure,
  createAddPaymentMethodCheckoutSession:
    createAddPaymentMethodCheckoutSessionProcedure,
  getCustomersForUserAndOrganization:
    getCustomersForUserAndOrganizationProcedure,
  sendOTPToCustomer: sendOTPToCustomerProcedure,
})
