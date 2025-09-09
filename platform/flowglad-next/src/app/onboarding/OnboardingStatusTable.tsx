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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
      <div className="flex flex-row items-center justify-between border border-border rounded-lg bg-card py-4 px-4">
        <div className="flex flex-col justify-start w-full">
          <p className="font-normal text-foreground pb-1">{title}</p>
          <OnboardingItemDescriptionLabel>
            {description}
          </OnboardingItemDescriptionLabel>
          {children}
        </div>
        {actionNode || action ? (
          <div className="flex flex-row items-start justify-end">
            {completed ? (
              <div className="rounded-full bg-green-600 text-white p-2 justify-end items-end">
                <Check size={20} strokeWidth={2} />
              </div>
            ) : (
              actionNode || (
                <Button onClick={onClick}>{action}</Button>
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
    <div className="flex flex-col gap-2 py-2 bg-muted rounded-b-lg w-full">
      <div className="flex flex-row items-center gap-2 text-sm font-mono bg-card border border-border p-4 rounded-md w-full justify-between">
        <Markdown className={'max-w-[500px] overflow-x-scroll'}>
          {markdownText}
        </Markdown>
        <Button
          size="sm"
          className="font-sans"
          onClick={() => {
            toast.success('Copied to clipboard')
            navigator.clipboard.writeText(markdownText)
          }}
        >
          <Copy className="w-5 h-5 mr-2" />
          Copy
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
      <div className="flex flex-row gap-2">
        <Tabs
          value={selectedSection}
          onValueChange={setSelectedSection}
          className="w-full flex border-b border-muted font-normal"
        >
          <TabsList className="gap-8">
            {sections.map((section) => (
              <TabsTrigger
                key={section.title}
                value={section.title}
                className="h-full first:pl-0 last:pr-0 first:ml-0 last:mr-0 text-sm"
              >
                {section.title}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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

const NEXT_INSTALL_COMMAND = `pnpm install @flowglad/nextjs`
const REACT_INSTALL_COMMAND = `pnpm install @flowglad/react @flowglad/server`

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
    url: core.safeUrl('/mcp', process.env.NEXT_PUBLIC_APP_URL!),
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
              title: 'Next.js projects',
              code: NEXT_INSTALL_COMMAND,
            },
            {
              title: 'All other React projects',
              code: REACT_INSTALL_COMMAND,
            },
          ]}
        />
      </OnboardingStatusRow>
      <OnboardingStatusRow
        key={'integrate-flowglad'}
        completed={false}
        title={'3. Integrate Flowglad'}
        description={'Get set up in localhost in a few minutes'}
        actionNode={
          <div className="flex flex-row items-end justify-center gap-2">
            <Button
              onClick={() => {
                window.open(
                  'https://docs.flowglad.com/setup-by-prompt#2-one-shot-integration',
                  '_blank'
                )
              }}
            >
              Setup by Prompt
            </Button>
            <Button
              onClick={() => {
                window.open(
                  'https://docs.flowglad.com/quickstart#4-server-setup',
                  '_blank'
                )
              }}
              className="border-border bg-background hover:bg-accent"
              variant="outline"
            >
              Setup Manually
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
