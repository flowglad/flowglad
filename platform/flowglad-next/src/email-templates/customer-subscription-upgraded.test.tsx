import { describe, expect, it } from 'bun:test'
import { render } from '@testing-library/react'
import { CurrencyCode, IntervalUnit } from '@/types'
import core from '@/utils/core'
import { CustomerSubscriptionUpgradedEmail } from './customer-subscription-upgraded'

describe('CustomerSubscriptionUpgradedEmail', () => {
  // Base props for Free → Paid upgrade
  const freeToPaidProps = {
    customerName: 'Jane Smith',
    organizationName: 'Tech Solutions',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_789',
    customerExternalId: 'cus_101',
    previousPlanName: 'Free Plan',
    previousPlanPrice: 0,
    previousPlanCurrency: CurrencyCode.USD,
    previousPlanInterval: IntervalUnit.Month,
    newPlanName: 'Pro Plan',
    price: 4900, // $49.00
    currency: CurrencyCode.USD,
    interval: IntervalUnit.Month,
    nextBillingDate: new Date('2025-02-15'),
    paymentMethodLast4: '1234',
    dateConfirmed: new Date('2025-01-15'),
  }

  // Props for Paid → Paid upgrade
  const paidToPaidProps = {
    ...freeToPaidProps,
    previousPlanName: 'Basic Plan',
    previousPlanPrice: 1900, // $19.00
    previousPlanCurrency: CurrencyCode.USD,
    previousPlanInterval: IntervalUnit.Month,
  }

  const trialingProps = {
    ...freeToPaidProps,
    nextBillingDate: new Date('2025-01-29'),
    trialing: true,
  }

  describe('Free to Paid upgrade', () => {
    it('renders subscription confirmed title and message', () => {
      const { getByText, getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      expect(
        getByText(
          "You've successfully subscribed to the following plan:"
        )
      ).toBeInTheDocument()
      expect(getByTestId('email-title')).toHaveTextContent(
        'Subscription Confirmed'
      )
    })

    it('does NOT show previous plan when upgrading from free', () => {
      const { queryByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      // Previous plan should not be shown for free → paid upgrades
      expect(queryByTestId('previous-plan')).not.toBeInTheDocument()
    })

    it('shows "Plan" label (not "New Plan") when upgrading from free', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      const planRow = getByTestId('new-plan')
      expect(planRow).toHaveTextContent('Plan')
      expect(planRow).not.toHaveTextContent('New Plan')
      expect(planRow).toHaveTextContent('Pro Plan')
    })

    it('shows price in Apple-style table row', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      const priceRow = getByTestId('price')
      expect(priceRow).toHaveTextContent('Price')
      expect(priceRow).toHaveTextContent('$49.00/month')
    })

    it('shows Next Billing Date for non-trial subscriptions', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      const dateRow = getByTestId('next-billing-date')
      expect(dateRow).toHaveTextContent('Next Billing Date')
      expect(dateRow).toHaveTextContent('2025')
    })

    it('shows date confirmed', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      const dateRow = getByTestId('date-confirmed')
      expect(dateRow).toHaveTextContent('Date Confirmed')
      expect(dateRow).toHaveTextContent('2025')
    })

    it('displays payment method', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      const paymentRow = getByTestId('payment-method')
      expect(paymentRow).toHaveTextContent('Payment Method')
      expect(paymentRow).toHaveTextContent('•••• 1234')
    })

    it('shows auto-renewal notice', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      const notice = getByTestId('auto-renew-notice')
      expect(notice).toHaveTextContent(
        'Your subscription automatically renews until canceled.'
      )
    })
  })

  describe('Paid to Paid upgrade', () => {
    it('shows previous plan when upgrading from paid plan', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...paidToPaidProps} />
      )

      const previousPlanRow = getByTestId('previous-plan')
      expect(previousPlanRow).toHaveTextContent('Previous Plan')
      expect(previousPlanRow).toHaveTextContent(
        'Basic Plan ($19.00/month)'
      )
    })

    it('shows "New Plan" label when upgrading from paid plan', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...paidToPaidProps} />
      )

      const newPlanRow = getByTestId('new-plan')
      expect(newPlanRow).toHaveTextContent('New Plan')
      expect(newPlanRow).toHaveTextContent('Pro Plan')
    })

    it('displays both plans for paid-to-paid transitions', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...paidToPaidProps} />
      )

      expect(getByTestId('previous-plan')).toBeInTheDocument()
      expect(getByTestId('new-plan')).toBeInTheDocument()
    })

    it('handles yearly previous plan correctly', () => {
      const yearlyPreviousProps = {
        ...paidToPaidProps,
        previousPlanName: 'Basic Yearly',
        previousPlanPrice: 20000, // $200.00
        previousPlanInterval: IntervalUnit.Year,
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...yearlyPreviousProps} />
      )

      expect(getByTestId('previous-plan')).toHaveTextContent(
        'Basic Yearly ($200.00/year)'
      )
    })

    it('handles different currencies for previous plan', () => {
      const differentCurrencyProps = {
        ...paidToPaidProps,
        previousPlanName: 'Euro Basic',
        previousPlanPrice: 2500, // €25.00
        previousPlanCurrency: CurrencyCode.EUR,
        currency: CurrencyCode.EUR,
        price: 4500, // €45.00
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail
          {...differentCurrencyProps}
        />
      )

      expect(getByTestId('previous-plan')).toHaveTextContent(
        'Euro Basic (€25.00/month)'
      )
      expect(getByTestId('price')).toHaveTextContent('€45.00/month')
    })

    it('handles previous plan with weekly interval', () => {
      const weeklyPreviousProps = {
        ...paidToPaidProps,
        previousPlanName: 'Weekly Basic',
        previousPlanPrice: 700, // $7.00
        previousPlanInterval: IntervalUnit.Week,
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...weeklyPreviousProps} />
      )

      expect(getByTestId('previous-plan')).toHaveTextContent(
        'Weekly Basic ($7.00/week)'
      )
    })

    it('handles non-renewing previous plan', () => {
      const nonRenewingPreviousProps = {
        ...paidToPaidProps,
        previousPlanName: 'One-time Plan',
        previousPlanPrice: 9900, // $99.00
        previousPlanInterval: undefined,
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail
          {...nonRenewingPreviousProps}
        />
      )

      expect(getByTestId('previous-plan')).toHaveTextContent(
        'One-time Plan ($99.00)'
      )
    })
  })

  describe('Trial subscriptions', () => {
    it('shows Renewal Price with embedded date for trials (Apple-style)', () => {
      const { getByTestId, queryByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...trialingProps} />
      )

      // Trial subscriptions show "Renewal Price" with embedded date
      const renewalRow = getByTestId('renewal-price')
      expect(renewalRow).toHaveTextContent('Renewal Price')
      expect(renewalRow).toHaveTextContent('$49.00/month')
      expect(renewalRow).toHaveTextContent('starting')
      expect(renewalRow).toHaveTextContent('2025')

      // Trial subscriptions should NOT have separate price or next-billing-date rows
      expect(queryByTestId('price')).not.toBeInTheDocument()
      expect(
        queryByTestId('next-billing-date')
      ).not.toBeInTheDocument()
    })

    it('shows trial auto-renewal notice with cancellation deadline', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...trialingProps} />
      )

      const notice = getByTestId('trial-auto-renew-notice')
      expect(notice).toHaveTextContent(
        'Your subscription automatically renews until canceled'
      )
      expect(notice).toHaveTextContent(
        'To avoid being charged, you must cancel at least a day before'
      )
    })
  })

  describe('Pricing formats', () => {
    it('formats monthly pricing correctly', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      expect(getByTestId('price')).toHaveTextContent('$49.00/month')
    })

    it('formats yearly pricing correctly', () => {
      const yearlyProps = {
        ...freeToPaidProps,
        interval: IntervalUnit.Year,
        price: 50000, // $500.00
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...yearlyProps} />
      )

      expect(getByTestId('price')).toHaveTextContent('$500.00/year')
    })

    it('handles weekly interval', () => {
      const weeklyProps = {
        ...freeToPaidProps,
        interval: IntervalUnit.Week,
        price: 700, // $7.00
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...weeklyProps} />
      )

      expect(getByTestId('price')).toHaveTextContent('$7.00/week')
    })

    it('handles daily interval', () => {
      const dailyProps = {
        ...freeToPaidProps,
        interval: IntervalUnit.Day,
        price: 199, // $1.99
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...dailyProps} />
      )

      expect(getByTestId('price')).toHaveTextContent('$1.99/day')
    })

    it('handles different currency codes correctly', () => {
      const gbpProps = {
        ...freeToPaidProps,
        previousPlanCurrency: CurrencyCode.GBP,
        currency: CurrencyCode.GBP,
        price: 3500, // £35.00
      }
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...gbpProps} />
      )

      expect(getByTestId('price')).toHaveTextContent('£35.00/month')
    })
  })

  describe('Edge cases', () => {
    it('includes inline manage subscription link', () => {
      const { getByText } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      const expectedUrl = core.organizationBillingPortalURL({
        organizationId: freeToPaidProps.organizationId,
      })

      const link = getByText('manage your subscription')
      expect(link).toHaveAttribute('href', expectedUrl)
    })

    it('handles missing payment method gracefully', () => {
      const propsWithoutPayment = {
        ...freeToPaidProps,
        paymentMethodLast4: undefined,
      }
      const { queryByTestId, getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...propsWithoutPayment} />
      )

      expect(queryByTestId('payment-method')).not.toBeInTheDocument()
      expect(getByTestId('auto-renew-notice')).toHaveTextContent(
        'Your subscription automatically renews until canceled.'
      )
    })

    it('displays customer greeting correctly', () => {
      const { getByText } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      expect(
        getByText(`Hi ${freeToPaidProps.customerName},`)
      ).toBeInTheDocument()
    })

    it('shows organization name in signature', () => {
      const { getByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...freeToPaidProps} />
      )

      expect(getByTestId('signature-thanks')).toHaveTextContent(
        'Thanks,'
      )
      expect(getByTestId('signature-org-name')).toHaveTextContent(
        freeToPaidProps.organizationName
      )
    })

    it('renders without organization logo when not provided', () => {
      const propsWithoutLogo = {
        ...freeToPaidProps,
        organizationLogoUrl: undefined,
      }
      const { queryByAltText } = render(
        <CustomerSubscriptionUpgradedEmail {...propsWithoutLogo} />
      )

      expect(queryByAltText('Logo')).not.toBeInTheDocument()
    })

    it('handles non-renewing upgraded subscription without interval', () => {
      const nonRenewingProps = {
        ...freeToPaidProps,
        interval: undefined,
        nextBillingDate: undefined,
      }
      const { getByTestId, queryByTestId } = render(
        <CustomerSubscriptionUpgradedEmail {...nonRenewingProps} />
      )

      expect(getByTestId('price')).toHaveTextContent('$49.00')
      expect(
        queryByTestId('next-billing-date')
      ).not.toBeInTheDocument()
    })
  })
})
