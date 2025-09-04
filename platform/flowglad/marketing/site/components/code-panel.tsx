'use client'

import { useState } from 'react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'
import { motion } from 'framer-motion'

const checkoutCode = `import { useBilling } from '@flowglad/nextjs'

function CheckoutButton() {
  const { createCheckoutSession, catalog } = useBilling()

  const onClickUpgrade = () => createCheckoutSession({
    priceId: catalog.products[0].defaultPrice.id,
    autoRedirect: true
  })

  return <button onClick={onClickUpgrade}>
    Upgrade
  </button>
}`

const apiCode = `import { createAppRouterRouteHandler, FlowgladServer } from '@flowglad/nextjs/server'

const handler = createAppRouterRouteHandler(
  new Flowglad({ supabaseAuth: { createClient } })
)

export { handler as GET, handler as POST }`

export default function CodePanel() {
  const [copiedTab, setCopiedTab] = useState<string | null>(null)

  const copyToClipboard = async (code: string, tabId: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedTab(tabId)
      setTimeout(() => setCopiedTab(null), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const renderCode = (
    code: string,
    language: string,
    tabId: string
  ) => (
    <div className="relative rounded-xl bg-[#0d0d0d] border border-zinc-800 overflow-hidden">
      {/* Copy button with aria-live for accessibility */}
      <div className="absolute right-3 top-3 z-10">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-zinc-800/50"
          onClick={() => copyToClipboard(code, tabId)}
          aria-label={copiedTab === tabId ? 'Copied!' : 'Copy code'}
        >
          {copiedTab === tabId ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {copiedTab === tabId && 'Code copied to clipboard'}
        </span>
      </div>

      {/* Code with line numbers */}
      <div className="overflow-x-auto">
        <Highlight
          theme={themes.vsDark}
          code={code}
          language={language}
        >
          {({
            className,
            style,
            tokens,
            getLineProps,
            getTokenProps,
          }) => (
            <pre
              className={`${className} p-4 text-sm leading-relaxed`}
              style={{ ...style, background: 'transparent' }}
            >
              {tokens.map((line, i) => (
                <div
                  key={i}
                  {...getLineProps({ line })}
                  className="table-row"
                >
                  <span className="table-cell text-zinc-600 select-none pr-4 text-right">
                    {i + 1}
                  </span>
                  <span className="table-cell">
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )

  return (
    <motion.div
      className="w-full lg:sticky lg:top-20"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Tabs defaultValue="client" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-zinc-900/50 border border-zinc-800">
          <TabsTrigger
            value="client"
            className="text-xs data-[state=active]:bg-zinc-800 transition-colors"
          >
            CheckoutButton.tsx
          </TabsTrigger>
          <TabsTrigger
            value="server"
            className="text-xs data-[state=active]:bg-zinc-800 transition-colors"
          >
            /api/flowglad/[...path]/route.tsx
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="client"
          className="mt-4 focus-visible:outline-none"
        >
          {renderCode(checkoutCode, 'tsx', 'checkout')}
        </TabsContent>

        <TabsContent
          value="server"
          className="mt-4 focus-visible:outline-none"
        >
          {renderCode(apiCode, 'tsx', 'api')}
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
