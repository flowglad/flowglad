// Generated with Ion on 9/24/2024, 3:10:31 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=forced_ion/Modal_373:16123
// ion/Modal: Generated with Ion on 9/24/2024, 3:10:31 AM
import { X } from 'lucide-react'
// Note: We are renaming the RadixUI Dialog -> Modal
import * as ModalPrimitive from '@radix-ui/react-dialog'
import clsx from 'clsx'
import * as React from 'react'

import { MigrationButton as Button } from '@/components/ui/button-migration'

const ModalTrigger = ModalPrimitive.Trigger

const ModalPortal = ModalPrimitive.Portal

const ModalClose = ModalPrimitive.Close

/* ---------------------------------- Component --------------------------------- */

const ModalOverlay = React.forwardRef<
  React.ElementRef<typeof ModalPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof ModalPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <ModalPrimitive.Overlay
    ref={ref}
    className={clsx(
      'fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
ModalOverlay.displayName = ModalPrimitive.Overlay.displayName

/* ---------------------------------- Component --------------------------------- */

const ModalContent = React.forwardRef<
  React.ElementRef<typeof ModalPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ModalPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <ModalPortal>
    <ModalOverlay />
    <ModalPrimitive.Content
      ref={ref}
      className={clsx(
        'fixed left-[50%] top-[50%] z-50 w-fit translate-x-[-50%] translate-y-[-50%] rounded-radius-lg bg-background shadow-medium duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
        className
      )}
      {...props}
    >
      {children}
    </ModalPrimitive.Content>
  </ModalPortal>
))
ModalContent.displayName = ModalPrimitive.Content.displayName

/* ---------------------------------- Component --------------------------------- */

const ModalTitle = React.forwardRef<
  React.ElementRef<typeof ModalPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ModalPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ModalPrimitive.Title
    ref={ref}
    className={clsx('text-base-foreground font-semibold', className)}
    {...props}
  />
))
ModalTitle.displayName = ModalPrimitive.Title.displayName

/* ---------------------------------- Component --------------------------------- */

const ModalSubtitle = React.forwardRef<
  React.ElementRef<typeof ModalPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ModalPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ModalPrimitive.Description
    ref={ref}
    className={clsx('text-sm text-secondary', className)}
    {...props}
  />
))
ModalSubtitle.displayName = ModalPrimitive.Description.displayName

/* ---------------------------------- Type --------------------------------- */

interface ModalHeaderProps {
  /** Alignment of the modal header
   * @default 'left'
   */
  headerAlignment?: 'left' | 'center'
  /** Icon to the left or above the title */
  icon?: React.ReactNode
  /** Header icon placement
   * @default 'left'
   */
  iconPlacement?: 'left' | 'top'
  /** Title of the modal */
  title?: string
  /** Subtitle/description, below the title, of the modal */
  subtitle?: string
  /** Display a border under the header
   * @default true
   */
  bordered?: boolean
  className?: string
  showClose?: boolean
  onClose?: () => void
}

/* ---------------------------------- Component --------------------------------- */

const ModalHeader = ({
  headerAlignment = 'left',
  iconPlacement = 'left',
  icon,
  title,
  subtitle,
  bordered = true,
  className,
  onClose,
  showClose = true,
}: ModalHeaderProps) => (
  <div
    className={clsx(
      'flex flex-row items-center',
      {
        'border-b border-stroke': bordered,
      },
      className
    )}
  >
    <div
      className={clsx('flex gap-2 w-full', {
        'flex-col': iconPlacement === 'top',
        'justify-center': headerAlignment === 'center',
        'items-center':
          iconPlacement === 'left' ||
          (iconPlacement === 'top' && headerAlignment === 'center'),
      })}
    >
      {icon && <span>{icon}</span>}
      <div
        className={clsx('flex flex-col w-full', {
          'items-center justify-center': headerAlignment === 'center',
        })}
      >
        {title && <ModalTitle>{title}</ModalTitle>}
        {subtitle && <ModalSubtitle>{subtitle}</ModalSubtitle>}
      </div>
    </div>
    {showClose && (
      <ModalClose asChild>
        <Button
          iconLeading={<X size={16} />}
          variant="ghost"
          color="primary"
          size="md"
          onClick={onClose}
        />
      </ModalClose>
    )}
  </div>
)
ModalHeader.displayName = 'ModalHeader'

/* ---------------------------------- Component --------------------------------- */

const ModalFooter = ({
  className,
  bordered = true,
  hideGradient = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  bordered?: boolean
  hideGradient?: boolean
}) => (
  <div className={className}>
    {!hideGradient && (
      <div className="-z-10">
        <div className="h-10 bg-gradient-to-b from-transparent to-[#1b1b1bff]" />
      </div>
    )}
    <div
      className={clsx(
        bordered && 'border-t border-stroke',
        'bg-background py-5 px-6'
      )}
      {...props}
    />
  </div>
)

ModalFooter.displayName = 'ModalFooter'

/* ---------------------------------- Type --------------------------------- */

export interface ModalProps
  extends Omit<ModalHeaderProps, 'bordered'>,
    React.ComponentPropsWithoutRef<typeof ModalPrimitive.Root> {
  /** Add border bottom to the header
   * @default true
   */
  headerBordered?: boolean
  /** Whether to show the close button
   * @default false
   */
  showClose?: boolean
  onClose?: () => void
  /** Element that opens the modal on click */
  trigger?: React.ReactNode
  /** Footer of the modal */
  footer?: React.ReactNode
  /** Whether to hide the footer gradient used for scroll UI */
  hideFooterGradient?: boolean
  /** Whether to make the modal wider */
  wide?: boolean
  extraWide?: boolean
  /** Add border top to the footer
   * @default false
   */
  footerBordered?: boolean
  className?: string
  children?: React.ReactNode
}

/* ---------------------------------- Component --------------------------------- */

const Modal = React.forwardRef<
  React.ElementRef<typeof ModalPrimitive.Root>,
  ModalProps
>(
  (
    {
      onClose,
      showClose,
      trigger,
      className,
      title,
      subtitle,
      icon,
      iconPlacement = 'left',
      headerAlignment = 'left',
      headerBordered = true,
      footerBordered = true,
      wide = false,
      extraWide = false,
      footer,
      ...props
    },
    ref
  ) => (
    <ModalPrimitive.Root {...props}>
      <ModalTrigger asChild>{trigger}</ModalTrigger>
      <ModalContent
        ref={ref}
        className={clsx(
          'sm:min-w-96 overflow-y-auto flex flex-col scrollbar-hidden',
          'max-h-[95vh]',
          !wide && !extraWide && 'max-w-xl',
          wide && 'max-w-5xl',
          extraWide && 'max-w-7xl',
          className
        )}
      >
        {(title || subtitle || icon) && (
          <ModalHeader
            iconPlacement={iconPlacement}
            headerAlignment={headerAlignment}
            title={title}
            subtitle={subtitle}
            icon={icon}
            bordered={headerBordered}
            showClose={showClose}
            className="py-5 px-6 flex-shrink-0 sticky top-0 z-10 bg-background"
            onClose={onClose}
          />
        )}
        <div className="flex-grow flex-1 overflow-y-auto py-5 px-6">
          {props.children}
        </div>

        {footer && (
          <ModalFooter
            bordered={footerBordered}
            hideGradient={props.hideFooterGradient}
            className="flex flex-col flex-shrink-0 sticky bottom-0 z-10 bg-background"
          >
            {footer}
          </ModalFooter>
        )}
      </ModalContent>
    </ModalPrimitive.Root>
  )
)
Modal.displayName = 'Modal'

export default Modal

export interface ModalInterfaceProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

export {
  ModalClose,
  ModalContent,
  ModalSubtitle as ModalDescription,
  ModalHeader,
  ModalOverlay,
  ModalPortal,
  ModalTitle,
  ModalTrigger,
}
