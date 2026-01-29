export default function BillingPortalLoading() {
  return (
    <div className="bg-background">
      {/* Header skeleton */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 max-w-6xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-7 w-32 bg-muted/10 rounded animate-pulse" />
              <div className="h-5 w-48 bg-muted/10 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-muted/10 animate-pulse" />
              <div className="flex flex-col gap-1">
                <div className="h-4 w-32 bg-muted/10 rounded animate-pulse" />
                <div className="h-3 w-24 bg-muted/10 rounded animate-pulse" />
              </div>
              <div className="h-10 w-24 bg-muted/10 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Navigation skeleton */}
        <div className="border-b mb-8">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-0">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-4 py-3 sm:py-4 flex-1 sm:flex-initial"
              >
                <div className="h-5 w-5 bg-muted/10 rounded animate-pulse" />
                <div className="flex flex-col gap-1">
                  <div className="h-4 w-24 bg-muted/10 rounded animate-pulse" />
                  <div className="h-3 w-32 bg-muted/10 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content sections skeleton */}
        <div className="space-y-8">
          {/* Subscription section */}
          <section>
            <div className="h-8 w-40 mb-6 bg-muted/10 rounded animate-pulse" />
            <div className="h-48 w-full bg-muted/10 rounded-lg animate-pulse" />
          </section>

          {/* Payment methods section */}
          <section>
            <div className="h-8 w-48 mb-6 bg-muted/10 rounded animate-pulse" />
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 w-full bg-muted/10 rounded-lg animate-pulse"
                />
              ))}
            </div>
          </section>

          {/* Invoices section */}
          <section>
            <div className="h-8 w-32 mb-6 bg-muted/10 rounded animate-pulse" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-16 w-full bg-muted/10 rounded-lg animate-pulse"
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
