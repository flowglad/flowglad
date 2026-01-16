/**
 * @vitest-environment jsdom
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import core from '@/utils/core'
import { CustomerTrialExpiredNoPaymentEmail } from './customer-trial-expired-no-payment'

describe('CustomerTrialExpiredNoPaymentEmail', () => {
  const baseProps = {
    customerName: 'John Doe',
    organizationName: 'Acme Corp',
    organizationLogoUrl: 'https://example.com/logo.png',
    organizationId: 'org_123',
    customerId: 'cus_456',
    planName: 'Pro Plan',
    livemode: true,
  }

  it('displays correct header', () => {
    const { getByTestId } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(getByTestId('email-title')).toHaveTextContent(
      'Trial Ended'
    )
  })

  it('shows customer greeting', () => {
    const { getByText } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(
      getByText(`Hi ${baseProps.customerName},`)
    ).toBeInTheDocument()
  })

  it('shows trial ended message with plan name', () => {
    const { getByText } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(
      getByText(
        `Your free trial for ${baseProps.planName} has ended.`
      )
    ).toBeInTheDocument()
  })

  it('shows plan name in details', () => {
    const { getByTestId } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(getByTestId('plan-name')).toHaveTextContent(
      `Plan: ${baseProps.planName}`
    )
  })

  it('shows status as trial ended', () => {
    const { getByTestId } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(getByTestId('status')).toHaveTextContent(
      'Status: Trial ended - Payment required'
    )
  })

  it('shows add payment method instructions', () => {
    const { getByText } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(
      getByText(
        `To continue using ${baseProps.planName}, please add a payment method.`
      )
    ).toBeInTheDocument()
  })

  it('shows inactive subscription warning', () => {
    const { getByText } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(
      getByText(/your subscription will remain inactive/)
    ).toBeInTheDocument()
  })

  it('shows add payment method button with correct link', () => {
    const { getByTestId } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    const button = getByTestId('add-payment-method-button')
    expect(button).toHaveTextContent('Add Payment Method →')
    expect(button).toHaveAttribute(
      'href',
      core.customerBillingPortalURL({
        organizationId: baseProps.organizationId,
        customerId: baseProps.customerId,
      })
    )
  })

  it('shows organization signature', () => {
    const { getByTestId } = render(
      <CustomerTrialExpiredNoPaymentEmail {...baseProps} />
    )

    expect(getByTestId('signature-thanks')).toHaveTextContent(
      'Thanks,'
    )
    expect(getByTestId('signature-org-name')).toHaveTextContent(
      baseProps.organizationName
    )
  })

  it('renders without organization logo when not provided', () => {
    const propsWithoutLogo = {
      ...baseProps,
      organizationLogoUrl: undefined,
    }
    const { queryByAltText } = render(
      <CustomerTrialExpiredNoPaymentEmail {...propsWithoutLogo} />
    )

    expect(queryByAltText('Logo')).not.toBeInTheDocument()
  })
})
