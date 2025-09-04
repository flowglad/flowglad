import { Ellipsis } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import PopoverMenu, { PopoverMenuProps } from './PopoverMenu'

export type TableRowPopoverMenuProps = PopoverMenuProps

export function TableRowPopoverMenu({
  items,
}: TableRowPopoverMenuProps) {
  return (
    /**
     * This will prevent clicks on this button from bubbling up to the table row
     * which will then trigger a page navigation.
     */
    <div onClick={(e) => e.stopPropagation()}>
      <Popover>
        <PopoverTrigger className="w-8 h-8 justify-center">
          <Ellipsis size={16} className="rotate-90" />
        </PopoverTrigger>
        <PopoverContent className="w-fit" align="end">
          <PopoverMenu items={items} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default TableRowPopoverMenu
