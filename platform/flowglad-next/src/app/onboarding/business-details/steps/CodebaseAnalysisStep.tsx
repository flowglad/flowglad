'use client'

import { Copy } from 'lucide-react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { CursorLogo } from '@/components/icons/CursorLogo'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import analyzeCodebasePrompt from '@/prompts/analyze-codebase.md'
import { cursorDeepLink } from '@/utils/cursor'
import { type BusinessDetailsFormData } from './schemas'

export function CodebaseAnalysisStep() {
  const { form } = useMultiStepForm<BusinessDetailsFormData>()
  const copyPromptHandler = useCopyTextHandler({
    text: analyzeCodebasePrompt,
  })

  return (
    <StepContainer
      title="Codebase Context"
      description="Use the prompt to have AI analyze your codebase, then paste the result here. This is optional but helps us provide better integration guidance."
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={copyPromptHandler}
          >
            Copy Prompt
            <Copy className="ml-2 h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              window.open(
                cursorDeepLink(analyzeCodebasePrompt),
                '_blank',
                'noopener,noreferrer'
              )
            }}
          >
            Open in
            <CursorLogo />
          </Button>
        </div>

        <FormField
          control={form.control}
          name="codebaseMarkdown"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Paste the AI-generated analysis here (optional)"
                  className="resize-none"
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </StepContainer>
  )
}
