import { CreditCard } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'
import {
  AmericanExpressLogo,
  DinersClubLogo,
  DiscoverLogo,
  JCBLogo,
  MastercardLogo,
  UnionPayLogo,
  VisaLogo,
} from '../logos'
import type { CardBrandLogoProps } from '../types'

export function CardBrandLogo({
  brand,
  className,
}: CardBrandLogoProps) {
  const logoClassName = cn('h-8 w-auto', className)

  switch (brand?.toLowerCase()) {
    case 'visa':
      return <VisaLogo className={logoClassName} />
    case 'mastercard':
      return <MastercardLogo className={logoClassName} />
    case 'amex':
    case 'american_express':
      return <AmericanExpressLogo className={logoClassName} />
    case 'discover':
      return <DiscoverLogo className={logoClassName} />
    case 'diners':
    case 'diners_club':
      return <DinersClubLogo className={logoClassName} />
    case 'jcb':
      return <JCBLogo className={logoClassName} />
    case 'unionpay':
      return <UnionPayLogo className={logoClassName} />
    default:
      return (
        <CreditCard
          className={cn('h-6 w-6 text-muted-foreground', className)}
        />
      )
  }
}
