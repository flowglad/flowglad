import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '../../lib/utils'

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      className={cn(
        '!flowglad-outline-none !flowglad-ring-0 !flowglad-ring-offset-0',
        className
      )}
      {...props}
    />
  )
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
  )
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:flowglad-animate-in data-[state=closed]:flowglad-animate-out data-[state=closed]:flowglad-fade-out-0 data-[state=open]:flowglad-fade-in-0 flowglad-fixed flowglad-inset-0 flowglad-z-50 flowglad-bg-black/50',
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'flowglad-bg-background data-[state=open]:flowglad-animate-in data-[state=closed]:flowglad-animate-out data-[state=closed]:flowglad-fade-out-0 data-[state=open]:flowglad-fade-in-0 data-[state=closed]:flowglad-zoom-out-95 data-[state=open]:flowglad-zoom-in-95 data-[state=closed]:flowglad-slide-out-to-left-1/2 data-[state=closed]:flowglad-slide-out-to-top-[48%] data-[state=open]:flowglad-slide-in-from-left-1/2 data-[state=open]:flowglad-slide-in-from-top-[48%] flowglad-fixed flowglad-top-[50%] flowglad-left-[50%] flowglad-z-50 flowglad-grid flowglad-w-full flowglad-max-w-[calc(100%-2rem)] flowglad-translate-x-[-50%] flowglad-translate-y-[-50%] flowglad-gap-4 flowglad-rounded-lg flowglad-border flowglad-p-6 flowglad-shadow-lg flowglad-duration-200 sm:flowglad-max-w-lg',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="flowglad-ring-offset-background data-[state=open]:flowglad-bg-accent data-[state=open]:flowglad-text-muted-foreground flowglad-absolute flowglad-top-4 flowglad-right-4 flowglad-rounded-xs flowglad-opacity-70 flowglad-transition-opacity flowglad-hover:opacity-100 !flowglad-outline-none !flowglad-ring-0 !flowglad-ring-offset-0 flowglad-disabled:pointer-events-none [&_svg]:flowglad-pointer-events-none [&_svg]:flowglad-shrink-0 [&_svg:not([class*='size-'])]:flowglad-size-4">
          <XIcon />
          <span className="flowglad-sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flowglad-flex flowglad-flex-col flowglad-gap-2 flowglad-text-center sm:flowglad-text-left',
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flowglad-flex flowglad-flex-col-reverse flowglad-gap-2 sm:flowglad-flex-row sm:flowglad-justify-end',
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        'flowglad-text-lg flowglad-leading-none flowglad-font-semibold',
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'flowglad-text-muted-foreground flowglad-text-sm',
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
