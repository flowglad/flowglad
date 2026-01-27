'use client'

import { Copy } from 'lucide-react'
import { useCopyTextHandler } from '@/app/hooks/useCopyTextHandler'
import { CursorLogo } from '@/components/icons/CursorLogo'
import { useMultiStepForm } from '@/components/onboarding/MultiStepForm'
import { StepContainer } from '@/components/onboarding/StepContainer'
import { StepNavigation } from '@/components/onboarding/StepNavigation'
import { Button } from '@/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
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
      title="Share your codebase overview"
      description="This helps us generate a tailored integration guide."
    >
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="codebaseMarkdown"
          render={({ field }) => (
            <FormItem>
              {/* Explicit "(optional)" label for clarity */}
              <FormLabel className="text-sm text-muted-foreground">
                Codebase analysis{' '}
                <span className="text-muted-foreground/60">
                  (optional)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Paste your codebase analysis here, or continue without..."
                  className="min-h-[150px] resize-none"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyPromptHandler}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Analysis Prompt
          </Button>
          <Button
            type="button"
            variant="outline"
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
      </div>
      {/* "Continue" instead of "Skip" - consistent with other steps */}
      <StepNavigation nextLabel="Continue" />
    </StepContainer>
  )
}
