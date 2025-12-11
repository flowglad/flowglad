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
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { PricingModelWithProductsAndUsageMeters } from '@/db/schema/prices'
import { encodeCursor } from '@/db/tableUtils'
import { PaymentMethodType, PriceType } from '@/types'
import { filterAvailableSubscriptionProducts } from '@/utils/productHelpers'
import { formatBillingPeriod, getCurrencyParts } from '@/utils/stripe'

const createSubscriptionFormSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  defaultPaymentMethodId: z.string().optional(),
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
              value={field.value || 'none'}
              onValueChange={field.onChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {paymentMethods.map((pm) => {
                  const brand =
                    typeof pm.paymentMethodData.brand === 'string'
                      ? pm.paymentMethodData.brand
                      : undefined
                  const last4 =
                    typeof pm.paymentMethodData.last4 === 'string'
                      ? pm.paymentMethodData.last4
                      : undefined

                  return (
                    <SelectItem key={pm.id} value={pm.id}>
                      {pm.type === PaymentMethodType.Card &&
                      brand &&
                      last4 ? (
                        <CardPaymentMethodLabel
                          brand={brand}
                          last4={last4}
                          isDefault={pm.default}
                        />
                      ) : pm.type ===
                        PaymentMethodType.USBankAccount ? (
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
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{pm.type}</span>
                          {pm.default && (
                            <span className="text-xs text-muted-foreground">
                              (Default)
                            </span>
                          )}
                        </div>
                      )}
                    </SelectItem>
                  )
                })}
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

  const defaultValues: CreateSubscriptionFormData = {
    productId: '',
    defaultPaymentMethodId: 'none', // Will be updated by PaymentMethodSelector when payment methods load
  }

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
    const mappedPaymentMethodId =
      data.defaultPaymentMethodId === 'none' ||
      !data.defaultPaymentMethodId
        ? undefined
        : data.defaultPaymentMethodId

    // Call API with only required fields (backend handles defaults)
    await createSubscription.mutateAsync({
      customerId,
      priceId,
      defaultPaymentMethodId: mappedPaymentMethodId,
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
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        autoClose={false}
      >
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
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        autoClose={false}
      >
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
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      submitButtonText={
        createSubscription.isPending ? 'Creating...' : 'Create'
      }
      autoClose={true}
    >
      <CreateSubscriptionFormContent
        isLoadingPricingModel={isLoadingPricingModel}
        isLoadingPaymentMethods={isLoadingPaymentMethods}
        availableProducts={availableProducts}
        paymentMethods={paymentMethods}
      />
    </FormModal>
  )
}

const CreateSubscriptionFormContent = ({
  isLoadingPricingModel,
  isLoadingPaymentMethods,
  availableProducts,
  paymentMethods,
}: {
  isLoadingPricingModel: boolean
  isLoadingPaymentMethods: boolean
  availableProducts: PricingModelWithProductsAndUsageMeters['products']
  paymentMethods: PaymentMethod.ClientRecord[]
}) => {
  const form = useFormContext<CreateSubscriptionFormData>()
  // useWatch subscribes to the 'productId' field and returns its current value
  // This re-renders the component whenever productId changes
  const selectedProductId = useWatch({
    control: form.control,
    name: 'productId',
  })

  // Find selected product from available products
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) {
      return null
    }
    return availableProducts.find((p) => p.id === selectedProductId)
  }, [selectedProductId, availableProducts])

  // Format price and billing period for selected product
  const productCardData = useMemo(() => {
    if (!selectedProduct) return null

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

    return {
      productName: selectedProduct.name,
      price: priceValue,
      period,
      currencySymbol,
    }
  }, [selectedProduct])

  return (
    <div className="flex flex-col gap-6">
      {isLoadingPricingModel || isLoadingPaymentMethods ? (
        <div className="text-sm text-muted-foreground">
          Loading products and payment methods...
        </div>
      ) : (
        <>
          <ProductSelector products={availableProducts} />
          <PaymentMethodSelector paymentMethods={paymentMethods} />
          {productCardData && (
            <InfoCard
              title="Subscription Details"
              actionText="View Product Details"
              actionHref={`/store/products/${selectedProductId}`}
            >
              <ul className="list-disc list-inside space-y-1">
                <li>Name: {productCardData.productName}</li>
                <li>
                  Price: {productCardData.currencySymbol}
                  {productCardData.price} / {productCardData.period}
                </li>
              </ul>
            </InfoCard>
          )}
        </>
      )}
    </div>
  )
}
