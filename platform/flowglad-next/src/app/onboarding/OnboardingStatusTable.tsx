'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Nouns,
  OnboardingChecklistItem,
  OnboardingItemType,
  Verbs,
} from '@/types'
import { Check, Copy } from 'lucide-react'
import NounVerbModal from '@/components/forms/NounVerbModal'
import RequestStripeConnectOnboardingLinkModal from '@/components/forms/RequestStripeConnectOnboardingLinkModal'
import CreatePricingModelModal from '@/components/forms/CreatePricingModelModal'
import { Country } from '@/db/schema/countries'
import Markdown from 'react-markdown'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import core from '@/utils/core'
import { CursorLogo } from '@/components/icons/CursorLogo'

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
              <div className="flex justify-center">
                <div className="rounded-full bg-green-600 text-white p-2">
                  <Check size={20} strokeWidth={2} />
                </div>
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
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-row items-center gap-1 text-sm font-mono bg-card border border-border min-h-10 p-4 rounded-[4px] w-full justify-between">
        {isJson ? (
          <pre className="flex-1 overflow-x-auto whitespace-pre-wrap text-xs">
            {markdownText}
          </pre>
        ) : (
          <Markdown className={'flex-1 overflow-x-auto'}>
            {markdownText}
          </Markdown>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          onClick={() => {
            toast.success('Copied to clipboard')
            navigator.clipboard.writeText(markdownText)
          }}
        >
          <Copy className="w-4 h-4" />
        </Button>
      </div>
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

const NEXT_INSTALL_COMMAND = `bun add @flowglad/nextjs`
const REACT_INSTALL_COMMAND = `bun add @flowglad/react @flowglad/server`

const OnboardingStatusTable = ({
  onboardingChecklistItems,
  countries,
  secretApiKey,
  pricingModelsCount,
}: {
  onboardingChecklistItems: OnboardingChecklistItem[]
  countries: Country.Record[]
  secretApiKey: string
  pricingModelsCount: number
}) => {
  const [isNounVerbModalOpen, setIsNounVerbModalOpen] =
    useState(false)
  const [nounVerb, setNounVerb] = useState<
    | {
        noun: Nouns
        verb: Verbs
      }
    | undefined
  >(undefined)
  const [
    isRequestStripeConnectOnboardingLinkModalOpen,
    setIsRequestStripeConnectOnboardingLinkModalOpen,
  ] = useState(false)
  const [
    isCreatePricingModelModalOpen,
    setIsCreatePricingModelModalOpen,
  ] = useState(false)
  const apiKeyText = `FLOWGLAD_SECRET_KEY="${secretApiKey}"`

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
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=flowglad&config=${base64Config}`
  }

  const cursorDeepLink = generateCursorDeepLink()
  const mcpConfigText = JSON.stringify(mcpConfigForCopy, null, 2)

  return (
    <div className="flex flex-col w-full gap-4">
      <OnboardingStatusRow
        key={'copy-keys'}
        completed={false}
        title={'1. Copy your key'}
        description={'Copy your secret key to your env vars'}
      >
        <OnboardingCodeblock markdownText={apiKeyText} />
      </OnboardingStatusRow>
      <OnboardingStatusRow
        key={'create-pricing-model'}
        completed={pricingModelsCount > 2}
        title={'2. Create pricing model'}
        description={
          'Create your first pricing model to define products, plans, and features.'
        }
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
      {onboardingChecklistItems.map((item, index) => (
        <OnboardingStatusRow
          key={item.title}
          completed={item.completed}
          title={`${index + 3}. ${item.title}`}
          description={item.description}
          action={item.action}
          type={item.type}
          onClick={() => {
            if (item.type === OnboardingItemType.Stripe) {
              setIsRequestStripeConnectOnboardingLinkModalOpen(true)
              return
            }

            if (item.type === OnboardingItemType.Product) {
              setNounVerb({ noun: Nouns.Product, verb: Verbs.Create })
            }
            if (item.type === OnboardingItemType.Discount) {
              setNounVerb({
                noun: Nouns.Discount,
                verb: Verbs.Create,
              })
            }
            setIsNounVerbModalOpen(true)
          }}
        />
      ))}
      <OnboardingStatusRow
        key={'add-flowglad-mcp-server'}
        completed={false}
        title={`${3 + onboardingChecklistItems.length}. Add Flowglad MCP Server`}
        description={
          'Add Flowglad as an MCP server in Cursor to enable AI-powered integration assistance.'
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
                  toast.success('Configuration copied to clipboard')
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Config
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
      <NounVerbModal
        isOpen={isNounVerbModalOpen}
        setIsOpen={setIsNounVerbModalOpen}
        nounVerb={nounVerb}
      />
      <RequestStripeConnectOnboardingLinkModal
        isOpen={isRequestStripeConnectOnboardingLinkModalOpen}
        setIsOpen={setIsRequestStripeConnectOnboardingLinkModalOpen}
        countries={countries}
      />
      <CreatePricingModelModal
        isOpen={isCreatePricingModelModalOpen}
        setIsOpen={setIsCreatePricingModelModalOpen}
      />
    </div>
  )
}

export default OnboardingStatusTable
