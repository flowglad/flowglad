import { useFlowgladTheme } from '../FlowgladTheme'

interface CustomerBillingDetailsProps {
  name: string
  email: string
  billingAddress?: {
    line1: string
    line2?: string | null
    city: string
    state?: string | null
    postalCode: string
    country: string
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
      <dd className="flowglad-text-base flowglad-font-medium">
        {name}
      </dd>

      <dt className="flowglad-text-base flowglad-font-medium flowglad-text-muted-foreground">
        Email
      </dt>
      <dd className="flowglad-text-base flowglad-font-medium">
        {email}
      </dd>

      <dt className="flowglad-text-base flowglad-font-medium flowglad-text-muted-foreground">
        Billing address
      </dt>
      {billingAddress && (
        <dd className="flowglad-flex flowglad-flex-col">
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
