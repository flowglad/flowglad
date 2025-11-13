import { PricingCardsGrid } from '@/components/pricing-cards-grid';

export default function PricingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans">
      <main className="flex min-h-screen w-full max-w-7xl flex-col items-center p-8">
        <div className="w-full space-y-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
              Choose Your Plan
            </h1>
            <p className="text-lg leading-8 text-muted-foreground md:text-xl">
              Select the perfect plan for your AI generation needs
            </p>
          </div>
          <PricingCardsGrid />
        </div>
      </main>
    </div>
  );
}
