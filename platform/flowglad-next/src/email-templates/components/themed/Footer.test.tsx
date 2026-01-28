import { describe, expect, it } from 'bun:test'
import { render } from '@testing-library/react'
import { Footer } from './Footer'

describe('Footer', () => {
  describe('customer variant', () => {
    it('displays organization name and "Powered by Flowglad" by default', () => {
      const { getByTestId } = render(
        <Footer organizationName="Acme Inc" variant="customer" />
      )

      const attribution = getByTestId('footer-attribution')
      expect(attribution).toHaveTextContent(
        'This email was sent by Acme Inc. Powered by Flowglad.'
      )
    })

    it('hides "Powered by Flowglad" when showPoweredBy is false', () => {
      const { getByTestId } = render(
        <Footer
          organizationName="Acme Inc"
          variant="customer"
          showPoweredBy={false}
        />
      )

      const attribution = getByTestId('footer-attribution')
      expect(attribution).toHaveTextContent(
        'This email was sent by Acme Inc.'
      )
      expect(attribution).not.toHaveTextContent('Powered by Flowglad')
    })

    it('renders billing portal link when billingPortalUrl provided', () => {
      const { getByTestId } = render(
        <Footer
          organizationName="Acme Inc"
          variant="customer"
          billingPortalUrl="https://billing.acme.com"
        />
      )

      const link = getByTestId('footer-link-manage-billing')
      expect(link).toHaveTextContent('Manage Billing')
      expect(link).toHaveAttribute('href', 'https://billing.acme.com')
    })

    it('renders support mailto link when supportEmail provided', () => {
      const { getByTestId } = render(
        <Footer
          organizationName="Acme Inc"
          variant="customer"
          supportEmail="support@acme.com"
        />
      )

      const link = getByTestId('footer-link-contact-support')
      expect(link).toHaveTextContent('Contact Support')
      expect(link).toHaveAttribute('href', 'mailto:support@acme.com')
    })

    it('renders unsubscribe link when unsubscribeUrl provided', () => {
      const { getByTestId } = render(
        <Footer
          organizationName="Acme Inc"
          variant="customer"
          unsubscribeUrl="https://acme.com/unsubscribe"
        />
      )

      const link = getByTestId('footer-link-unsubscribe')
      expect(link).toHaveTextContent('Unsubscribe')
      expect(link).toHaveAttribute(
        'href',
        'https://acme.com/unsubscribe'
      )
    })

    it('renders custom links alongside standard links', () => {
      const { getByTestId } = render(
        <Footer
          organizationName="Acme Inc"
          variant="customer"
          billingPortalUrl="https://billing.acme.com"
          links={[
            {
              label: 'Privacy Policy',
              href: 'https://acme.com/privacy',
            },
            { label: 'Terms', href: 'https://acme.com/terms' },
          ]}
        />
      )

      // Standard link should be rendered
      expect(
        getByTestId('footer-link-manage-billing')
      ).toBeInTheDocument()

      // Custom links should be rendered
      expect(
        getByTestId('footer-link-privacy-policy')
      ).toHaveAttribute('href', 'https://acme.com/privacy')
      expect(getByTestId('footer-link-terms')).toHaveAttribute(
        'href',
        'https://acme.com/terms'
      )
    })

    it('does not render links container when no links provided', () => {
      const { queryByTestId } = render(
        <Footer organizationName="Acme Inc" variant="customer" />
      )

      expect(queryByTestId('footer-links')).not.toBeInTheDocument()
    })

    it('renders all link types in correct order: billing, support, custom, unsubscribe', () => {
      const { getByTestId } = render(
        <Footer
          organizationName="Acme Inc"
          variant="customer"
          billingPortalUrl="https://billing.acme.com"
          supportEmail="support@acme.com"
          links={[{ label: 'Help', href: 'https://help.acme.com' }]}
          unsubscribeUrl="https://acme.com/unsubscribe"
        />
      )

      const linksContainer = getByTestId('footer-links')
      const links = linksContainer.querySelectorAll('a')

      expect(links).toHaveLength(4)
      expect(links[0]).toHaveTextContent('Manage Billing')
      expect(links[1]).toHaveTextContent('Contact Support')
      expect(links[2]).toHaveTextContent('Help')
      expect(links[3]).toHaveTextContent('Unsubscribe')
    })
  })

  describe('organization variant', () => {
    it('displays "Sent by Flowglad" without powered by', () => {
      const { getByTestId } = render(
        <Footer organizationName="Acme Inc" variant="organization" />
      )

      const attribution = getByTestId('footer-attribution')
      expect(attribution).toHaveTextContent(
        'This email was sent by Flowglad.'
      )
      expect(attribution).not.toHaveTextContent('Acme Inc')
      expect(attribution).not.toHaveTextContent('Powered by')
    })

    it('ignores showPoweredBy for organization variant', () => {
      const { getByTestId } = render(
        <Footer
          organizationName="Acme Inc"
          variant="organization"
          showPoweredBy={true}
        />
      )

      const attribution = getByTestId('footer-attribution')
      expect(attribution).toHaveTextContent(
        'This email was sent by Flowglad.'
      )
      // Organization variant never shows org name or "Powered by"
      expect(attribution).not.toHaveTextContent('Acme Inc')
    })
  })

  describe('default variant behavior', () => {
    it('defaults to customer variant when not specified', () => {
      const { getByTestId } = render(
        <Footer organizationName="Acme Inc" />
      )

      const attribution = getByTestId('footer-attribution')
      expect(attribution).toHaveTextContent(
        'This email was sent by Acme Inc. Powered by Flowglad.'
      )
    })
  })

  describe('footer structure', () => {
    it('renders footer section with divider', () => {
      const { getByTestId } = render(
        <Footer organizationName="Acme Inc" />
      )

      expect(getByTestId('email-footer')).toBeInTheDocument()
      expect(getByTestId('footer-divider')).toBeInTheDocument()
    })
  })
})
