'use client'
import { useState } from 'react'
import { useAuthenticatedContext } from '@/contexts/authContext'
import { DetailLabel } from '@/components/DetailLabel'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import { OrganizationMembersDataTable } from '@/app/settings/teammates/data-table'
import InviteUserToOrganizationModal from '@/components/forms/InviteUserToOrganizationModal'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import FormModal from '@/components/forms/FormModal'
import { useFormContext } from 'react-hook-form'
import {
  FormField,
  FormItem,
  FormControl,
} from '@/components/ui/form'
import { z } from 'zod'
import analyzeCodebasePrompt from '@/prompts/analyze-codebase.md'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { cursorDeepLink } from '@/utils/cursor'

const codebaseMarkdownSchema = z.object({
  markdown: z.string(),
})

type CodebaseMarkdownFormData = z.infer<typeof codebaseMarkdownSchema>

const CodebaseMarkdownFormFields = () => {
  const form = useFormContext<CodebaseMarkdownFormData>()
  const copyPromptHandler = useCopyTextHandler({
    text: analyzeCodebasePrompt,
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyPromptHandler}
        >
          Copy analysis prompt
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            window.open(
              cursorDeepLink(analyzeCodebasePrompt),
              '_blank', 'noopener,noreferrer'
            )
          }}
        >
          Open prompt in Cursor
        </Button>
      </div>
      <FormField
        control={form.control}
        name="markdown"
        render={({ field }) => (
          <FormItem className="mb-0">
            <FormControl>
              <Textarea
                {...field}
                placeholder="Enter your codebase overview..."
                className="font-mono text-sm"
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  )
}

const OrganizationSettingsTab = () => {
  const { organization } = useAuthenticatedContext()
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [isCodebaseModalOpen, setIsCodebaseModalOpen] =
    useState(false)

  const utils = trpc.useUtils()

  const updateOrganizationMutation =
    trpc.organizations.update.useMutation({
      onSuccess: () => {
        toast.success('Organization settings updated successfully')
      },
      onError: (error) => {
        toast.error('Failed to update organization settings')
      },
    })

  const { data: codebaseMarkdown, isLoading: isLoadingMarkdown } =
    trpc.organizations.getCodebaseMarkdown.useQuery()

  const updateCodebaseMarkdownMutation =
    trpc.organizations.updateCodebaseMarkdown.useMutation({
      onSuccess: () => {
        toast.success('Codebase overview updated successfully')
        utils.organizations.getCodebaseMarkdown.invalidate()
      },
      onError: (error) => {
        toast.error('Failed to update codebase overview')
      },
    })

  if (!organization) {
    return <div>Loading...</div>
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex flex-col gap-6">
          <DetailLabel label="Name" value={organization.name} />
          <div className="flex flex-col gap-0.5">
            <div className="text-xs font-medium text-muted-foreground">
              ID
            </div>
            <CopyableTextTableCell copyText={organization.id}>
              {organization.id}
            </CopyableTextTableCell>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="multiple-subscriptions">
                  Allow Multiple Subscriptions Per Customer
                </Label>
                <div className="text-xs text-muted-foreground">
                  Enable customers to have multiple active
                  subscriptions simultaneously
                </div>
              </div>
              <Switch
                id="multiple-subscriptions"
                checked={
                  organization.allowMultipleSubscriptionsPerCustomer ??
                  false
                }
                onCheckedChange={(checked) => {
                  updateOrganizationMutation.mutate({
                    organization: {
                      id: organization.id,
                      allowMultipleSubscriptionsPerCustomer: checked,
                    },
                  })
                }}
                disabled={updateOrganizationMutation.isPending}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <OrganizationMembersDataTable
          title="Team"
          onInviteMember={() => setIsInviteModalOpen(true)}
        />
        <InviteUserToOrganizationModal
          isOpen={isInviteModalOpen}
          setIsOpen={setIsInviteModalOpen}
        />
      </div>

      <div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="codebase-markdown">
              Codebase Overview
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCodebaseModalOpen(true)}
            >
              Edit
            </Button>
          </div>
          <Textarea
            id="codebase-markdown"
            readOnly
            value={
              isLoadingMarkdown
                ? 'Loading...'
                : (codebaseMarkdown ?? '')
            }
            placeholder="No codebase overview available"
            className="min-h-[200px] font-mono text-sm"
          />
        </div>
      </div>

      <FormModal<CodebaseMarkdownFormData>
        isOpen={isCodebaseModalOpen}
        setIsOpen={setIsCodebaseModalOpen}
        title="Edit Codebase Overview"
        formSchema={codebaseMarkdownSchema}
        defaultValues={{
          markdown: codebaseMarkdown ?? '',
        }}
        onSubmit={async (data) => {
          await updateCodebaseMarkdownMutation.mutateAsync({
            markdown: data.markdown,
          })
        }}
        wide
      >
        <CodebaseMarkdownFormFields />
      </FormModal>
    </div>
  )
}

export default OrganizationSettingsTab
