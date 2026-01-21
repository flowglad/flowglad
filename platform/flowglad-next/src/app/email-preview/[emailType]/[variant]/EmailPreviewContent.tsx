'use client'

import { Highlight, themes } from 'prism-react-renderer'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

type ViewType = 'preview' | 'html'

interface EmailPreviewContentProps {
  emailHtml: string
  title: string
}

/**
 * Format HTML with basic indentation for better readability.
 */
function formatHtml(html: string): string {
  let formatted = ''
  let indent = 0
  const tab = '  '
  const parts = html.split(/(<\/?[^>]+>)/g).filter(Boolean)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    if (trimmed.startsWith('<')) {
      const isClosingTag = trimmed.startsWith('</')
      const isSelfClosing =
        trimmed.endsWith('/>') ||
        /^<(meta|link|img|br|hr|input)\b/i.test(trimmed)
      const isDoctype = trimmed.startsWith('<!')

      if (isClosingTag) indent = Math.max(0, indent - 1)
      formatted += tab.repeat(indent) + trimmed + '\n'
      if (!isClosingTag && !isSelfClosing && !isDoctype) indent++
    } else {
      formatted += tab.repeat(indent) + trimmed + '\n'
    }
  }
  return formatted.trim()
}

/**
 * Email preview content with toggle between rendered preview and HTML source.
 * Replaces the view entirely when switching (not side-by-side).
 */
export function EmailPreviewContent({
  emailHtml,
  title,
}: EmailPreviewContentProps) {
  const [view, setView] = useState<ViewType>('preview')
  const formattedHtml = useMemo(
    () => formatHtml(emailHtml),
    [emailHtml]
  )

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {/* Header bar - matches existing design */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />

        {/* View toggle - in place of "Email Preview" text */}
        <div
          className="ml-2 inline-flex items-center gap-0.5"
          role="group"
          aria-label="Select view"
        >
          {(['preview', 'html'] as const).map((v) => {
            const isActive = v === view
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                )}
                aria-pressed={isActive}
              >
                {v === 'preview' ? 'Preview' : 'HTML'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content area - full replacement */}
      {view === 'preview' ? (
        <iframe
          srcDoc={emailHtml}
          className="w-full min-h-[800px] border-0"
          title={title}
        />
      ) : (
        <div className="bg-white min-h-[800px] overflow-auto">
          <Highlight
            theme={themes.vsLight}
            code={formattedHtml}
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
                className={cn(className, 'p-4 text-xs')}
                style={{
                  ...style,
                  margin: 0,
                  background: 'transparent',
                }}
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
        </div>
      )}
    </div>
  )
}
