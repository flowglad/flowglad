const CheckoutNotValidPage = ({
  organizationName,
}: {
  organizationName: string
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h1 className="text-3xl font-bold mb-6 text-primary">
        This offering is no longer available from {organizationName}
      </h1>
      <h2 className="text-xl text-muted-foreground">
        Please reach out to the team if you believe this is a mistake
      </h2>
    </div>
  )
}

export default CheckoutNotValidPage
