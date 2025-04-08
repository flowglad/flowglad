const InnerPageContainer = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-background flex-1 h-full w-full flex gap-6 p-6 pb-10">
        <div className="flex-1 h-full w-full flex flex-col">
          {children}
        </div>
      </div>
    </div>
  )
}

export default InnerPageContainer
