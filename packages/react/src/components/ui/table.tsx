'use client'

import * as React from 'react'

import { cn } from '../../lib/utils'

function Table({
  className,
  ...props
}: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="flowglad-relative flowglad-w-full flowglad-overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn(
          'flowglad-w-full flowglad-caption-bottom flowglad-text-sm',
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({
  className,
  ...props
}: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:flowglad-border-b', className)}
      {...props}
    />
  )
}

function TableBody({
  className,
  ...props
}: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:flowglad-border-0', className)}
      {...props}
    />
  )
}

function TableFooter({
  className,
  ...props
}: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'flowglad-bg-muted/50 flowglad-border-t flowglad-font-medium [&>tr]:last:flowglad-border-b-0',
        className
      )}
      {...props}
    />
  )
}

function TableRow({
  className,
  ...props
}: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'hover:flowglad-bg-muted/50 data-[state=selected]:flowglad-bg-muted flowglad-border-b flowglad-transition-colors',
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  ...props
}: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'flowglad-text-muted-foreground flowglad-h-10 flowglad-px-2 flowglad-text-left flowglad-align-middle flowglad-font-medium flowglad-whitespace-nowrap [&:has([role=checkbox])]:flowglad-pr-0 [&>[role=checkbox]]:flowglad-translate-y-[2px]',
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  ...props
}: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'flowglad-p-2 flowglad-align-middle flowglad-whitespace-nowrap [&:has([role=checkbox])]:flowglad-pr-0 [&>[role=checkbox]]:flowglad-translate-y-[2px]',
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        'flowglad-text-muted-foreground flowglad-mt-4 flowglad-text-sm',
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
