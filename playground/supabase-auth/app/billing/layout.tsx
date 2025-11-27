import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="max-w-6xl px-6 mx-auto">
      {children}
      <div className="flex flex-col gap-4">
        <Button>Click me</Button>
        <Card title="Card title" description="Card description">
          <p>Card content</p>
        </Card>
      </div>
    </div>
  )
}
