const DisabledTooltip = ({ message }: { message: string }) => {
  return (
    <div
      id="disabledTooltip"
      className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/75 text-white text-xs rounded whitespace-nowrap invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity z-[60]"
    >
      {message}
    </div>
  )
}

export default DisabledTooltip
