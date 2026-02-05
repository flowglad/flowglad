'use client'
import type { Flowglad } from '@flowglad/node'
import {
  type CreateActivateSubscriptionCheckoutSessionParams,
  type CreateAddPaymentMethodCheckoutSessionParams,
  type CreateProductCheckoutSessionParams,
  FlowgladActionKey,
} from '@flowglad/shared'
import { useFlowgladConfig } from './FlowgladConfigContext'
import { getFlowgladRoute } from './FlowgladContext'
import { validateUrl } from './utils'

/**
 * Response from checkout session creation actions.
 */
export type CreateCheckoutSessionResponse =
  | {
      id: string
      url: string
    }
  | { error: { code: string; json: Record<string, unknown> } }

/**
 * Result type for the useCheckouts hook.
 * Provides checkout session creation actions without requiring billing data.
 */
export interface UseCheckoutsResult {
  /**
   * Create a checkout session for purchasing a product.
   *
   * @param params - Checkout session parameters including price and URLs
   * @returns Checkout session with id and url, or error object
   */
  createCheckoutSession: (
    params: CreateProductCheckoutSessionParams
  ) => Promise<CreateCheckoutSessionResponse>

  /**
   * Create a checkout session for adding a payment method.
   *
   * @param params - Parameters including successUrl, cancelUrl, and optional target subscription
   * @returns Checkout session with id and url, or error object
   */
  createAddPaymentMethodCheckoutSession: (
    params: Omit<CreateAddPaymentMethodCheckoutSessionParams, 'type'>
  ) => Promise<CreateCheckoutSessionResponse>

  /**
   * Create a checkout session for activating a subscription.
   *
   * @param params - Parameters including target subscription ID
   * @returns Checkout session with id and url, or error object
   */
  createActivateSubscriptionCheckoutSession: (
    params: Omit<
      CreateActivateSubscriptionCheckoutSessionParams,
      'type'
    >
  ) => Promise<CreateCheckoutSessionResponse>
}

/**
 * Hook to create checkout sessions without loading the full billing payload.
 *
 * This is an action-only hook (no data/query) since there's no "list checkout sessions" endpoint.
 * Use this when you only need to create checkout sessions and don't need billing data.
 *
 * Must be used within a `FlowgladProvider`.
 *
 * @returns Object containing checkout session creation actions
 *
 * @example
 * ```tsx
 * function PricingButton({ priceSlug }: { priceSlug: string }) {
 *   const { createCheckoutSession } = useCheckouts()
 *
 *   const handleClick = async () => {
 *     const result = await createCheckoutSession({
 *       priceSlug,
 *       successUrl: window.location.origin + '/success',
 *       cancelUrl: window.location.origin + '/cancel',
 *     })
 *
 *     if ('url' in result) {
 *       window.location.href = result.url
 *     }
 *   }
 *
 *   return <button onClick={handleClick}>Subscribe</button>
 * }
 * ```
 */
export const useCheckouts = (): UseCheckoutsResult => {
  const { baseURL, betterAuthBasePath, requestConfig, __devMode } =
    useFlowgladConfig()

  const createCheckoutSession = async (
    params: CreateProductCheckoutSessionParams
  ): Promise<CreateCheckoutSessionResponse> => {
    if (__devMode) {
      return {
        id: 'mock_checkout_session',
        url: 'https://checkout.stripe.com/mock',
      }
    }

    validateUrl(params.successUrl, 'successUrl')
    validateUrl(params.cancelUrl, 'cancelUrl')
    if (baseURL) {
      validateUrl(baseURL, 'baseURL', true)
    }

    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )

    let response: Response
    try {
      response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.CreateCheckoutSession}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify({
            ...params,
            type: 'product',
          }),
        }
      )
    } catch (error) {
      return {
        error: {
          code: 'NETWORK_ERROR',
          json: {
            message:
              error instanceof Error
                ? error.message
                : 'Network request failed',
            original: String(error),
          },
        },
      }
    }

    let json: {
      data?: Flowglad.CheckoutSessions.CheckoutSessionCreateResponse
      error?: { code: string; json: Record<string, unknown> }
    }
    try {
      json = await response.json()
    } catch (error) {
      return {
        error: {
          code: 'INVALID_JSON',
          json: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to parse response as JSON',
            original: String(error),
          },
        },
      }
    }

    if (json.error) {
      return { error: json.error }
    }

    if (!json.data) {
      return {
        error: {
          code: 'NO_DATA',
          json: {
            message:
              'No data returned from checkout session creation',
          },
        },
      }
    }

    return { id: json.data.checkoutSession.id, url: json.data.url }
  }

  const createAddPaymentMethodCheckoutSession = async (
    params: Omit<CreateAddPaymentMethodCheckoutSessionParams, 'type'>
  ): Promise<CreateCheckoutSessionResponse> => {
    if (__devMode) {
      return {
        id: 'mock_add_pm_session',
        url: 'https://checkout.stripe.com/mock-add-pm',
      }
    }

    validateUrl(params.successUrl, 'successUrl')
    validateUrl(params.cancelUrl, 'cancelUrl')
    if (baseURL) {
      validateUrl(baseURL, 'baseURL', true)
    }

    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )

    let response: Response
    try {
      response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.CreateAddPaymentMethodCheckoutSession}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params),
        }
      )
    } catch (error) {
      return {
        error: {
          code: 'NETWORK_ERROR',
          json: {
            message:
              error instanceof Error
                ? error.message
                : 'Network request failed',
            original: String(error),
          },
        },
      }
    }

    let json: {
      data?: Flowglad.CheckoutSessions.CheckoutSessionCreateResponse
      error?: { code: string; json: Record<string, unknown> }
    }
    try {
      json = await response.json()
    } catch (error) {
      return {
        error: {
          code: 'INVALID_JSON',
          json: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to parse response as JSON',
            original: String(error),
          },
        },
      }
    }

    if (json.error) {
      return { error: json.error }
    }

    if (!json.data) {
      return {
        error: {
          code: 'NO_DATA',
          json: {
            message:
              'No data returned from add payment method checkout session creation',
          },
        },
      }
    }

    return { id: json.data.checkoutSession.id, url: json.data.url }
  }

  const createActivateSubscriptionCheckoutSession = async (
    params: Omit<
      CreateActivateSubscriptionCheckoutSessionParams,
      'type'
    >
  ): Promise<CreateCheckoutSessionResponse> => {
    if (__devMode) {
      return {
        id: 'mock_activate_sub_session',
        url: 'https://checkout.stripe.com/mock-activate',
      }
    }

    validateUrl(params.successUrl, 'successUrl')
    validateUrl(params.cancelUrl, 'cancelUrl')
    if (baseURL) {
      validateUrl(baseURL, 'baseURL', true)
    }

    const flowgladRoute = getFlowgladRoute(
      baseURL,
      betterAuthBasePath
    )

    let response: Response
    try {
      response = await fetch(
        `${flowgladRoute}/${FlowgladActionKey.CreateActivateSubscriptionCheckoutSession}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...requestConfig?.headers,
          },
          body: JSON.stringify(params),
        }
      )
    } catch (error) {
      return {
        error: {
          code: 'NETWORK_ERROR',
          json: {
            message:
              error instanceof Error
                ? error.message
                : 'Network request failed',
            original: String(error),
          },
        },
      }
    }

    let json: {
      data?: Flowglad.CheckoutSessions.CheckoutSessionCreateResponse
      error?: { code: string; json: Record<string, unknown> }
    }
    try {
      json = await response.json()
    } catch (error) {
      return {
        error: {
          code: 'INVALID_JSON',
          json: {
            message:
              error instanceof Error
                ? error.message
                : 'Failed to parse response as JSON',
            original: String(error),
          },
        },
      }
    }

    if (json.error) {
      return { error: json.error }
    }

    if (!json.data) {
      return {
        error: {
          code: 'NO_DATA',
          json: {
            message:
              'No data returned from activate subscription checkout session creation',
          },
        },
      }
    }

    return { id: json.data.checkoutSession.id, url: json.data.url }
  }

  return {
    createCheckoutSession,
    createAddPaymentMethodCheckoutSession,
    createActivateSubscriptionCheckoutSession,
  }
}
