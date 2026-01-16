'use client'

import { render } from '@react-email/render'
import React, { useEffect, useState } from 'react'

interface EmailPreviewWrapperProps {
  /** The email template file name (e.g., 'customer-subscription-created') */
  templateName: string
  /** A description of the scenario being previewed */
  scenario: string
  /** Whether this preview is showing test mode (non-live) */
  testMode?: boolean
  /** The email template component to render */
  children: React.ReactElement
}

/**
 * Wrapper component for email template previews.
 * Renders email templates to HTML strings and displays them in an iframe
 * to avoid hydration errors from nested <html> elements.
 */
export const EmailPreviewWrapper = ({
  templateName,
  scenario,
  testMode = false,
  children,
}: EmailPreviewWrapperProps) => {
  const [html, setHtml] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const renderEmail = async () => {
      try {
        const renderedHtml = await render(children)
        setHtml(renderedHtml)
      } catch (error) {
        console.error('Failed to render email template:', error)
        setHtml(
          '<html><body><p style="color: red; padding: 20px;">Failed to render email template</p></body></html>'
        )
      } finally {
        setIsLoading(false)
      }
    }
    renderEmail()
  }, [children])

  return (
    <div className="p-4">
      <div className="mb-4 text-sm text-gray-600 flex items-center gap-4">
        <span>
          <strong>Template:</strong> {templateName}
        </span>
        <span>
          <strong>Scenario:</strong> {scenario}
        </span>
        {testMode && (
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
            TEST MODE
          </span>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            Loading preview...
          </div>
        ) : (
          <iframe
            srcDoc={html}
            title={`Email preview: ${scenario}`}
            className="w-full min-h-[600px] border-0"
          />
        )}
      </div>
    </div>
  )
}

export default EmailPreviewWrapper
