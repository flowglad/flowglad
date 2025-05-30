import * as React from 'react'

import { cn } from '../../lib/utils'
import { useFlowgladTheme } from '../../FlowgladTheme'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  const { themedCn } = useFlowgladTheme()
  return (
    <div
      data-slot="card"
      className={themedCn(
        'flowglad-bg-card flowglad-text-card-foreground flowglad-flex flowglad-flex-col flowglad-gap-6 flowglad-rounded-xl flowglad-border flowglad-py-6 flowglad-shadow-sm',
        className
      )}
      {...props}
    />
  )
}

function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flowglad-container/card-header flowglad-grid flowglad-auto-rows-min flowglad-grid-rows-[auto_auto] flowglad-items-start flowglad-gap-1.5 flowglad-px-6 flowglad-has-[data-slot=card-action]:flowglad-grid-cols-[1fr_auto] [.flowglad-border-b]:flowglad-pb-6',
        className
      )}
      {...props}
    />
  )
}

function CardTitle({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'flowglad-leading-none flowglad-font-semibold',
        className
      )}
      {...props}
    />
  )
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        'flowglad-text-muted-foreground flowglad-text-sm',
        className
      )}
      {...props}
    />
  )
}

function CardAction({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'flowglad-col-start-2 flowglad-row-span-2 flowglad-row-start-1 flowglad-self-start flowglad-justify-self-end',
        className
      )}
      {...props}
    />
  )
}

function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('flowglad-px-6', className)}
      {...props}
    />
  )
}

function CardFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flowglad-flex flowglad-items-center flowglad-px-6 [.flowglad-border-t]:flowglad-pt-6',
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
