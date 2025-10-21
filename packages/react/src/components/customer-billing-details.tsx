import { useFlowgladTheme } from '../FlowgladTheme'
import { type Flowglad } from '@flowglad/node'

interface CustomerBillingDetailsProps {
  name: string
  email: string
  billingAddress?: {
    line1: Flowglad.BillingAddress['address']['line1'] | null
    line2?: Flowglad.BillingAddress['address']['line2'] | null
    city: Flowglad.BillingAddress['address']['city'] | null
    state?: Flowglad.BillingAddress['address']['state'] | null
    postalCode:
      | Flowglad.BillingAddress['address']['postal_code']
      | null
    country: Flowglad.BillingAddress['address']['country']
  }
}

export const CustomerBillingDetails = ({
  name,
  email,
  billingAddress,
}: CustomerBillingDetailsProps) => {
  const { themedCn } = useFlowgladTheme()
  return (
    <dl
      className={themedCn(
        'flowglad-grid flowglad-grid-cols-[auto_1fr] flowglad-gap-x-4 flowglad-gap-y-2'
      )}
    >
      <dt className="flowglad-text-base flowglad-font-medium flowglad-text-muted-foreground">
        Name
      </dt>
      <dd className="flowglad-text-base flowglad-font-medium flowglad-text-foreground">
        {name}
      </dd>

      <dt className="flowglad-text-base flowglad-font-medium flowglad-text-muted-foreground">
        Email
      </dt>
      <dd className="flowglad-text-base flowglad-font-medium flowglad-text-foreground">
        {email}
      </dd>

      <dt className="flowglad-text-base flowglad-font-medium flowglad-text-muted-foreground">
        Billing address
      </dt>
      {billingAddress && (
        <dd className="flowglad-flex flowglad-flex-col flowglad-text-foreground">
          <span className="flowglad-text-base flowglad-font-medium">
            {billingAddress.line1}
          </span>
          {billingAddress.line2 && (
            <span className="flowglad-text-base flowglad-font-medium">
              {billingAddress.line2}
            </span>
          )}
          <span className="flowglad-text-base flowglad-font-medium">
            {billingAddress.city}, {billingAddress.state}{' '}
            {billingAddress.postalCode} {billingAddress.country}
          </span>
        </dd>
      )}
    </dl>
  )
}
