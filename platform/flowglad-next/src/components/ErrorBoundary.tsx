// ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

//There's no official way to create a true error boundary with function
// components in React. The reason is that error boundaries need to
// catch errors during rendering, and the React team hasn't yet provided
// a hooks-based API for this specific functionality.
class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error caught by ErrorBoundary:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-3 bg-gray-100 rounded-md text-xs text-gray-600">
            Unable to display component
          </div>
        )
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
