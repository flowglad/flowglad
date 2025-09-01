export interface PaymentMethod {
  id: string
  type: 'card' | 'bank_account' | 'paypal' | 'other'
  brand?: string
  last4: string
  expiryMonth?: number
  expiryYear?: number
  bankName?: string
  accountType?: string
  email?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[]
  defaultPaymentMethodId?: string
  onAddPaymentMethod?: () => void
  onRemovePaymentMethod?: (id: string) => Promise<void>
  onSetDefault?: (id: string) => Promise<void>
  loading?: boolean
  className?: string
}

export interface PaymentMethodRowProps {
  paymentMethod: PaymentMethod
  isDefault?: boolean
  onRemove?: (id: string) => Promise<void>
  onSetDefault?: (id: string) => Promise<void>
  loading?: boolean
}

export interface CardBrandLogoProps {
  brand: string
  className?: string
}

export interface AddPaymentMethodButtonProps {
  onClick?: () => void
  loading?: boolean
  className?: string
}
