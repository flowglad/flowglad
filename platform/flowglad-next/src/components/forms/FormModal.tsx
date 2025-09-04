// Generated with Ion on 10/11/2024, 4:13:18 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=770:28007
'use client'
import {
  useForm,
  FormProvider,
  FieldValues,
  DefaultValues,
  UseFormReturn,
} from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export interface ModalInterfaceProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/lib/utils'
import core from '@/utils/core'
import { useEffect, useId, useState } from 'react'
import ErrorLabel from '@/components/ErrorLabel'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

const useShouldRenderContent = ({
  isOpen,
  hardResetFormValues,
}: {
  isOpen: boolean
  doNotAutoClose?: boolean
  hardResetFormValues?: () => void
}) => {
  /**
   * For form state to be reset when modal is closed, we need to
   * unmounting the form content because consumers of this component
   * are most likely using controller-based form fields to manage state,
   * which doesn't respond to the unmounting of the form content.
   * But naive unmounting on close causes a flicker when the modal closes, so we need
   * to delay the unmount until after the modal has closed.
   */
  const [shouldRenderContent, setShouldRenderContent] =
    useState(false)
  useEffect(() => {
    if (isOpen) {
      setShouldRenderContent(true)
    } else {
      // Delay unmounting to match modal close animation
      const timer = setTimeout(() => {
        setShouldRenderContent(false)
        if (hardResetFormValues) {
          hardResetFormValues()
        }
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen, hardResetFormValues])
  return shouldRenderContent
}

interface FormModalProps<T extends FieldValues>
  extends ModalInterfaceProps {
  onSubmit: (data: T) => void
  onSuccess?: () => void
  formSchema: z.ZodSchema<T>
  defaultValues: DefaultValues<T>
  title: string
  children: React.ReactNode
  wide?: boolean
  extraWide?: boolean
  /**
   * Override the default submit button text, which is "Submit"
   */
  submitButtonText?: string
  /**
   * Whether the modal should auto-close after submitting. Defaults to true.
   */
  autoClose?: boolean
  /**
   * Whether the footer should be hidden. Defaults to false.
   */
  hideFooter?: boolean
  mode?: 'drawer' | 'modal'
}

interface NestedFormModalProps<T extends FieldValues>
  extends FormModalProps<T> {
  form?: UseFormReturn<T>
  onSubmit: () => void
  autoClose?: boolean
}

export const NestedFormModal = <T extends FieldValues>({
  setIsOpen,
  isOpen,
  defaultValues,
  onSubmit,
  title,
  children,
  wide,
  extraWide,
  submitButtonText,
  autoClose = true,
  form,
  onSuccess,
  mode = 'modal',
}: NestedFormModalProps<T>) => {
  const shouldRenderContent = useShouldRenderContent({ isOpen })
  const footer = (
    <div className="flex flex-1 justify-end gap-2 w-full">
      <Button
        variant="secondary"
        size="default"
        onClick={() => {
          if (form) {
            form.reset(defaultValues)
          }
          setIsOpen(false)
        }}
      >
        Cancel
      </Button>
      <Button
        variant="default"
        size="default"
        disabled={form?.formState.isSubmitting}
        onClick={async (e) => {
          e.preventDefault()
          await onSubmit()
          if (autoClose) {
            setIsOpen(false)
          }
          if (onSuccess) {
            onSuccess()
          }
        }}
      >
        {submitButtonText ?? 'Submit'}
      </Button>
    </div>
  )

  const innerContent = (
    <div
      className={cn(
        'transition-opacity duration-200',
        isOpen ? 'opacity-100' : 'opacity-0'
      )}
    >
      {shouldRenderContent && (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="w-full min-w-[460px]">
              <div className="flex-1 w-full flex flex-col justify-center gap-6">
                {children}
              </div>
            </div>
          </div>
          <div className="text-left">
            <ErrorLabel error={form?.formState.errors.root} />
          </div>
        </>
      )}
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className={cn(
          'flex-1 max-h-[90vh] overflow-hidden flex flex-col w-3xl',
          extraWide && 'w-full',
          wide && 'max-w-5xl',
          !wide && !extraWide && 'max-w-xl'
        )}
      >
        <DialogHeader className="text-center">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">{innerContent}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}

const FormModal = <T extends FieldValues>({
  setIsOpen,
  isOpen,
  defaultValues,
  onSubmit,
  title,
  formSchema,
  children,
  wide,
  extraWide,
  submitButtonText,
  autoClose = true,
  hideFooter = false,
  mode = 'modal',
}: FormModalProps<T>) => {
  const id = useId()
  const router = useRouter()
  const form = useForm<T>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })
  const {
    handleSubmit,
    formState: { isSubmitting, errors },
    reset,
  } = form

  const hardResetFormValues = () => {
    form.reset(defaultValues, {
      keepDefaultValues: true,
      keepIsSubmitted: false,
      keepErrors: false,
      keepDirty: false,
      keepValues: false,
      keepTouched: false,
    })
  }

  const shouldRenderContent = useShouldRenderContent({
    isOpen,
    hardResetFormValues,
  })

  const footer = (
    <div className="flex flex-1 justify-end gap-2 w-full">
      <Button
        variant="secondary"
        size="default"
        onClick={() => {
          form.reset(defaultValues)
          setIsOpen(false)
        }}
      >
        Cancel
      </Button>
      <Button
        variant="default"
        size="default"
        type="submit"
        form={id}
        disabled={isSubmitting}
      >
        {submitButtonText ?? 'Submit'}
      </Button>
    </div>
  )

  const innerContent = (
    <div
      className={cn(
        'transition-opacity duration-200',
        isOpen ? 'opacity-100' : 'opacity-0'
      )}
    >
      {shouldRenderContent && (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="w-full min-w-[460px]">
              <div className="flex-1 w-full flex flex-col justify-center gap-6">
                {children}
              </div>
            </div>
          </div>
          <div className="text-left">
            <ErrorLabel error={errors.root} />
          </div>
        </>
      )}
    </div>
  )

  let content = (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className={cn(
          'flex-1 max-h-[90vh] overflow-hidden flex flex-col w-3xl',
          extraWide && 'w-full',
          wide && 'max-w-5xl',
          !wide && !extraWide && 'max-w-xl'
        )}
      >
        <DialogHeader className="text-center">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">{innerContent}</div>
        {!hideFooter && footer && (
          <DialogFooter>{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )

  if (mode === 'drawer') {
    content = (
      <Drawer
        open={isOpen}
        onOpenChange={setIsOpen}
        direction="right"
      >
        <DrawerContent className="h-full flex flex-col">
          <DrawerHeader className="sticky top-0 z-10 bg-background border-b border-muted px-6 py-4">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {innerContent}
          </div>
          <div className="sticky bottom-0 z-10 bg-background border-t border-muted px-6 py-4">
            {hideFooter ? null : footer}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit(async (data) => {
          const parsed = formSchema.safeParse(data)
          if (!parsed.success) {
            reset(data, { keepIsSubmitted: false })
            return form.setError('root', {
              message: parsed.error.message,
            })
          }
          try {
            await onSubmit(data)
            router.refresh()
            if (autoClose) {
              setIsOpen(false)
            }
            hardResetFormValues()
          } catch (error) {
            form.setError('root', {
              message: (error as Error).message,
            })
          }
        })}
        className={cn(isOpen && 'flex-1 overflow-y-auto')}
        id={id}
      >
        {content}
      </form>
    </FormProvider>
  )
}

export default FormModal
