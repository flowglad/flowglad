import {
  VisaLogo,
  MastercardLogo,
  AmericanExpressLogo,
  DiscoverLogo,
  DinersClubLogo,
} from './PaymentMethodLogos'
import { CreditCard } from 'lucide-react'
import { Badge } from './ui/badge'

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
      className="bg-muted text-muted-foreground"
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
    <div className="flex flex-row items-center gap-4">
      <CardLogoBadge brand={brand} />
      <span className="font-medium text-muted-foreground">
        •••• {last4}
      </span>
      {isDefault && <DefaultBadge />}
    </div>
  )
}
