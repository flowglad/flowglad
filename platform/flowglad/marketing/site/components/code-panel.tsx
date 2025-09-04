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
  new FlowgladServer({ supabaseAuth: { createClient } })
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

  return (
    <div className="w-full max-w-2xl">
      <Tabs defaultValue="checkout" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/30">
          <TabsTrigger value="checkout" className="text-xs">
            CheckoutButton.tsx
          </TabsTrigger>
          <TabsTrigger value="api" className="text-xs">
            /api/flowglad/[...path]/route.tsx
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checkout" className="mt-2">
          <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
            <div className="absolute right-2 top-2 z-10">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() =>
                  copyToClipboard(checkoutCode, 'checkout')
                }
              >
                {copiedTab === 'checkout' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Highlight
                theme={themes.vsDark}
                code={checkoutCode}
                language="tsx"
              >
                {({
                  className,
                  style,
                  tokens,
                  getLineProps,
                  getTokenProps,
                }) => (
                  <pre
                    className={`${className} p-4 text-sm`}
                    style={style}
                  >
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        {line.map((token, key) => (
                          <span
                            key={key}
                            {...getTokenProps({ token })}
                          />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="api" className="mt-2">
          <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
            <div className="absolute right-2 top-2 z-10">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => copyToClipboard(apiCode, 'api')}
              >
                {copiedTab === 'api' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Highlight
                theme={themes.vsDark}
                code={apiCode}
                language="tsx"
              >
                {({
                  className,
                  style,
                  tokens,
                  getLineProps,
                  getTokenProps,
                }) => (
                  <pre
                    className={`${className} p-4 text-sm`}
                    style={style}
                  >
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        {line.map((token, key) => (
                          <span
                            key={key}
                            {...getTokenProps({ token })}
                          />
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
