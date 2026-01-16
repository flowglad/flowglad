'use client'

import { render } from '@react-email/render'
import {
  Check,
  Code,
  Copy,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// ============================================================================
// Types & Constants
// ============================================================================

type ViewportSize = 'desktop' | 'tablet' | 'mobile'

const VIEWPORT_WIDTHS: Record<ViewportSize, number> = {
  desktop: 600, // Standard email width
  tablet: 480,
  mobile: 320,
}

const VIEWPORT_LABELS: Record<ViewportSize, string> = {
  desktop: 'Desktop (600px)',
  tablet: 'Tablet (480px)',
  mobile: 'Mobile (320px)',
}

/** Interval for polling iframe height as a fallback (ms) */
const HEIGHT_POLL_INTERVAL = 500

interface EmailPreviewWrapperProps {
  /** The email template file name (e.g., 'customer-subscription-created') */
  templateName: string
  /** A description of the scenario being previewed */
  scenario: string
  /** Whether this preview is showing test mode (non-live) */
  testMode?: boolean
  /** The email subject line */
  subject?: string
  /** The email preview text */
  previewText?: string
  /** The email template component to render */
  children: React.ReactElement
}

// ============================================================================
// Sub-components
// ============================================================================

/** Loading skeleton that mimics email layout */
const EmailSkeleton = () => (
  <div className="p-6 space-y-4 bg-white">
    {/* Header */}
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
    {/* Title */}
    <Skeleton className="h-6 w-48 mt-6" />
    {/* Body paragraphs */}
    <div className="space-y-2 mt-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
    {/* Detail section */}
    <div className="space-y-2 mt-6 p-4 bg-gray-50 rounded">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-4 w-44" />
    </div>
    {/* Button */}
    <Skeleton className="h-10 w-40 mt-6 rounded-md" />
    {/* Signature */}
    <div className="space-y-2 mt-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-28" />
    </div>
  </div>
)

/** Viewport size toggle buttons */
const ViewportToggle = ({
  currentSize,
  onSizeChange,
}: {
  currentSize: ViewportSize
  onSizeChange: (size: ViewportSize) => void
}) => (
  <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/50">
    {(Object.keys(VIEWPORT_WIDTHS) as ViewportSize[]).map((size) => (
      <Tooltip key={size}>
        <TooltipTrigger asChild>
          <Button
            variant={currentSize === size ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onSizeChange(size)}
            aria-label={VIEWPORT_LABELS[size]}
          >
            {size === 'desktop' && <Monitor className="h-4 w-4" />}
            {size === 'tablet' && <Tablet className="h-4 w-4" />}
            {size === 'mobile' && <Smartphone className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {VIEWPORT_LABELS[size]}
        </TooltipContent>
      </Tooltip>
    ))}
  </div>
)

/** Code view toggle button */
const CodeToggle = ({
  showCode,
  onToggle,
}: {
  showCode: boolean
  onToggle: () => void
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant={showCode ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 gap-1.5"
        onClick={onToggle}
        aria-label={
          showCode ? 'Hide HTML source' : 'View HTML source'
        }
      >
        <Code className="h-4 w-4" />
        <span className="text-xs">HTML</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">
      {showCode ? 'Hide HTML source' : 'View HTML source'}
    </TooltipContent>
  </Tooltip>
)

/** Copy HTML button */
const CopyButton = ({
  html,
  disabled,
}: {
  html: string
  disabled: boolean
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy HTML:', error)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5"
          onClick={handleCopy}
          disabled={disabled}
          aria-label="Copy HTML to clipboard"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          <span className="text-xs">
            {copied ? 'Copied!' : 'Copy'}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Copy HTML to clipboard
      </TooltipContent>
    </Tooltip>
  )
}

/** Email metadata panel */
const MetadataPanel = ({
  templateName,
  scenario,
  subject,
  previewText,
  testMode,
}: {
  templateName: string
  scenario: string
  subject?: string
  previewText?: string
  testMode: boolean
}) => (
  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border-b pb-4 mb-4">
    <div>
      <span className="text-muted-foreground">Template:</span>{' '}
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
        {templateName}
      </code>
    </div>
    <div>
      <span className="text-muted-foreground">Scenario:</span>{' '}
      <span className="font-medium">{scenario}</span>
    </div>
    {subject && (
      <div className="col-span-2">
        <span className="text-muted-foreground">Subject:</span>{' '}
        <span className="font-medium">{subject}</span>
      </div>
    )}
    {previewText && (
      <div className="col-span-2">
        <span className="text-muted-foreground">Preview text:</span>{' '}
        <span className="text-muted-foreground italic truncate">
          {previewText}
        </span>
      </div>
    )}
    {testMode && (
      <div className="col-span-2">
        <span className="inline-flex items-center px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
          TEST MODE
        </span>
      </div>
    )}
  </div>
)

/**
 * Format HTML with basic indentation for better readability.
 * This is a lightweight formatter - doesn't handle all edge cases
 * but works well for email HTML.
 */
const formatHtml = (html: string): string => {
  let formatted = ''
  let indent = 0
  const tab = '  '

  // Split by tags while keeping the tags
  const parts = html.split(/(<\/?[^>]+>)/g).filter(Boolean)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // Check if it's a tag
    if (trimmed.startsWith('<')) {
      const isClosingTag = trimmed.startsWith('</')
      const isSelfClosing =
        trimmed.endsWith('/>') ||
        /^<(meta|link|img|br|hr|input)\b/i.test(trimmed)
      const isDoctype = trimmed.startsWith('<!')

      if (isClosingTag) {
        indent = Math.max(0, indent - 1)
      }

      formatted += tab.repeat(indent) + trimmed + '\n'

      if (!isClosingTag && !isSelfClosing && !isDoctype) {
        indent++
      }
    } else {
      // It's text content
      formatted += tab.repeat(indent) + trimmed + '\n'
    }
  }

  return formatted.trim()
}

/** Syntax-highlighted HTML code viewer */
const SyntaxHighlightedCode = ({ code }: { code: string }) => {
  const formattedCode = useMemo(() => formatHtml(code), [code])

  return (
    <Highlight
      theme={themes.nightOwl}
      code={formattedCode}
      language="html"
    >
      {({
        className,
        style,
        tokens,
        getLineProps,
        getTokenProps,
      }) => (
        <pre
          className={cn(className, 'p-4 text-xs overflow-auto')}
          style={{ ...style, margin: 0, background: 'transparent' }}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              <span className="inline-block w-8 text-right mr-4 text-gray-500 select-none">
                {i + 1}
              </span>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Wrapper component for email template previews.
 * Renders email templates to HTML strings and displays them in an iframe
 * to avoid hydration errors from nested <html> elements.
 *
 * Features:
 * - Responsive viewport preview (desktop/tablet/mobile)
 * - HTML source code view
 * - Copy HTML to clipboard
 * - Email metadata display
 * - Dynamic iframe height adjustment with ResizeObserver + polling fallback
 */
export const EmailPreviewWrapper = ({
  templateName,
  scenario,
  testMode = false,
  subject,
  previewText,
  children,
}: EmailPreviewWrapperProps) => {
  const [html, setHtml] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [iframeHeight, setIframeHeight] = useState<number>(400)
  const [viewportSize, setViewportSize] =
    useState<ViewportSize>('desktop')
  const [showCode, setShowCode] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const pollIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null)

  /**
   * Create a stable key for the email template based on its identity.
   * This prevents unnecessary re-renders when parent components re-render
   * but the actual template hasn't changed.
   */
  const templateKey = useMemo(
    () => `${templateName}-${scenario}-${testMode}`,
    [templateName, scenario, testMode]
  )

  // Render email to HTML when template identity changes
  useEffect(() => {
    const renderEmail = async () => {
      setIsLoading(true)
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
    // Use templateKey as the stable dependency instead of children
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey])

  // Update iframe height when content changes
  const updateIframeHeight = useCallback(() => {
    const iframe = iframeRef.current
    if (iframe?.contentWindow?.document?.body) {
      const height = iframe.contentWindow.document.body.scrollHeight
      if (height > 0) {
        setIframeHeight(height + 20) // Add padding
      }
    }
  }, [])

  /** Clean up all observers and intervals */
  const cleanupObservers = useCallback(() => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect()
      resizeObserverRef.current = null
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  /**
   * Set up height observation with ResizeObserver.
   * Falls back to polling if ResizeObserver fails (e.g., cross-origin issues).
   */
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow?.document?.body) return

    // Initial height update
    updateIframeHeight()

    // Clean up any previous observers
    cleanupObservers()

    // Try to set up ResizeObserver for the iframe body
    try {
      resizeObserverRef.current = new ResizeObserver(() => {
        updateIframeHeight()
      })
      resizeObserverRef.current.observe(
        iframe.contentWindow.document.body
      )
    } catch (error) {
      // Fallback: use polling if ResizeObserver fails
      // This can happen due to cross-origin restrictions or browser issues
      console.warn(
        'ResizeObserver failed, falling back to polling:',
        error
      )
      pollIntervalRef.current = setInterval(
        updateIframeHeight,
        HEIGHT_POLL_INTERVAL
      )
    }
  }, [updateIframeHeight, cleanupObservers])

  // Cleanup observers on unmount
  useEffect(() => {
    return cleanupObservers
  }, [cleanupObservers])

  // Re-trigger height calculation when viewport changes
  useEffect(() => {
    // Small delay to let the iframe re-render
    const timer = setTimeout(updateIframeHeight, 100)
    return () => clearTimeout(timer)
  }, [viewportSize, updateIframeHeight])

  const currentWidth = VIEWPORT_WIDTHS[viewportSize]

  return (
    <div className="p-4">
      {/* Metadata Panel */}
      <MetadataPanel
        templateName={templateName}
        scenario={scenario}
        subject={subject}
        previewText={previewText}
        testMode={testMode}
      />

      {/* Toolbar - wrapped in single TooltipProvider for all tooltips */}
      <TooltipProvider>
        <div className="flex items-center justify-between mb-4">
          <ViewportToggle
            currentSize={viewportSize}
            onSizeChange={setViewportSize}
          />
          <div className="flex items-center gap-2">
            <CopyButton html={html} disabled={isLoading} />
            <CodeToggle
              showCode={showCode}
              onToggle={() => setShowCode(!showCode)}
            />
          </div>
        </div>
      </TooltipProvider>

      {/* Preview Container */}
      <div
        className={cn(
          'border rounded-lg overflow-hidden bg-gray-100 transition-all duration-200',
          showCode && 'grid grid-cols-2 gap-0'
        )}
      >
        {/* Email Preview */}
        <div
          className={cn(
            'flex justify-center bg-gray-100 p-4',
            showCode && 'border-r'
          )}
        >
          <div
            className="bg-white shadow-sm transition-all duration-200 overflow-hidden"
            style={{ width: currentWidth, maxWidth: '100%' }}
          >
            {isLoading ? (
              <EmailSkeleton />
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={html}
                title={`Email preview: ${scenario}`}
                aria-label={`Email preview showing ${scenario}`}
                className="w-full border-0"
                style={{ height: iframeHeight }}
                onLoad={handleIframeLoad}
              />
            )}
          </div>
        </div>

        {/* Code View with Syntax Highlighting */}
        {showCode && (
          <div className="bg-[#011627] overflow-auto max-h-[800px]">
            <SyntaxHighlightedCode code={html} />
          </div>
        )}
      </div>
    </div>
  )
}

export default EmailPreviewWrapper
