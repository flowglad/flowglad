'use client'
import { Check, Clock, Copy } from 'lucide-react'
import { useState } from 'react'
import Markdown from 'react-markdown'
import { trpc } from '@/app/_trpc/client'
import ErrorLabel from '@/components/ErrorLabel'
import CreatePricingModelModal from '@/components/forms/CreatePricingModelModal'
import { CursorLogo } from '@/components/icons/CursorLogo'
import { Button } from '@/components/ui/button'
import { useAuthContext } from '@/contexts/authContext'
import { cn } from '@/lib/utils'
import {
  type OnboardingChecklistItem,
  OnboardingItemType,
} from '@/types'
import core from '@/utils/core'

interface OnboardingStatusRowProps extends OnboardingChecklistItem {
  onClick?: () => void
  children?: React.ReactNode
  actionNode?: React.ReactNode
}

const OnboardingItemDescriptionLabel = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return typeof children === 'string' ? (
    <p className="text-sm text-muted-foreground">{children}</p>
  ) : (
    children
  )
}

const OnboardingStatusRow = ({
  completed,
  inReview,
  title,
  description,
  action,
  onClick,
  children,
  actionNode,
}: OnboardingStatusRowProps) => {
  return (
    <>
      <div className="flex flex-col gap-6 border border-border rounded-[4px] bg-card p-6">
        <div className="flex flex-col justify-start w-full gap-3">
          <div className="flex flex-col gap-1">
            <div className="w-6 h-6 bg-secondary rounded-full flex items-center justify-center">
              <p className="text-sm text-secondary-foreground">
                {title.match(/^\d+/)?.[0] || ''}
              </p>
            </div>
            <p className="text-foreground">
              {title.replace(/^\d+\.\s*/, '')}
            </p>
            <OnboardingItemDescriptionLabel>
              {description}
            </OnboardingItemDescriptionLabel>
          </div>
          {children}
        </div>
        {actionNode || action ? (
          <div className="flex flex-col">
            {completed ? (
              <div className="flex justify-start">
                <div className="rounded-full bg-green-600 text-white p-2">
                  <Check size={20} strokeWidth={2} />
                </div>
              </div>
            ) : inReview ? (
              <div className="flex flex-col items-start gap-3">
                <div className="rounded-full bg-yellow-500 text-white p-2">
                  <Clock size={20} strokeWidth={2} />
                </div>
                <p className="text-sm text-muted-foreground">
                  We're currently reviewing your account.
                </p>
              </div>
            ) : (
              actionNode || (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={onClick}
                >
                  {action}
                </Button>
              )
            )}
          </div>
        ) : null}
      </div>
    </>
  )
}

const OnboardingCodeblock = ({
  markdownText,
  isJson = false,
}: {
  markdownText: string
  isJson?: boolean
}) => {
  return (
    // Note: Do not add padding to this container div
    // Instead, padding should be added to the child elements below (pre and Markdown)
    <div className="relative w-full rounded-[4px] border bg-card">
      {isJson ? (
        <pre className="overflow-x-auto text-sm font-mono whitespace-pre-wrap p-2">
          {markdownText}
        </pre>
      ) : (
        <Markdown className="overflow-x-auto text-sm font-mono p-2">
          {markdownText}
        </Markdown>
      )}
    </div>
  )
}

const CodeblockGroup = ({
  sections,
}: {
  sections: {
    title: string
    code: string
  }[]
}) => {
  const [selectedSection, setSelectedSection] = useState<string>(
    sections[0].title
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-0">
        {sections.map((section) => (
          <Button
            key={section.title}
            variant="ghost"
            onClick={() => setSelectedSection(section.title)}
            className={cn(
              // Base styling
              'px-3 py-1 text-sm transition-all duration-200 rounded-[4px]',
              // Active/inactive styling
              selectedSection === section.title
                ? 'bg-accent text-foreground' // Active state
                : 'text-muted-foreground hover:bg-accent hover:text-foreground' // Inactive state
            )}
          >
            {section.title}
          </Button>
        ))}
      </div>
      {sections.map((section) => (
        <div
          key={section.title}
          className={cn(
            'flex flex-col gap-2',
            selectedSection === section.title ? 'block' : 'hidden'
          )}
        >
          <OnboardingCodeblock markdownText={section.code} />
        </div>
      ))}
    </div>
  )
}

const OnboardingStatusTable = ({
  onboardingChecklistItems,
  secretApiKey,
  pricingModelsCount,
}: {
  onboardingChecklistItems: OnboardingChecklistItem[]
  secretApiKey: string
  pricingModelsCount: number
}) => {
  const [
    isCreatePricingModelModalOpen,
    setIsCreatePricingModelModalOpen,
  ] = useState(false)
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false)
  const [isMcpConfigCopied, setIsMcpConfigCopied] = useState(false)
  const [stripeConnectError, setStripeConnectError] = useState<
    string | undefined
  >()
  const apiKeyText = `FLOWGLAD_SECRET_KEY="${secretApiKey}"`
  const { organization } = useAuthContext()
  const requestStripeConnect =
    trpc.organizations.requestStripeConnect.useMutation()
  if (!organization) {
    return null
  }

  // MCP configuration for copying (full mcp.json format)
  const mcpConfigForCopy = {
    mcpServers: {
      flowglad: {
        url: 'https://app.flowglad.com/api/mcp',
        headers: {
          Authorization: `Bearer ${secretApiKey}`,
          Accept: 'application/json, text/event-stream',
        },
      },
    },
  }

  // Generate Cursor deep link
  const generateCursorDeepLink = () => {
    const configJson = JSON.stringify({
      url: core.safeUrl('/api/mcp', core.NEXT_PUBLIC_APP_URL),
      headers: {
        Authorization: `Bearer ${secretApiKey}`,
        Accept: 'application/json, text/event-stream',
      },
    })
    const base64Config = btoa(configJson)
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=flowglad&config=${encodeURIComponent(base64Config)}`
  }

  const cursorDeepLink = generateCursorDeepLink()
  const mcpConfigText = JSON.stringify(mcpConfigForCopy, null, 2)

  return (
    <div className="flex flex-col w-full gap-4">
      <OnboardingStatusRow
        key={'copy-keys'}
        completed={false}
        title={'1. Copy API Key'}
        description={'Add your secret key to .env'}
      >
        <OnboardingCodeblock markdownText={apiKeyText} />
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            navigator.clipboard.writeText(apiKeyText)
            setIsApiKeyCopied(true)
            setTimeout(() => setIsApiKeyCopied(false), 2000)
          }}
        >
          {isApiKeyCopied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy
            </>
          )}
        </Button>
      </OnboardingStatusRow>
      <OnboardingStatusRow
        key={'create-pricing-model'}
        completed={pricingModelsCount > 1}
        title={'2. Define Your Pricing'}
        description={'Set up products, plans, and features.'}
        actionNode={
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setIsCreatePricingModelModalOpen(true)}
          >
            Create Pricing Model
          </Button>
        }
      />
      {onboardingChecklistItems.map((item, index) => {
        if (item.type === OnboardingItemType.Stripe) {
          return (
            <OnboardingStatusRow
              key={item.title}
              completed={item.completed}
              inReview={item.inReview}
              title={`${index + 3}. ${item.title}`}
              description={item.description}
              type={item.type}
              actionNode={
                <div className="flex flex-col gap-2">
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={requestStripeConnect.isPending}
                    onClick={async () => {
                      setStripeConnectError(undefined)
                      try {
                        const { onboardingLink } =
                          await requestStripeConnect.mutateAsync({
                            CountryId: organization.countryId,
                          })
                        window.location.href = onboardingLink
                      } catch (error) {
                        setStripeConnectError(
                          error instanceof Error
                            ? error.message
                            : 'Failed to connect Stripe'
                        )
                      }
                    }}
                  >
                    {requestStripeConnect.isPending
                      ? 'Connecting...'
                      : item.action}
                  </Button>
                  {stripeConnectError && (
                    <ErrorLabel
                      error={{
                        message: stripeConnectError,
                        type: 'manual',
                      }}
                    />
                  )}
                </div>
              }
            />
          )
        }

        return (
          <OnboardingStatusRow
            key={item.title}
            completed={item.completed}
            inReview={item.inReview}
            title={`${index + 3}. ${item.title}`}
            description={item.description}
            action={item.action}
            type={item.type}
          />
        )
      })}
      <OnboardingStatusRow
        key={'add-flowglad-mcp-server'}
        completed={false}
        title={`${3 + onboardingChecklistItems.length}. Install MCP Server`}
        description={
          'Use our MCP server for easy and precise integrations with your codebase'
        }
        actionNode={
          <div className="flex flex-col gap-2">
            <OnboardingCodeblock
              markdownText={mcpConfigText}
              isJson={true}
            />
            <div className="flex flex-row gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  navigator.clipboard.writeText(mcpConfigText)
                  setIsMcpConfigCopied(true)
                  setTimeout(() => setIsMcpConfigCopied(false), 2000)
                }}
              >
                {isMcpConfigCopied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  window.location.href = cursorDeepLink
                }}
              >
                Add to
                <CursorLogo />
              </Button>
            </div>
          </div>
        }
      />
      <CreatePricingModelModal
        isOpen={isCreatePricingModelModalOpen}
        setIsOpen={setIsCreatePricingModelModalOpen}
      />
    </div>
  )
}

export default OnboardingStatusTable
