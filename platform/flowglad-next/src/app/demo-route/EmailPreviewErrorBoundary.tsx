'use client'

import React from 'react'

interface EmailPreviewErrorBoundaryProps {
  children: React.ReactNode
  templateName?: string
}

interface EmailPreviewErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary for email template previews.
 * Catches rendering errors and displays a helpful error message
 * instead of crashing the entire page.
 */
export class EmailPreviewErrorBoundary extends React.Component<
  EmailPreviewErrorBoundaryProps,
  EmailPreviewErrorBoundaryState
> {
  constructor(props: EmailPreviewErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(
    error: Error
  ): EmailPreviewErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Email preview render error:', error, errorInfo)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-4">
          <div className="border border-red-300 rounded-lg bg-red-50 p-6">
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              Email Preview Error
              {this.props.templateName && (
                <span className="font-normal text-red-600">
                  {' '}
                  — {this.props.templateName}
                </span>
              )}
            </h3>
            <p className="text-red-700 mb-4">
              Failed to render the email template. This is likely due
              to missing or invalid props.
            </p>
            {this.state.error && (
              <details className="text-sm">
                <summary className="cursor-pointer text-red-600 hover:text-red-800 font-medium">
                  View error details
                </summary>
                <pre className="mt-2 p-3 bg-red-100 rounded text-red-900 overflow-auto text-xs">
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <>
                      {'\n\n'}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}
            <button
              onClick={() =>
                this.setState({ hasError: false, error: null })
              }
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default EmailPreviewErrorBoundary
