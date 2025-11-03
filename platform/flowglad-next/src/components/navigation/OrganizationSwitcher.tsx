'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { trpc } from '@/app/_trpc/client'
import { useAuthContext } from '@/contexts/authContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react'
import CreateOrganizationModal from '@/components/forms/CreateOrganizationModal'

const OrganizationSwitcher = () => {
  const { organization } = useAuthContext()
  const [isOrgMenuOpen, setIsOrgMenuOpen] = useState(false)
  const [
    isCreateOrganizationModalOpen,
    setIsCreateOrganizationModalOpen,
  ] = useState(false)
  const isMobile = useIsMobile()

  const sheetContainer = useMemo(() => {
    if (!isMobile) return undefined
    return (
      (document.querySelector(
        '[data-sidebar="sidebar"][data-mobile="true"]'
      ) as HTMLElement) || undefined
    )
  }, [isMobile])

  const { invalidate: invalidateTRPC } = trpc.useUtils()
  const focusedMembership =
    trpc.organizations.getFocusedMembership.useQuery()
  const organizations = trpc.organizations.getOrganizations.useQuery()
  const updateFocusedMembership =
    trpc.organizations.updateFocusedMembership.useMutation({
      onSuccess: async () => {
        await invalidateTRPC()
        await focusedMembership.refetch()
      },
    })

  return (
    <>
      <Popover open={isOrgMenuOpen} onOpenChange={setIsOrgMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            role="combobox"
            aria-expanded={isOrgMenuOpen}
            aria-label="Switch organization"
            className="p-1"
            disabled={updateFocusedMembership.isPending}
          >
            {updateFocusedMembership.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronsUpDown className="h-4 w-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-64 p-0.5 pointer-events-auto"
          align="end"
          container={sheetContainer}
          onInteractOutside={(e) => {
            // Prevent closing when clicking on Sheet overlay, but allow normal outside clicks
            const target = e.target as HTMLElement
            if (target.closest('[data-radix-dialog-overlay]')) {
              e.preventDefault()
            }
          }}
        >
          <div className="flex flex-col rounded-md overflow-hidden">
            <Command>
              <CommandList className="max-h-64 overflow-auto">
                <CommandEmpty>No organizations found.</CommandEmpty>
                <CommandGroup>
                  {organizations.data?.map((org) => (
                    <CommandItem
                      key={org.id}
                      value={`${org.id} ${org.name}`}
                      keywords={[org.name]}
                      className="cursor-pointer px-2 py-2 rounded-sm data-[selected=true]:bg-accent"
                      onSelect={async () => {
                        if (org.id !== organization?.id) {
                          await updateFocusedMembership.mutateAsync({
                            organizationId: org.id,
                          })
                        }
                        setIsOrgMenuOpen(false)
                      }}
                    >
                      {org.logoURL ? (
                        <Image
                          className="rounded-full object-cover h-4 w-4 bg-white"
                          alt={org.name}
                          src={org.logoURL}
                          width={16}
                          height={16}
                        />
                      ) : (
                        <div className="h-4 w-4 rounded-full bg-muted-foreground/20" />
                      )}
                      <span className="truncate">{org.name}</span>
                      <Check
                        className={
                          organization?.id === org.id
                            ? 'ml-auto opacity-100 h-4 w-4'
                            : 'ml-auto opacity-0 h-4 w-4'
                        }
                      />
                    </CommandItem>
                  ))}
                  <CommandItem
                    value="create-organization"
                    className="cursor-pointer px-2 py-2 rounded-sm data-[selected=true]:bg-accent"
                    onSelect={() => {
                      setIsOrgMenuOpen(false)
                      setIsCreateOrganizationModalOpen(true)
                    }}
                  >
                    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-muted-foreground/40">
                      <Plus className="h-3 w-3" />
                    </div>
                    <span className="truncate">
                      Create New Organization
                    </span>
                    <Check className="ml-auto h-4 w-4 opacity-0" />
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </PopoverContent>
      </Popover>

      <CreateOrganizationModal
        isOpen={isCreateOrganizationModalOpen}
        setIsOpen={setIsCreateOrganizationModalOpen}
      />
    </>
  )
}

export default OrganizationSwitcher
