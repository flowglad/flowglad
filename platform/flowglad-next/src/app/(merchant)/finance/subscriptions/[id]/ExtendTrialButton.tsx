'use client'

import { useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ExtendTrialModal } from './ExtendTrialModal'

interface ExtendTrialButtonProps {
  subscriptionId: string
}

export const ExtendTrialButton = ({
  subscriptionId,
}: ExtendTrialButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false)

  const canExtendTrialQuery =
    trpc.subscriptions.canExtendTrial.useQuery(
      { id: subscriptionId },
      {
        refetchOnWindowFocus: false,
      }
    )

  const { data, isLoading, error } = canExtendTrialQuery

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled>
        Extend Trial
      </Button>
    )
  }

  if (error || !data?.canExtend) {
    const reason =
      data?.reason ??
      error?.message ??
      'Extend trial disabled, please contact flowglad team.'

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button variant="outline" size="sm" disabled>
              Extend Trial
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{reason}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsModalOpen(true)}
      >
        Extend Trial
      </Button>
      <ExtendTrialModal
        isOpen={isModalOpen}
        setIsOpen={setIsModalOpen}
        subscriptionId={subscriptionId}
        currentTrialEnd={data.currentTrialEnd}
      />
    </>
  )
}
