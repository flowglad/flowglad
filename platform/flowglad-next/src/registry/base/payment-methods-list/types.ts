// Base payment method properties
interface PaymentMethodBase {
  id: string
  createdAt?: Date
  updatedAt?: Date
}

// Card payment method
interface CardPaymentMethod extends PaymentMethodBase {
  type: 'card'
  brand?: string
  last4: string
  expiryMonth?: number
  expiryYear?: number
}

// Bank account payment method
interface BankAccountPaymentMethod extends PaymentMethodBase {
  type: 'bank_account'
  last4: string
  bankName?: string
  accountType?: string
}

// PayPal payment method
interface PayPalPaymentMethod extends PaymentMethodBase {
  type: 'paypal'
  email: string
}

// Other payment method
interface OtherPaymentMethod extends PaymentMethodBase {
  type: 'other'
  description: string
}

// Discriminated union for all payment method types
export type PaymentMethod =
  | CardPaymentMethod
  | BankAccountPaymentMethod
  | PayPalPaymentMethod
  | OtherPaymentMethod

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
