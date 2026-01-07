'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * Render the dialog root element with data-slot="dialog" and forward all received props.
 *
 * @param props - Props forwarded to the underlying dialog root element
 * @returns The dialog root React element
 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/**
 * Renders the dialog's trigger element.
 *
 * @param props - Props forwarded to the Trigger element.
 * @returns A DialogPrimitive.Trigger element with `data-slot="dialog-trigger"` and the provided props.
 */
function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
  )
}

/**
 * Renders a Radix UI Portal for dialog content and forwards all received props.
 *
 * @returns A DialogPrimitive.Portal element with `data-slot="dialog-portal"` and the given props applied.
 */
function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
  )
}

/**
 * Renders a close control for the dialog.
 *
 * Forwards all received props to the underlying close primitive and sets
 * `data-slot="dialog-close"`.
 *
 * @returns The rendered close control element that closes the dialog when activated and includes `data-slot="dialog-close"`.
 */
function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * Renders the dialog overlay element used to dim the background behind the dialog.
 *
 * This wrapper applies default overlay styling and animations, sets `data-slot="dialog-overlay"`,
 * and merges any provided `className` with the built-in classes via the `cn` utility.
 *
 * @returns The rendered DialogPrimitive.Overlay element
 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80',
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the dialog's content area inside a portal with an overlay, built-in close control, and standardized styling.
 *
 * @param className - Additional class names to merge with the component's default styling
 * @param children - Elements to render inside the dialog content area
 * @returns The rendered dialog content element
 */
function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg md:max-w-2xl lg:max-w-4xl',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * Renders a header container for dialog content with responsive layout.
 *
 * The element includes a `data-slot="dialog-header"` attribute and merges the component's default layout classes with any `className` provided via props.
 *
 * @returns The header element for a dialog's content area.
 */
function DialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex flex-col gap-2 text-center sm:text-left',
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders a footer container for dialog content with responsive layout and spacing.
 *
 * The element includes a `data-slot="dialog-footer"` attribute and merges provided
 * `className` with default flex and gap utilities to present a column-reverse layout
 * on small screens and a right-aligned row on larger screens.
 *
 * @returns A `div` element serving as the dialog footer.
 */
function DialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    />
  )
}

/**
 * Renders the dialog title with standardized typography and a `data-slot="dialog-title"` attribute.
 *
 * @param className - Additional CSS class names appended to the default title styles.
 * @returns The rendered DialogPrimitive.Title element.
 */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg font-semibold leading-none', className)}
      {...props}
    />
  )
}

/**
 * Renders the dialog description element with standardized typography and a slot marker.
 *
 * @returns The DialogPrimitive.Description element with default `text-muted-foreground text-sm` classes merged with `className` and `data-slot="dialog-description"`.
 */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
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