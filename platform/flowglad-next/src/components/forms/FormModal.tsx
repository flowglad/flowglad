'use client'
import {
  type DefaultValues,
  type FieldValues,
  FormProvider,
  type UseFormReturn,
  useForm,
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

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import type { z } from 'zod'
import ErrorLabel from '@/components/ErrorLabel'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import core from '@/utils/core'

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
  onSuccess?: () => void
  formSchema: z.ZodSchema<T>
  /**
   * A function that returns the default values for the form.
   * This function is only called when the modal opens, which prevents
   * expensive computations (like schema.parse()) from running when
   * the modal is closed. This avoids errors on pages where the modal
   * is rendered but not visible.
   */
  defaultValues: () => DefaultValues<T>
  onSubmit: (data: T) => void
  title: string
  children: React.ReactNode
  wide?: boolean
  extraWide?: boolean
  /**
   * Override the default submit button text, which is "Submit"
   */
  submitButtonText?: string
  /**
   * Override the default cancel button text, which is "Cancel"
   */
  cancelButtonText?: string
  /**
   * Whether the modal should auto-close after submitting. Defaults to true.
   */
  autoClose?: boolean
  /**
   * Whether the footer should be hidden. Defaults to false.
   */
  hideFooter?: boolean
  mode?: 'drawer' | 'modal'
  /**
   * Allow content to overflow the modal (e.g., for dropdowns, popovers, focus rings).
   * Set to false for long forms that need scrolling with fixed header/footer.
   * @default false
   */
  allowContentOverflow?: boolean
  /**
   * Whether the submit button should be disabled. Defaults to false.
   */
  submitDisabled?: boolean
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
  allowContentOverflow = false,
}: NestedFormModalProps<T>) => {
  // Lazily compute default values only when the modal opens
  // This prevents expensive computations (like schema.parse()) from running
  // on every render when the modal is closed
  const lastIsOpenRef = useRef(false)
  const defaultValuesRef = useRef<DefaultValues<T> | undefined>(
    undefined
  )

  if (isOpen && !lastIsOpenRef.current) {
    // Modal is transitioning from closed to open - compute fresh default values
    defaultValuesRef.current = defaultValues()
  }
  lastIsOpenRef.current = isOpen

  const resolvedDefaultValues = defaultValuesRef.current!
  const shouldRenderContent = useShouldRenderContent({ isOpen })
  const footer = (
    <div className="flex flex-1 justify-end gap-2 w-full">
      <Button
        variant="secondary"
        size="default"
        onClick={() => {
          if (form) {
            form.reset(resolvedDefaultValues)
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
          <div className="flex-1">
            <div className="w-full">
              <div className="flex-1 w-full flex flex-col gap-6">
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
        allowContentOverflow={allowContentOverflow}
        className={cn(
          'flex max-h-[90vh] flex-col',
          // Don't override overflow - let DialogContent handle it based on allowContentOverflow prop
          // Mobile-first responsive width
          'w-[calc(100vw-32px)]', // Ensure 16px padding on mobile
          extraWide && 'sm:w-full sm:max-w-6xl',
          wide && 'sm:max-w-5xl',
          !wide && !extraWide && 'sm:max-w-md'
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div
          className={cn(
            'flex-1 min-h-0',
            allowContentOverflow
              ? 'overflow-visible'
              : 'overflow-y-auto'
          )}
          style={
            !allowContentOverflow ? { padding: '4px' } : undefined
          }
        >
          <div
            style={
              !allowContentOverflow ? { margin: '-4px' } : undefined
            }
          >
            {innerContent}
          </div>
        </div>
        {footer && (
          <DialogFooter className="flex-shrink-0 pt-4">
            {footer}
          </DialogFooter>
        )}
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
  cancelButtonText,
  autoClose = true,
  hideFooter = false,
  mode = 'modal',
  allowContentOverflow = false,
  submitDisabled = false,
}: FormModalProps<T>) => {
  const id = useId()
  const router = useRouter()
  // Lazily compute default values only when the modal opens
  // This prevents expensive computations (like schema.parse()) from running
  // on every render when the modal is closed
  const lastIsOpenRef = useRef(false)
  const defaultValuesRef = useRef<DefaultValues<T> | undefined>(
    undefined
  )

  if (isOpen && !lastIsOpenRef.current) {
    // Modal is transitioning from closed to open - compute fresh default values
    defaultValuesRef.current = defaultValues()
  }
  lastIsOpenRef.current = isOpen

  const resolvedDefaultValues = defaultValuesRef.current!
  const form = useForm<T>({
    resolver: async (data, context, options) => {
      try {
        // Type assertion needed because Zod 4's ZodSchema<T> has unknown input type,
        // but zodResolver expects FieldValues. This is safe because T extends FieldValues.
        return await zodResolver(formSchema as z.ZodType<T, T>)(
          data,
          context,
          options
        )
      } catch (error) {
        // Catch any errors thrown by zodResolver
        // This prevents unhandled errors from escaping to React's error boundary
        console.error('Form validation error:', error)
        const fieldErrors: Record<string, any> = {}
        if (error && typeof error === 'object' && 'issues' in error) {
          const zodError = error as any
          zodError.issues?.forEach((issue: any) => {
            const path = issue.path.join('.')
            if (path) {
              fieldErrors[path] = {
                type: 'manual',
                message: issue.message,
              }
            }
          })
        }
        return {
          values: {},
          errors:
            Object.keys(fieldErrors).length > 0
              ? fieldErrors
              : {
                  root: {
                    type: 'manual',
                    message:
                      error instanceof Error
                        ? error.message
                        : 'Validation failed',
                  },
                },
        }
      }
    },
    defaultValues: resolvedDefaultValues,
  })
  const {
    handleSubmit,
    formState: { isSubmitting, errors },
    reset,
  } = form
  const hardResetFormValues = useCallback(() => {
    form.reset(resolvedDefaultValues, {
      keepDefaultValues: true,
      keepIsSubmitted: false,
      keepErrors: false,
      keepDirty: false,
      keepValues: false,
      keepTouched: false,
    })
  }, [form, resolvedDefaultValues])

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
          form.reset(resolvedDefaultValues)
          setIsOpen(false)
        }}
      >
        {cancelButtonText ?? 'Cancel'}
      </Button>
      <Button
        variant="default"
        size="default"
        type="submit"
        form={id}
        disabled={isSubmitting || submitDisabled}
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
          <div className="flex-1">
            <div className="w-full">
              <div className="flex-1 w-full flex flex-col gap-6">
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
        allowContentOverflow={allowContentOverflow}
        className={cn(
          'flex max-h-[90vh] flex-col',
          // Don't override overflow - let DialogContent handle it based on allowContentOverflow prop
          // Mobile-first responsive width
          'w-[calc(100vw-32px)]', // Ensure 16px padding on mobile
          extraWide && 'sm:w-full sm:max-w-6xl',
          wide && 'sm:max-w-5xl',
          !wide && !extraWide && 'sm:max-w-md'
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div
          className={cn(
            'flex-1 min-h-0',
            allowContentOverflow
              ? 'overflow-visible'
              : 'overflow-y-auto'
          )}
          style={
            !allowContentOverflow ? { padding: '4px' } : undefined
          }
        >
          <div
            style={
              !allowContentOverflow ? { margin: '-4px' } : undefined
            }
          >
            {innerContent}
          </div>
        </div>
        {!hideFooter && footer && (
          <DialogFooter className="flex-shrink-0 pt-4">
            {footer}
          </DialogFooter>
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
          <div className="flex-1 px-6 py-5">{innerContent}</div>
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
        className={cn(isOpen && 'flex-1')}
        id={id}
      >
        {content}
      </form>
    </FormProvider>
  )
}

export default FormModal
