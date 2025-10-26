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
import { Country } from '@/db/schema/countries'
import Markdown from 'react-markdown'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
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
  title,
  description,
  action,
  onClick,
  children,
  actionNode,
}: OnboardingStatusRowProps) => {
  return (
    <>
      <div className="flex flex-col gap-6 border border-border rounded-[28px] bg-card p-6 shadow-medium">
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
}: {
  markdownText: string
}) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-row items-center gap-1 text-sm font-mono bg-card border border-border h-10 pl-4 pr-[1px] rounded-full w-full justify-between">
        <Markdown className={'flex-1 overflow-x-auto'}>
          {markdownText}
        </Markdown>
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
              'px-3 py-1 text-sm transition-all duration-200 rounded-full',
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
}: {
  onboardingChecklistItems: OnboardingChecklistItem[]
  countries: Country.Record[]
  secretApiKey: string
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
  const apiKeyText = `FLOWGLAD_SECRET_KEY="${secretApiKey}"`
  const mcpServerConfig = {
    url: core.safeUrl('/mcp', core.NEXT_PUBLIC_APP_URL),
    headers: {
      Authorization: `Bearer ${secretApiKey}`,
    },
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <OnboardingStatusRow
        key={'copy-keys'}
        completed={false}
        title={'1. Copy your keys'}
        description={'Copy these keys to your local .env file'}
      >
        <OnboardingCodeblock markdownText={apiKeyText} />
      </OnboardingStatusRow>
      <OnboardingStatusRow
        key={'install-packages'}
        completed={false}
        title={'2. Install packages'}
        description={''}
      >
        <CodeblockGroup
          sections={[
            {
              title: 'Next.js',
              code: NEXT_INSTALL_COMMAND,
            },
            {
              title: 'Other React',
              code: REACT_INSTALL_COMMAND,
            },
          ]}
        />
      </OnboardingStatusRow>
      <OnboardingStatusRow
        key={'integrate-flowglad'}
        completed={false}
        title={'3. Choose Integration Method'}
        description={''}
        actionNode={
          <div className="flex flex-row gap-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                window.open(
                  'https://docs.flowglad.com/setup-by-prompt#2-one-shot-integration',
                  '_blank'
                )
              }}
            >
              Prompt
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                window.open(
                  'https://docs.flowglad.com/quickstart#4-server-setup',
                  '_blank'
                )
              }}
            >
              Manually
            </Button>
          </div>
        }
      />
      {onboardingChecklistItems.map((item, index) => (
        <OnboardingStatusRow
          key={item.title}
          completed={item.completed}
          title={`${index + 4}. ${item.title}`}
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
      {/* Temporarily disabled MCP Server setup
      <OnboardingStatusRow
        key={'setup-flowglad-mcp-server'}
        completed={false}
        title={`5. Setup Flowglad MCP Server`}
        description={'Get set up in localhost in a few minutes'}
        actionNode={
          <a
            href={`https://cursor.com/install-mcp?name=flowglad&config=${encodeURIComponent(JSON.stringify(mcpServerConfig))}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* <img
              src="https://cursor.com/deeplink/mcp-install-light.svg"
              alt="Add flowglad MCP server to Cursor"
              height="40"
              style={{ height: '40px' }}
            />
          </a>
        }
      />
      */}
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
    </div>
  )
}

export default OnboardingStatusTable
