'use client'

import { MoreHorizontal } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface ActionMenuItem {
  label: string
  icon?: React.ReactNode
  handler: () => void
  disabled?: boolean
  destructive?: boolean
  helperText?: string
}

interface EnhancedDataTableActionsMenuProps {
  items: ActionMenuItem[]
  children?: React.ReactNode // For modal components
}

export function EnhancedDataTableActionsMenu({
  items,
  children,
}: EnhancedDataTableActionsMenuProps) {
  const [open, setOpen] = React.useState(false)

  const handleItemClick = React.useCallback((handler: () => void) => {
    // Close dropdown first to prevent scroll lock conflicts
    setOpen(false)
    // Small delay to ensure dropdown is fully closed before opening modal
    setTimeout(() => {
      handler()
      // Force cleanup of any orphaned pointer-events styling
      document.body.style.pointerEvents = ''
    }, 50)
  }, [])

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0 border border-transparent hover:border-muted-foreground hover:shadow-sm"
          >
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item, index) => (
            <React.Fragment key={index}>
              <DropdownMenuItem
                onClick={() => handleItemClick(item.handler)}
                disabled={item.disabled}
                className={item.destructive ? 'text-destructive' : ''}
                title={item.helperText}
              >
                {item.icon && (
                  <span className="mr-1 h-4 w-4">{item.icon}</span>
                )}
                {item.label}
              </DropdownMenuItem>
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {children} {/* Modal components rendered here */}
    </>
  )
}
