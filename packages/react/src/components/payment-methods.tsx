import { Table, TableBody, TableCell, TableRow } from './ui/table'
import { PaymentMethod } from '@flowglad/types'
import {
  AmericanExpressLogo,
  DinersClubLogo,
  DiscoverLogo,
  MastercardLogo,
  VisaLogo,
} from './payment-method-logos'
import { Badge } from './ui/badge'
import { CreditCard } from 'lucide-react'

interface DisplayPaymentMethod
  extends Pick<PaymentMethod, 'type' | 'paymentMethodData'> {
  default?: boolean
}

interface PaymentMethodsProps {
  paymentMethods: DisplayPaymentMethod[]
}

export function CardLogoBadge({ brand }: { brand: string }) {
  switch (brand) {
    case 'visa':
      return <VisaLogo size={24} />
    case 'mastercard':
      return <MastercardLogo size={24} />
    case 'amex':
      return <AmericanExpressLogo size={24} />
    case 'discover':
      return <DiscoverLogo size={24} />
    case 'diners':
      return <DinersClubLogo size={24} />
    case 'jcb':
    case 'unionpay':
    case 'maestro':
    case 'elo':
    case 'hipercard':
    case 'mir':
    case 'rupay':
    case 'troy':
    case 'cartes_bancaires':
    default:
      return <CreditCard size={24} />
  }
}

function DefaultBadge() {
  return (
    <Badge
      variant="outline"
      className="flowglad-bg-muted flowglad-text-muted-foreground"
    >
      Default
    </Badge>
  )
}

export function CardPaymentMethodLabel({
  brand,
  last4,
  isDefault,
}: {
  brand: string
  last4: string
  isDefault?: boolean
}) {
  return (
    <div className="flowglad-flex flowglad-flex-row flowglad-items-center flowglad-gap-4">
      <CardLogoBadge brand={brand} />
      <span className="flowglad-font-medium flowglad-text-muted-foreground">
        •••• {last4}
      </span>
      {isDefault && <DefaultBadge />}
    </div>
  )
}

export function CardPaymentMethodRow({
  paymentMethod,
}: {
  paymentMethod: DisplayPaymentMethod
}) {
  return (
    <TableRow
      className="!flowglad-border-t-0 !flowglad-border-x-0"
      onClick={() => {}}
    >
      <TableCell className="flowglad-flex flowglad-flex-row flowglad-items-center flowglad-gap-4">
        <CardPaymentMethodLabel
          brand={paymentMethod.paymentMethodData.brand as string}
          last4={paymentMethod.paymentMethodData.last4 as string}
          isDefault={paymentMethod.default}
        />
      </TableCell>
    </TableRow>
  )
}

export function PaymentMethodRow({
  paymentMethod,
}: {
  paymentMethod: DisplayPaymentMethod
}) {
  if (paymentMethod.type === 'card') {
    return <CardPaymentMethodRow paymentMethod={paymentMethod} />
  }
  return <TableRow onClick={() => {}}></TableRow>
}

export function PaymentMethods({
  paymentMethods,
}: PaymentMethodsProps) {
  // Sort payment methods to show default payment method first
  const sortedPaymentMethods = [...paymentMethods].sort((a, b) => {
    if (a.default && !b.default) return -1
    if (!a.default && b.default) return 1
    return 0
  })

  return (
    <Table>
      <TableBody>
        {sortedPaymentMethods.map((paymentMethod, index) => (
          <PaymentMethodRow
            key={index}
            paymentMethod={paymentMethod}
          />
        ))}
      </TableBody>
    </Table>
  )
}
