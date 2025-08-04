import React, { useState } from 'react'
import Textarea from '@/components/ion/Textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ion/Popover'
import { Button } from '@/components/ui/button'
import { trpc } from '@/app/_trpc/client'

const HoverModal = ({
  productName,
  onGenerateComplete,
  setIsOpen,
}: {
  productName: string
  onGenerateComplete: (result: string) => void
  setIsOpen: (isOpen: boolean) => void
}) => {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const generateDescription =
    trpc.utils.generateDescription.useMutation()
  const handleGenerate = async () => {
    setIsLoading(true)
    const result = await generateDescription.mutateAsync({
      productName,
      additionalNotes: input,
    })
    onGenerateComplete(result.description)
    setIsLoading(false)
    setIsOpen(false)
  }

  return (
    <div className="flex flex-col items-center justify-center m-w-[500px] rounded-sm w-full">
      <Textarea
        placeholder="Any notes to guide generation?"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="w-full mb-4"
      />
      <div className="flex w-full justify-end">
        <Button
          onClick={handleGenerate}
          size="sm"
          disabled={isLoading || generateDescription.isPending}
        >
          Generate
        </Button>
      </div>
    </div>
  )
}

const AIHoverModal: React.FC<{
  triggerLabel: string
  productName: string
  onGenerateComplete: (result: string) => void
}> = ({ triggerLabel, productName, onGenerateComplete }) => {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <div className="cursor-pointer text-sm">{triggerLabel}</div>
      </PopoverTrigger>
      <PopoverContent className="w-fit bg-black" align="end">
        <HoverModal
          productName={productName}
          onGenerateComplete={onGenerateComplete}
          setIsOpen={setIsOpen}
        />
      </PopoverContent>
    </Popover>
  )
}

export default AIHoverModal
