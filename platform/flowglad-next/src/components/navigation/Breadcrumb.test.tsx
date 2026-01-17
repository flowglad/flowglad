import { describe, expect, it, mock } from 'bun:test'
import { render, screen, within } from '@testing-library/react'
import Breadcrumb from './Breadcrumb'

const usePathname = mock(() => '/' as string)

mock.module('next/navigation', () => ({
  usePathname: () => usePathname(),
}))

describe('Breadcrumb', () => {
  it('should render a single linkable breadcrumb with a left chevron', () => {
    // Setup: Path with a single, linkable parent segment.
    usePathname.mockReturnValue('/finance/subscriptions/sub_123')
    render(<Breadcrumb />)

    // Expectations
    const breadcrumbItem = screen.getByTestId('breadcrumb-item')
    expect(breadcrumbItem).toBeInTheDocument()

    const link = within(breadcrumbItem).getByTestId('breadcrumb-link')
    expect(link).toHaveAttribute('href', '/finance/subscriptions')
    expect(link).toHaveTextContent('Subscriptions')

    expect(
      within(breadcrumbItem).getByTestId('breadcrumb-left-icon')
    ).toBeInTheDocument()
    expect(
      within(breadcrumbItem).queryByTestId('breadcrumb-right-icon')
    ).not.toBeInTheDocument()
  })

  it('should render multiple breadcrumbs with right chevrons', () => {
    // Setup: Path with multiple parent segments.
    usePathname.mockReturnValue(
      '/finance/subscriptions/some-customer/details'
    )
    render(<Breadcrumb />)

    // Expectations
    const breadcrumbItems = screen.getAllByTestId('breadcrumb-item')
    expect(breadcrumbItems).toHaveLength(2)

    // First breadcrumb: "Subscriptions" (link)
    const firstItem = breadcrumbItems[0]
    const firstLink = within(firstItem).getByTestId('breadcrumb-link')
    expect(firstLink).toHaveAttribute(
      'href',
      '/finance/subscriptions'
    )
    expect(firstLink).toHaveTextContent('Subscriptions')
    expect(
      within(firstItem).getByTestId('breadcrumb-right-icon')
    ).toBeInTheDocument()
    expect(
      within(firstItem).queryByTestId('breadcrumb-left-icon')
    ).not.toBeInTheDocument()

    // Second breadcrumb: "Some customer" (text)
    const secondItem = breadcrumbItems[1]
    const secondText =
      within(secondItem).getByTestId('breadcrumb-text')
    expect(secondText).toHaveTextContent('Some customer')
    expect(
      within(secondItem).getByTestId('breadcrumb-right-icon')
    ).toBeInTheDocument()
    expect(
      within(secondItem).queryByTestId('breadcrumb-left-icon')
    ).not.toBeInTheDocument()
  })

  it('should render non-linkable breadcrumbs for unknown paths', () => {
    // Setup: Path with non-linkable parent segments.
    usePathname.mockReturnValue('/unknown/path/to/page')
    render(<Breadcrumb />)

    // Expectations
    const breadcrumbItems = screen.getAllByTestId('breadcrumb-item')
    expect(breadcrumbItems).toHaveLength(3)
    expect(breadcrumbItems[0]).toHaveTextContent('Unknown')
    expect(breadcrumbItems[1]).toHaveTextContent('Path')
    expect(breadcrumbItems[2]).toHaveTextContent('To')

    breadcrumbItems.forEach((item) => {
      expect(
        within(item).getByTestId('breadcrumb-text')
      ).toBeInTheDocument()
      expect(
        within(item).queryByTestId('breadcrumb-link')
      ).not.toBeInTheDocument()
      expect(
        within(item).getByTestId('breadcrumb-right-icon')
      ).toBeInTheDocument()
    })
  })

  it('should render nothing if all parent segments are on the noCrumbList', () => {
    // Setup: Path with segments that should be filtered out.
    usePathname.mockReturnValue('/finance/settings/page')
    render(<Breadcrumb />)

    // Expectations
    expect(
      screen.queryByTestId('breadcrumb-item')
    ).not.toBeInTheDocument()
  })

  it('should render nothing for a top-level page', () => {
    // Setup: Path with no parent segments.
    usePathname.mockReturnValue('/dashboard')
    render(<Breadcrumb />)

    // Expectations
    expect(
      screen.queryByTestId('breadcrumb-item')
    ).not.toBeInTheDocument()
  })

  it('should render nothing for the root path', () => {
    // Setup: Root path.
    usePathname.mockReturnValue('/')
    render(<Breadcrumb />)

    // Expectations
    expect(
      screen.queryByTestId('breadcrumb-item')
    ).not.toBeInTheDocument()
  })
})
