'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/app/_trpc/client'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { DetailLabel } from '@/components/DetailLabel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface PricingModelIntegrationGuideModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  pricingModelId: string
}

export function PricingModelIntegrationGuideModal({
  isOpen,
  setIsOpen,
  pricingModelId,
}: PricingModelIntegrationGuideModalProps) {
  const { data: codebaseMarkdown, isLoading: isLoadingCodebase } =
    trpc.organizations.getCodebaseMarkdown.useQuery(undefined, {
      enabled: isOpen,
    })

  const hasCodebaseOverview =
    !isLoadingCodebase &&
    typeof codebaseMarkdown === 'string' &&
    codebaseMarkdown.trim() !== ''

  const { data, isLoading } =
    trpc.pricingModels.getIntegrationGuide.streaming.useQuery(
      { id: pricingModelId },
      { enabled: isOpen && hasCodebaseOverview }
    )

  const [integrationGuide, setIntegrationGuide] = useState('')
  const [hasReceivedFirstChunk, setHasReceivedFirstChunk] =
    useState(false)
  const isConsumingRef = useRef(false)
  const currentDataRef = useRef<typeof data | null>(null)
  const latestDataRef = useRef<typeof data | null>(null)
  const pricingModelIdRef = useRef(pricingModelId)
  const shouldClearOnNextStreamRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Helper function to consume a stream, can be called recursively
  const consumeStreamHelper = async (
    dataToProcess: typeof data,
    shouldClear: boolean
  ) => {
    if (!dataToProcess) return

    try {
      let accumulated = ''
      let firstChunkReceived = false
      for await (const chunk of dataToProcess) {
        accumulated += chunk
        if (!firstChunkReceived) {
          firstChunkReceived = true
          // On first chunk, replace old content (if any) with new stream
          // This ensures smooth transition without flickering
          setIntegrationGuide(accumulated)
          setHasReceivedFirstChunk(true)
        } else {
          // Continue updating with accumulated content
          setIntegrationGuide(accumulated)
        }
      }
    } catch (error) {
      console.error('Error consuming stream:', error)
    } finally {
      isConsumingRef.current = false
      // After consuming finishes, check if new data arrived while we were processing
      // This handles the case where a new stream arrives after the previous one finishes
      const latestData = latestDataRef.current
      if (latestData && latestData !== dataToProcess) {
        // New data arrived while we were processing, process it recursively
        currentDataRef.current = latestData
        isConsumingRef.current = true
        // Use setTimeout to avoid synchronous recursion and allow React to update
        setTimeout(() => {
          consumeStreamHelper(latestData, false)
        }, 0)
      }
    }
  }

  useEffect(() => {
    // Update latestDataRef whenever data changes
    latestDataRef.current = data

    // Reset state when pricingModelId changes
    if (pricingModelIdRef.current !== pricingModelId) {
      setIntegrationGuide('')
      setHasReceivedFirstChunk(false)
      currentDataRef.current = null
      isConsumingRef.current = false
      shouldClearOnNextStreamRef.current = true
      pricingModelIdRef.current = pricingModelId
    }

    // Reset state when modal closes
    if (!isOpen) {
      setIntegrationGuide('')
      setHasReceivedFirstChunk(false)
      currentDataRef.current = null
      isConsumingRef.current = false
      shouldClearOnNextStreamRef.current = true
      return
    }

    // Only process if we have data and haven't processed this data yet
    if (
      !data ||
      data === currentDataRef.current ||
      isConsumingRef.current
    ) {
      return
    }

    // Mark this data as being processed
    const shouldClear = shouldClearOnNextStreamRef.current
    const dataToProcess = data
    currentDataRef.current = dataToProcess
    isConsumingRef.current = true
    shouldClearOnNextStreamRef.current = false

    // Only clear content if we're starting fresh (new pricing model or modal just opened)
    if (shouldClear) {
      setIntegrationGuide('')
      setHasReceivedFirstChunk(false)
    }
    // For refetches: keep existing content visible (don't clear or change hasReceivedFirstChunk)
    // This prevents flickering - old content stays visible until first chunk replaces it

    consumeStreamHelper(dataToProcess, shouldClear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isOpen, pricingModelId])

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (
      isConsumingRef.current &&
      textareaRef.current &&
      integrationGuide
    ) {
      const textarea = textareaRef.current
      // Use requestAnimationFrame for smooth scrolling after DOM update
      requestAnimationFrame(() => {
        textarea.scrollTop = textarea.scrollHeight
      })
    }
  }, [integrationGuide])

  const copyHandler = useCopyTextHandler({ text: integrationGuide })

  // Show empty state if codebase overview is missing
  if (!isLoadingCodebase && !hasCodebaseOverview) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Integration Guide</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8">
            <p className="text-center text-muted-foreground">
              In order to generate your integration guide for this
              pricing model, first complete the codebase analysis in{' '}
              <Link
                href="/settings"
                className="text-primary underline"
              >
                /settings
              </Link>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-5xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Integration Guide</DialogTitle>
        </DialogHeader>
        <div
          className="flex-1 min-h-0 flex flex-col overflow-y-auto"
          style={{ padding: '4px' }}
        >
          <div
            style={{ margin: '-4px' }}
            className="flex-1 flex flex-col"
          >
            <div className="flex-1 flex flex-col gap-6">
              <div className="flex-1 flex flex-col gap-2 min-h-0">
                <div className="flex items-center justify-between flex-shrink-0">
                  <Label htmlFor="integration-guide">Markdown</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyHandler}
                    disabled={
                      isLoading ||
                      !hasReceivedFirstChunk ||
                      !integrationGuide
                    }
                  >
                    Copy to Clipboard
                  </Button>
                </div>
                <div className="flex-1 min-h-[400px] flex flex-col relative">
                  <Textarea
                    ref={textareaRef}
                    id="integration-guide"
                    readOnly
                    value={
                      isLoading && !integrationGuide
                        ? 'Loading integration guide...'
                        : integrationGuide ||
                          'Loading integration guide...'
                    }
                    placeholder="No integration guide available"
                    className="absolute inset-0 font-mono text-sm"
                    textareaClassName="h-full w-full resize-none min-h-0 overflow-y-auto"
                  />
                </div>
              </div>
              <div className="flex-shrink-0">
                <DetailLabel
                  label="Note"
                  value="Generated by AI, verify integration works as intended before you go live"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
