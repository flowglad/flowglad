import {
  router,
  publicProcedure,
  customerProtectedProcedure,
} from '../trpc'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import {
  selectCustomers,
  setUserIdForCustomerRecords,
} from '@/db/tableMethods/customerMethods'
import {
  customerBillingTransaction,
  setDefaultPaymentMethodForCustomer,
} from '@/utils/bookkeeping/customerBilling'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import { customerClientSelectSchema } from '@/db/schema/customers'
import {
  richSubscriptionClientSelectSchema,
  subscriptionCancellationParametersSchema,
} from '@/subscriptions/schemas'
import { invoiceWithLineItemsClientSchema } from '@/db/schema/invoiceLineItems'
import { paymentMethodClientSelectSchema } from '@/db/schema/paymentMethods'
import { purchaseClientSelectSchema } from '@/db/schema/purchases'
import { pricingModelWithProductsAndUsageMetersSchema } from '@/db/schema/prices'
import {
  selectSubscriptionById,
  isSubscriptionCurrent,
  safelyUpdateSubscriptionsForCustomerToNewPaymentMethod,
} from '@/db/tableMethods/subscriptionMethods'
import {
  cancelSubscriptionImmediately,
  scheduleSubscriptionCancellation,
} from '@/subscriptions/cancelSubscription'
import { subscriptionClientSelectSchema } from '@/db/schema/subscriptions'
import {
  CheckoutSessionType,
  SubscriptionCancellationArrangement,
} from '@/types'
import { auth } from '@/utils/auth'
import {
  selectUserById,
  selectUsers,
} from '@/db/tableMethods/userMethods'
import core from '@/utils/core'
import { betterAuthUserToApplicationUser } from '@/utils/authHelpers'
import { setCustomerBillingPortalOrganizationId } from '@/utils/customerBillingPortalState'
import { selectBetterAuthUserById } from '@/db/tableMethods/betterAuthSchemaMethods'
import { headers } from 'next/headers'
import { stripe } from '@/utils/stripe'
import {
  selectPaymentMethodById,
  safelyUpdatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'
import { createCheckoutSessionTransaction } from '@/utils/bookkeeping/createCheckoutSession'

// getBilling procedure - copy of getCustomerBilling for customer portal
const getBillingProcedure = customerProtectedProcedure
  .input(z.object({}))
  .output(
    z.object({
      customer: customerClientSelectSchema,
      subscriptions: richSubscriptionClientSelectSchema.array(),
      invoices: invoiceWithLineItemsClientSchema.array(),
      paymentMethods: paymentMethodClientSelectSchema.array(),
      purchases: purchaseClientSelectSchema.array(),
      currentSubscriptions: richSubscriptionClientSelectSchema
        .array()
        .optional()
        .describe(
          'The current subscriptions for the customer. By default, customers can only have one active subscription at a time. This will only return multiple subscriptions if you have enabled multiple subscriptions per customer.'
        ),
      catalog: pricingModelWithProductsAndUsageMetersSchema,
      pricingModel: pricingModelWithProductsAndUsageMetersSchema,
    })
  )
  .query(async ({ ctx }) => {
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
      purchases,
      subscriptions,
    } = await authenticatedTransaction(
      async ({ transaction }) => {
        return customerBillingTransaction(
          {
            externalId: customer.externalId,
            organizationId,
          },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )

    return {
      customer,
      invoices,
      paymentMethods,
      currentSubscriptions: currentSubscriptions.map((item) =>
        richSubscriptionClientSelectSchema.parse(item)
      ),
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
    const { customer } = ctx

    return authenticatedTransaction(
      async ({ transaction }) => {
        // First verify the subscription belongs to the customer
        const subscription = await selectSubscriptionById(
          input.id,
          transaction
        )

        if (subscription.customerId !== customer.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You do not have permission to cancel this subscription',
          })
        }

        if (
          input.cancellation.timing ===
          SubscriptionCancellationArrangement.Immediately
        ) {
          const updatedSubscription =
            await cancelSubscriptionImmediately(
              subscription,
              transaction
            )
          return {
            subscription: {
              ...updatedSubscription,
              current: isSubscriptionCurrent(
                updatedSubscription.status
              ),
            },
          }
        }

        const scheduledSubscription =
          await scheduleSubscriptionCancellation(input, transaction)
        return {
          subscription: {
            ...scheduledSubscription,
            current: isSubscriptionCurrent(
              scheduledSubscription.status
            ),
          },
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
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
      const organization = await adminTransaction(
        async ({ transaction }) => {
          return selectOrganizationById(organizationId, transaction)
        }
      )

      if (!organization) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }

      // Set the organization ID for the billing portal session
      await setCustomerBillingPortalOrganizationId(organizationId)

      // Check if customers exist and handle user creation/linking in single transaction
      await adminTransaction(async ({ transaction }) => {
        // Find customers by email and organizationId
        const customers = await selectCustomers(
          {
            email,
            organizationId,
          },
          transaction
        )

        if (customers.length > 0) {
          // Customer found - proceed with user account handling
          const [user] = await selectUsers({ email }, transaction)

          let userId: string

          if (!user || !user.betterAuthId) {
            // Create new user account for the customer
            const result = await auth.api.createUser({
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

      await auth.api.signInMagicLink({
        body: {
          email, // required
          callbackURL: core.safeUrl(
            `/billing-portal/${organizationId}/magic-link-success`,
            process.env.NEXT_PUBLIC_APP_URL!
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
    .input(z.object({}))
    .output(
      z.object({
        sessionUrl: z.url().describe('The Stripe setup session URL'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { customer, organizationId, livemode } = ctx
      if (!customer) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Customer not found',
        })
      }
      // Get the Stripe customer ID
      if (!customer.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Customer does not have a Stripe customer ID',
        })
      }
      const redirectUrl = core.safeUrl(
        `/billing-portal/${organizationId}/${customer.id}`,
        process.env.NEXT_PUBLIC_APP_URL!
      )
      try {
        return await authenticatedTransaction(
          async ({ transaction }) => {
            // Create a Stripe Checkout session in setup mode for adding a payment method
            const session = await createCheckoutSessionTransaction(
              {
                checkoutSessionInput: {
                  customerExternalId: customer.externalId,
                  successUrl: redirectUrl,
                  cancelUrl: redirectUrl,
                  type: CheckoutSessionType.AddPaymentMethod,
                },
                organizationId: ctx.organizationId!,
                livemode: customer.livemode,
              },
              transaction
            )
            return {
              sessionUrl: session.url,
            }
          }
        )
      } catch (error) {
        console.error('Error creating setup session:', error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create payment method setup session',
        })
      }
    })

// setDefaultPaymentMethod procedure
const setDefaultPaymentMethodProcedure = customerProtectedProcedure
  .input(
    z.object({
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

    return authenticatedTransaction(
      async ({ transaction }) => {
        const { paymentMethod } =
          await setDefaultPaymentMethodForCustomer(
            {
              paymentMethodId,
            },
            transaction
          )

        if (paymentMethod.customerId !== customer.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You do not have permission to update this payment method',
          })
        }

        return {
          success: true,
          paymentMethod,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

// Get all customers for an email at an organization
const getCustomersForUserAndOrganizationProcedure =
  customerProtectedProcedure
    .input(z.object({}))
    .output(
      z.object({
        customers: customerClientSelectSchema.array(),
      })
    )
    .query(
      authenticatedProcedureTransaction(
        async ({ ctx, transaction }) => {
          const customers = await selectCustomers(
            {
              userId: ctx.user.id,
              organizationId: ctx.organizationId,
            },
            transaction
          )
          return { customers }
        }
      )
    )

export const customerBillingPortalRouter = router({
  getBilling: getBillingProcedure,
  cancelSubscription: cancelSubscriptionProcedure,
  requestMagicLink: requestMagicLinkProcedure,
  createAddPaymentMethodSession:
    createAddPaymentMethodSessionProcedure,
  setDefaultPaymentMethod: setDefaultPaymentMethodProcedure,
  getCustomersForUserAndOrganization:
    getCustomersForUserAndOrganizationProcedure,
})
