'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import Button from '@/components/ion/Button'
import {
  Nouns,
  OnboardingChecklistItem,
  OnboardingItemType,
  Verbs,
} from '@/types'
import {
  ArrowUpRight,
  ArrowUpRightFromSquare,
  Check,
  Copy,
} from 'lucide-react'
import NounVerbModal from '@/components/forms/NounVerbModal'
import RequestStripeConnectOnboardingLinkModal from '@/components/forms/RequestStripeConnectOnboardingLinkModal'
import { Country } from '@/db/schema/countries'
import Markdown from 'react-markdown'
import Link from 'next/link'
import { cn } from '@/utils/core'
import { Tab, Tabs, TabsList } from '@/components/ion/Tab'

interface OnboardingStatusRowProps extends OnboardingChecklistItem {
  onClick?: () => void
  children?: React.ReactNode
}

const OnboardingItemDescriptionLabel = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return typeof children === 'string' ? (
    <p className="text-sm text-subtle">{children}</p>
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
}: OnboardingStatusRowProps) => {
  return (
    <>
      <div className="flex flex-row items-center justify-between first:rounded-t-lg last:rounded-b-lg bg-background-input py-4 border first:border-b-0 first:border-t-0 last:border-t-0 border-stroke-subtle border-l-0 border-r-0 px-4">
        <div className="flex flex-col justify-start w-full">
          <p className="font-medium text-foreground pb-1">{title}</p>
          <OnboardingItemDescriptionLabel>
            {description}
          </OnboardingItemDescriptionLabel>
          {children}
        </div>
        {action && (
          <div className="flex flex-row items-start justify-end p-4">
            {completed ? (
              <div className="rounded-full bg-green-500  p-2 justify-end items-end">
                <Check size={20} strokeWidth={2} />
              </div>
            ) : (
              <Button onClick={onClick}>{action}</Button>
            )}
          </div>
        )}
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
    <div className="flex flex-col gap-2 py-2 bg-background-input rounded-b-lg w-full">
      <div className="flex flex-row items-center gap-2 text-sm font-mono bg-background p-4 rounded-md w-full justify-between">
        <Markdown className={'max-w-[500px] overflow-x-scroll'}>
          {markdownText}
        </Markdown>
        <Button
          iconLeading={<Copy />}
          size="sm"
          onClick={() => {
            toast.success('Copied to clipboard')
            navigator.clipboard.writeText(markdownText)
          }}
        />
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
  const [selectedSection, setSelectedSection] = useState<
    string | undefined
  >(sections[0].title)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-2">
        <Tabs className="w-full flex border-b border-stroke-subtle font-semibold">
          <TabsList className="gap-8">
            {sections.map((section) => (
              <Tab
                key={section.title}
                value={section.title}
                onClick={() => setSelectedSection(section.title)}
                state={
                  selectedSection === section.title
                    ? 'selected'
                    : 'default'
                }
                title={section.title}
                className="h-full first:pl-0 last:pr-0 first:ml-0 last:mr-0 text-sm"
              >
                {section.title}
              </Tab>
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

  return (
    <div className="flex flex-col border border-stroke-subtle rounded-lg w-full">
      <OnboardingStatusRow
        key={'copy-keys'}
        completed={false}
        title={'Copy your keys'}
        description={'Copy these keys to your local .env file'}
      >
        <OnboardingCodeblock markdownText={apiKeyText} />
      </OnboardingStatusRow>
      <OnboardingStatusRow
        key={'install-packages'}
        completed={false}
        title={'Install packages'}
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
        key={'complete-setup'}
        completed={false}
        title={'Integrate Flowglad'}
        description={'Get set up in localhost in a few minutes'}
      >
        <OnboardingItemDescriptionLabel>
          <Link
            href="https://docs.flowglad.com/quickstart#4-server-setup"
            className="text-sm my-4 flex flex-row items-center gap-2"
          >
            <p>Step-by-step setup.</p>
            <ArrowUpRightFromSquare size={16} />
          </Link>
        </OnboardingItemDescriptionLabel>
        <OnboardingItemDescriptionLabel>
          <Link
            href="https://docs.flowglad.com/setup-by-prompt#2-one-shot-integration"
            className="text-sm my-4 flex flex-row items-center gap-2"
          >
            One shot integration via prompt (Next.js only for now).
            <ArrowUpRightFromSquare size={16} />
          </Link>
        </OnboardingItemDescriptionLabel>
      </OnboardingStatusRow>
      {onboardingChecklistItems.map((item) => (
        <OnboardingStatusRow
          key={item.title}
          completed={item.completed}
          title={item.title}
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
