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
import Button from '@/components/ion/Button'
import Modal, { ModalInterfaceProps } from '../ion/Modal'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import core from '@/utils/core'
import { useEffect, useId, useState } from 'react'
import ErrorLabel from '@/components/ErrorLabel'
import ChatPreviewDetails from '../ChatPreviewDetails'

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
  formSchema: z.ZodSchema<T>
  defaultValues: DefaultValues<T>
  title: string
  children: React.ReactNode
  wide?: boolean
  extraWide?: boolean
  /**
   * If true, the modal will be rendered as a chat preview
   */
  chatPreview?: boolean
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
  chatPreview,
  submitButtonText,
  autoClose = true,
  form,
}: NestedFormModalProps<T>) => {
  const shouldRenderContent = useShouldRenderContent({ isOpen })
  const footer = (
    <div className="flex flex-1 justify-end gap-2 w-full">
      <Button
        variant="soft"
        color="neutral"
        size="md"
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
        variant="filled"
        color="primary"
        size="md"
        disabled={form?.formState.isSubmitting}
        onClick={async (e) => {
          e.preventDefault()
          await onSubmit()
          if (autoClose) {
            setIsOpen(false)
          }
        }}
      >
        {submitButtonText ?? 'Submit'}
      </Button>
    </div>
  )

  const innerContent = (
    <div
      className={core.cn(
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

  if (chatPreview) {
    return (
      <ChatPreviewDetails
        onClose={() => setIsOpen(false)}
        footer={footer}
        title={title}
      >
        {innerContent}
      </ChatPreviewDetails>
    )
  }

  return (
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      title={title}
      className={core.cn(
        'flex-1 max-h-[90vh] overflow-hidden flex flex-col w-3xl',
        extraWide && 'w-full'
      )}
      onClose={core.noOp}
      footer={footer}
      wide={wide}
      extraWide={extraWide}
      headerAlignment="center"
    >
      {innerContent}
    </Modal>
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
  chatPreview,
  submitButtonText,
  autoClose = true,
  hideFooter = false,
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
        variant="soft"
        color="neutral"
        size="md"
        onClick={() => {
          form.reset(defaultValues)
          setIsOpen(false)
        }}
      >
        Cancel
      </Button>
      <Button
        variant="filled"
        color="primary"
        size="md"
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
      className={core.cn(
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
    <Modal
      open={isOpen}
      onOpenChange={setIsOpen}
      title={title}
      className={core.cn(
        'flex-1 max-h-[90vh] overflow-hidden flex flex-col w-3xl',
        extraWide && 'w-full'
      )}
      onClose={hardResetFormValues}
      footer={hideFooter ? null : footer}
      wide={wide}
      extraWide={extraWide}
      headerAlignment="center"
    >
      {innerContent}
    </Modal>
  )

  if (chatPreview) {
    content = (
      <ChatPreviewDetails
        onClose={() => setIsOpen(false)}
        footer={footer}
        title={title}
      >
        {innerContent}
      </ChatPreviewDetails>
    )
  }
  return (
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit(async (data) => {
          const parsed = formSchema.safeParse(data)
          if (!parsed.success) {
            reset(data, { keepIsSubmitted: false })
            return form.setError('root', parsed.error)
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
        className={core.cn(isOpen && 'flex-1 overflow-y-auto')}
        id={id}
      >
        {content}
      </form>
    </FormProvider>
  )
}

export default FormModal
