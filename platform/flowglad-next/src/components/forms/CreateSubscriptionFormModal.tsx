'use client'

import { useEffect, useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { trpc } from '@/app/_trpc/client'
import FormModal, {
  type ModalInterfaceProps,
} from '@/components/forms/FormModal'
import { InfoCard } from '@/components/InfoCard'
import { CardPaymentMethodLabel } from '@/components/PaymentMethodLabel'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { PricingModelWithProductsAndUsageMeters } from '@/db/schema/prices'
import { encodeCursor } from '@/db/tableUtils'
import { PaymentMethodType, PriceType } from '@/types'
import { filterAvailableSubscriptionProducts } from '@/utils/productHelpers'
import { formatBillingPeriod, getCurrencyParts } from '@/utils/stripe'

const createSubscriptionFormSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  defaultPaymentMethodId: z.string().optional(),
  doNotCharge: z.boolean().default(false),
})

type CreateSubscriptionFormData = z.infer<
  typeof createSubscriptionFormSchema
>

interface CreateSubscriptionFormModalProps
  extends ModalInterfaceProps {
  customerId: string
  onSuccess?: () => void
}

const ProductSelector = ({
  products,
}: {
  products: Array<{
    id: string
    name: string
    default: boolean
    prices: Array<{ id: string; active: boolean; type: PriceType }>
    defaultPrice: { id: string; active: boolean; type: PriceType }
  }>
}) => {
  const form = useFormContext<CreateSubscriptionFormData>()

  return (
    <FormField
      control={form.control}
      name="productId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Product</FormLabel>
          <FormControl>
            <Select
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.length === 0 ? (
                  <SelectItem value="__no_products__" disabled>
                    No products available
                  </SelectItem>
                ) : (
                  products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

const PaymentMethodLabel = ({
  pm,
}: {
  pm: PaymentMethod.ClientRecord
}) => {
  const brand =
    typeof pm.paymentMethodData.brand === 'string'
      ? pm.paymentMethodData.brand
      : undefined
  const last4 =
    typeof pm.paymentMethodData.last4 === 'string'
      ? pm.paymentMethodData.last4
      : undefined

  if (pm.type === PaymentMethodType.Card && brand && last4) {
    return (
      <CardPaymentMethodLabel
        brand={brand}
        last4={last4}
        isDefault={pm.default}
      />
    )
  }

  if (pm.type === PaymentMethodType.USBankAccount) {
    return (
      <div className="flex items-center gap-2">
        <span>Bank Account</span>
        <span className="text-muted-foreground">
          •••• {last4 || ''}
        </span>
        {pm.default && (
          <span className="text-xs text-muted-foreground">
            (Default)
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span>{pm.type}</span>
      {pm.default && (
        <span className="text-xs text-muted-foreground">
          (Default)
        </span>
      )}
    </div>
  )
}

const CustomerNameDisplay = ({
  customerName,
  className,
}: {
  customerName?: string
  className?: string
}) => {
  if (!customerName) {
    return null
  }

  return (
    <p className={`text-sm text-muted-foreground ${className || ''}`}>
      For customer &quot;{customerName}&quot;
    </p>
  )
}

const PaymentMethodSelector = ({
  paymentMethods,
}: {
  paymentMethods: PaymentMethod.ClientRecord[]
}) => {
  const form = useFormContext<CreateSubscriptionFormData>()

  // Set default value when payment methods load
  useEffect(() => {
    const currentValue = form.getValues('defaultPaymentMethodId')
    // Only set if not already set or if it's empty/undefined
    if (!currentValue || currentValue === 'none') {
      if (paymentMethods.length === 0) {
        form.setValue('defaultPaymentMethodId', 'none', {
          shouldValidate: false,
        })
      } else {
        const defaultPM = paymentMethods.find((pm) => pm.default)
        const valueToSet = defaultPM
          ? defaultPM.id
          : paymentMethods[0].id
        form.setValue('defaultPaymentMethodId', valueToSet, {
          shouldValidate: false,
        })
      }
    }
  }, [paymentMethods, form])

  return (
    <FormField
      control={form.control}
      name="defaultPaymentMethodId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Payment Method</FormLabel>
          <FormControl>
            <Select
              value={
                field.value ||
                (paymentMethods.length === 0
                  ? 'none'
                  : paymentMethods[0]?.id || '')
              }
              onValueChange={field.onChange}
              disabled={paymentMethods.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a payment method" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.length === 0 ? (
                  <SelectItem value="none">None</SelectItem>
                ) : (
                  paymentMethods.map((pm) => (
                    <SelectItem key={pm.id} value={pm.id}>
                      <PaymentMethodLabel pm={pm} />
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/**
 * Modal for creating a subscription. Fetches available products (excluding defaults),
 * payment methods, and handles subscription creation via tRPC.
 *
 * @param isOpen - Modal visibility
 * @param setIsOpen - Modal visibility setter
 * @param customerId - Customer ID for subscription
 * @param onSuccess - Optional success callback
 */
export function CreateSubscriptionFormModal({
  isOpen,
  setIsOpen,
  customerId,
  onSuccess,
}: CreateSubscriptionFormModalProps) {
  const utils = trpc.useUtils()

  // Fetch customer to get name for description
  const { data: customerData } =
    trpc.customers.internal__getById.useQuery(
      { id: customerId },
      { enabled: isOpen }
    )

  // Fetch pricing model for customer
  const {
    data: pricingModelData,
    isLoading: isLoadingPricingModel,
    error: pricingModelError,
  } = trpc.customers.getPricingModelForCustomer.useQuery(
    { customerId },
    { enabled: isOpen }
  )

  // Fetch payment methods for customer
  const {
    data: paymentMethodsData,
    isLoading: isLoadingPaymentMethods,
  } = trpc.paymentMethods.list.useQuery(
    {
      cursor: encodeCursor({ parameters: { customerId } }),
      limit: 100,
    },
    { enabled: isOpen }
  )

  const paymentMethods = paymentMethodsData?.data ?? []

  // Filter products: exclude default, only active with prices, only subscription types
  const availableProducts: PricingModelWithProductsAndUsageMeters['products'] =
    useMemo(() => {
      if (!pricingModelData?.pricingModel?.products) return []
      return filterAvailableSubscriptionProducts(
        pricingModelData.pricingModel.products
      )
    }, [pricingModelData])

  // Create subscription mutation
  const createSubscription = trpc.subscriptions.create.useMutation({
    onSuccess: () => {
      // Invalidate subscriptions table to refresh
      utils.subscriptions.getTableRows.invalidate()
      if (onSuccess) {
        onSuccess()
      }
    },
    onError: (error) => {
      toast.error('Failed to create subscription', {
        description:
          error.message ||
          'An unexpected error occurred. Please try again.',
      })
    },
  })

  const getDefaultValues = (): CreateSubscriptionFormData => ({
    productId: '',
    defaultPaymentMethodId: 'none', // Will be updated by PaymentMethodSelector when payment methods load
    doNotCharge: false,
  })

  const handleSubmit = async (data: CreateSubscriptionFormData) => {
    if (!pricingModelData?.pricingModel) {
      throw new Error('Pricing model not loaded')
    }

    // Find selected product
    const selectedProduct =
      pricingModelData.pricingModel.products.find(
        (p) => p.id === data.productId
      )

    if (!selectedProduct) {
      throw new Error('Selected product not found')
    }

    const priceId = selectedProduct.defaultPrice.id

    // Map payment method: 'none' → undefined, otherwise use the ID
    // If doNotCharge is true, always send undefined for payment method
    const mappedPaymentMethodId =
      data.doNotCharge ||
      data.defaultPaymentMethodId === 'none' ||
      !data.defaultPaymentMethodId
        ? undefined
        : data.defaultPaymentMethodId

    // Call API with only required fields (backend handles defaults)
    await createSubscription.mutateAsync({
      customerId,
      priceId,
      defaultPaymentMethodId: mappedPaymentMethodId,
      doNotCharge: data.doNotCharge,
    })
  }

  // Show error state if pricing model fails to load
  if (pricingModelError) {
    return (
      <FormModal
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        title="Create Subscription"
        formSchema={createSubscriptionFormSchema}
        defaultValues={getDefaultValues}
        onSubmit={handleSubmit}
        autoClose={false}
      >
        <CustomerNameDisplay
          customerName={customerData?.customer?.name}
        />
        <div className="text-sm text-destructive">
          Failed to load pricing model. Please try again.
        </div>
      </FormModal>
    )
  }

  // Show message if no products available
  if (
    !isLoadingPricingModel &&
    !isLoadingPaymentMethods &&
    availableProducts.length === 0
  ) {
    return (
      <FormModal
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        title="Create Subscription"
        formSchema={createSubscriptionFormSchema}
        defaultValues={getDefaultValues}
        onSubmit={handleSubmit}
        autoClose={false}
      >
        <CustomerNameDisplay
          customerName={customerData?.customer?.name}
          className="mb-2"
        />
        <div className="text-sm text-muted-foreground">
          {pricingModelData?.pricingModel?.products.some(
            (p) => p.default
          )
            ? 'No products available. Default products are automatically assigned.'
            : 'No products available for this customer.'}
        </div>
      </FormModal>
    )
  }

  return (
    <FormModal
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      title="Create Subscription"
      formSchema={createSubscriptionFormSchema}
      defaultValues={getDefaultValues}
      onSubmit={handleSubmit}
      submitButtonText={
        createSubscription.isPending ? 'Creating...' : 'Create'
      }
      autoClose={true}
    >
      <div>
        <CustomerNameDisplay
          customerName={customerData?.customer?.name}
          className="mb-6"
        />
        <CreateSubscriptionFormContent
          isLoadingPricingModel={isLoadingPricingModel}
          isLoadingPaymentMethods={isLoadingPaymentMethods}
          availableProducts={availableProducts}
          paymentMethods={paymentMethods}
          customerName={customerData?.customer?.name}
        />
      </div>
    </FormModal>
  )
}

const ChargeToggle = () => {
  const form = useFormContext<CreateSubscriptionFormData>()

  return (
    <FormField
      control={form.control}
      name="doNotCharge"
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between">
            <FormLabel className="cursor-pointer">
              Charge for this subscription
            </FormLabel>
            <FormControl>
              <Switch
                checked={!field.value}
                onCheckedChange={(checked) =>
                  field.onChange(!checked)
                }
              />
            </FormControl>
          </div>
          {field.value && (
            <p className="text-xs text-muted-foreground mt-1">
              The customer will not be charged for this subscription.
            </p>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

/**
 * Generates subscription details content based on charge settings and pricing data.
 * Returns formatted JSX describing the subscription terms for the info card.
 */
const getSubscriptionDetailsText = (
  doNotCharge: boolean,
  customerName: string | undefined,
  productCardData: {
    productName: string
    price: string
    period: string
    currencySymbol: string
    trialPeriodDays: number | null
  }
): React.ReactNode => {
  const customerDisplay = customerName ? (
    <strong>{customerName}</strong>
  ) : (
    'the customer'
  )

  if (doNotCharge) {
    return (
      <ul className="list-disc list-inside space-y-1">
        <li>
          {customerDisplay} will be subscribed to{' '}
          <strong>{productCardData.productName}</strong> at{' '}
          <strong>no charge</strong>.
        </li>
        <li>The subscription will begin immediately.</li>
      </ul>
    )
  }

  if (
    productCardData.trialPeriodDays &&
    productCardData.trialPeriodDays > 0
  ) {
    return (
      <ul className="list-disc list-inside space-y-1">
        <li>
          {customerDisplay} will be subscribed to{' '}
          <strong>{productCardData.productName}</strong> at a rate of{' '}
          <strong>
            {productCardData.currencySymbol}
            {productCardData.price}
          </strong>{' '}
          per {productCardData.period}.
        </li>
        <li>
          The subscription includes a{' '}
          <strong>
            {productCardData.trialPeriodDays} day free trial
          </strong>
          .
        </li>
        <li>The subscription will begin immediately.</li>
      </ul>
    )
  }

  return (
    <ul className="list-disc list-inside space-y-1">
      <li>
        {customerDisplay} will be subscribed to{' '}
        <strong>{productCardData.productName}</strong> at a rate of{' '}
        <strong>
          {productCardData.currencySymbol}
          {productCardData.price}
        </strong>{' '}
        per {productCardData.period}.
      </li>
      <li>The subscription will begin immediately.</li>
    </ul>
  )
}

const CreateSubscriptionFormContent = ({
  isLoadingPricingModel,
  isLoadingPaymentMethods,
  availableProducts,
  paymentMethods,
  customerName,
}: {
  isLoadingPricingModel: boolean
  isLoadingPaymentMethods: boolean
  availableProducts: PricingModelWithProductsAndUsageMeters['products']
  paymentMethods: PaymentMethod.ClientRecord[]
  customerName?: string
}) => {
  const form = useFormContext<CreateSubscriptionFormData>()
  // useWatch subscribes to the 'productId' field and returns its current value
  // This re-renders the component whenever productId changes
  const selectedProductId = useWatch({
    control: form.control,
    name: 'productId',
  })
  // Watch doNotCharge to conditionally render payment method selector
  // useWatch ensures the component re-renders when this value changes
  const doNotCharge =
    useWatch({
      control: form.control,
      name: 'doNotCharge',
    }) ?? false

  // Find selected product from available products
  const selectedProduct = selectedProductId
    ? (availableProducts.find((p) => p.id === selectedProductId) ??
      null)
    : null

  // Format price and billing period for selected product
  let productCardData: {
    productName: string
    price: string
    period: string
    currencySymbol: string
    trialPeriodDays: number | null
  } | null = null

  if (selectedProduct) {
    const price = selectedProduct.defaultPrice
    // Handle intervalUnit which might be IntervalUnit enum or string
    const intervalUnit =
      typeof price.intervalUnit === 'string'
        ? price.intervalUnit
        : (price.intervalUnit ?? null)
    const intervalCount = price.intervalCount ?? null

    const { symbol: currencySymbol, value: priceValue } =
      getCurrencyParts(price.currency, price.unitPrice, {
        hideZeroCents: true,
      })

    const period = formatBillingPeriod(intervalUnit, intervalCount)

    const trialPeriodDays = price.trialPeriodDays ?? null

    productCardData = {
      productName: selectedProduct.name,
      price: priceValue,
      period,
      currencySymbol,
      trialPeriodDays,
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {isLoadingPricingModel || isLoadingPaymentMethods ? (
        <>
          {/* Product Selector Skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Payment Method Selector Skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Info Card Skeleton */}
          <div className="flex flex-col gap-3 px-3 py-2.5 bg-accent rounded-sm border border-border">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </>
      ) : (
        <>
          <ProductSelector products={availableProducts} />
          {!doNotCharge && (
            <PaymentMethodSelector
              key="payment-method-selector"
              paymentMethods={paymentMethods}
            />
          )}
          <ChargeToggle />
          {productCardData && (
            <InfoCard title="Subscription Details">
              {getSubscriptionDetailsText(
                doNotCharge,
                customerName,
                productCardData
              )}
            </InfoCard>
          )}
        </>
      )}
    </div>
  )
}
