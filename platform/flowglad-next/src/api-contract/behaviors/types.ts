import type { Flowglad } from '@flowglad/node'

// Helper type to extract the resource from SDK responses
type ExtractResource<T> = T extends {
  data: { [key: string]: infer R }
}
  ? R
  : T extends { [key: string]: infer R }
    ? R
    : never

/** Base state passed to first behavior */
export interface SdkHappyPathBaseState {
  client: Flowglad
  runTimestamp: string // e.g., '20260123-143052' - identifies this run
}

/** State after pricing model operations */
export interface PricingModelState extends SdkHappyPathBaseState {
  pricingModel: ExtractResource<
    Awaited<ReturnType<Flowglad['pricingModels']['retrieve']>>
  >
  clonedPricingModel: ExtractResource<
    Awaited<ReturnType<Flowglad['pricingModels']['clone']>>
  >
}

/** State after product operations */
export interface ProductState extends PricingModelState {
  product: ExtractResource<
    Awaited<ReturnType<Flowglad['products']['create']>>
  >
}

/** State after price operations */
export interface PriceState extends ProductState {
  price: Awaited<
    ReturnType<Flowglad['prices']['list']>
  >['data'][number]
}

/** State after discount operations */
export interface DiscountState extends PriceState {
  discount: ExtractResource<
    Awaited<ReturnType<Flowglad['discounts']['retrieve']>>
  >
}

/** State after usage meter operations */
export interface UsageMeterState extends DiscountState {
  usageMeter: ExtractResource<
    Awaited<ReturnType<Flowglad['usageMeters']['retrieve']>>
  >
}

/** State after resource operations */
export interface ResourceState extends UsageMeterState {
  resource: ExtractResource<
    Awaited<ReturnType<Flowglad['resources']['retrieve']>>
  >
}

/** State after customer operations */
export interface CustomerState extends ResourceState {
  customer: ExtractResource<
    Awaited<ReturnType<Flowglad['customers']['retrieve']>>
  >
}

/** State after checkout session operations */
export interface CheckoutSessionState extends CustomerState {
  checkoutSession: ExtractResource<
    Awaited<ReturnType<Flowglad['checkoutSessions']['retrieve']>>
  >
}

/** State after subscription operations */
export interface SubscriptionState extends CheckoutSessionState {
  subscription: ExtractResource<
    Awaited<ReturnType<Flowglad['subscriptions']['retrieve']>>
  >
}

/** State after usage event operations */
export interface UsageEventState extends SubscriptionState {
  usageEvent: ExtractResource<
    Awaited<ReturnType<Flowglad['usageEvents']['retrieve']>>
  >
}

/** Final state after all operations */
export interface FinalState extends UsageEventState {
  // Resource claims don't add new persistent state
}
