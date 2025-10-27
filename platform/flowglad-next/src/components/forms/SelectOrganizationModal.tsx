'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { trpc } from '@/app/_trpc/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'

interface SelectOrganizationModalProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  /** Optional element that should open the dialog when clicked */
  trigger?: React.ReactNode
}

export const SelectOrganizationModal: React.FC<SelectOrganizationModalProps> = ({
  isOpen,
  setIsOpen,
  trigger,
}) => {
  const router = useRouter()

  // Queries
  const orgsQuery = trpc.organizations.getOrganizations.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: isOpen, // only fetch when needed
  })
  const { data: focusedMembership } =
    trpc.organizations.getFocusedMembership.useQuery()

  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    if (isOpen && focusedMembership) {
      setSelectedId(focusedMembership.membership.organizationId)
    }
  }, [isOpen, focusedMembership])

  // Keep list alphabetically sorted for stable order
  const sortedOrgs = useMemo(
    () =>
      orgsQuery.data?.slice().sort((a, b) => a.name.localeCompare(b.name)) ?? [],
    [orgsQuery.data]
  )

  // Mutation to update focus
  const utils = trpc.useUtils()
  const updateFocusedMembership =
    trpc.organizations.updateFocusedMembership.useMutation({
      onSuccess: async () => {
        await utils.organizations.getOrganizations.invalidate()
        router.refresh()
        setIsOpen(false)
      },
    })

  const handleConfirm = async () => {
    if (!selectedId || updateFocusedMembership.isPending) return
    await updateFocusedMembership.mutateAsync({ organizationId: selectedId })
  }

  const isConfirmDisabled =
    !selectedId ||
    selectedId === focusedMembership?.membership.organizationId ||
    updateFocusedMembership.isPending

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select organization</DialogTitle>
        </DialogHeader>

        {orgsQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <RadioGroup
            value={selectedId}
            onValueChange={setSelectedId}
            className="flex flex-col gap-2"
          >
            {sortedOrgs.map((org) => (
              <div key={org.id} className="flex items-center gap-3">
                <RadioGroupItem value={org.id} id={org.id} />
                <Label htmlFor={org.id}>{org.name}</Label>
              </div>
            ))}
          </RadioGroup>
        )}

        <DialogFooter>
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isConfirmDisabled}>
              Switch organization
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
