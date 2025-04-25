import {
  TableRowPopoverMenu,
  TableRowPopoverMenuProps,
} from '@/components/TableRowPopoverMenu'

function MoreMenuTableCell({
  items,
  children,
}: {
  items: TableRowPopoverMenuProps['items']
  /**
   * The modals that will be mounted by the modal.
   * Note that the parent component should manage the opne / closed state of the modals.
   * This component will only mount them.
   */
  children?: React.ReactNode
}) {
  return (
    <div className="w-full flex justify-end">
      <div className="w-fit" onClick={(e) => e.stopPropagation()}>
        <TableRowPopoverMenu items={items} />
        {children}
      </div>
    </div>
  )
}

export default MoreMenuTableCell
