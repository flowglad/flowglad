import ReactMarkdown from 'react-markdown'

const components = {
  // Override default elements with shadcn semantic colors
  h1: (props: any) => (
    <h1
      className="text-2xl font-bold text-foreground py-2"
      {...props}
    />
  ),
  h2: (props: any) => (
    <h2
      className="text-xl font-semibold text-foreground py-2"
      {...props}
    />
  ),
  h3: (props: any) => (
    <h3
      className="text-lg font-semibold text-foreground py-2"
      {...props}
    />
  ),
  p: (props: any) => (
    <p className="text-base text-muted-foreground py-2" {...props} />
  ),
  ul: (props: any) => (
    <ul
      className="list-disc list-inside text-base text-muted-foreground py-2"
      {...props}
    />
  ),
  li: (props: any) => (
    <li className="text-base text-muted-foreground py-2" {...props} />
  ),
}

interface CheckoutMarkdownViewProps {
  source: string
  title?: string
}

export function CheckoutMarkdownView({
  source,
  title,
}: CheckoutMarkdownViewProps) {
  if (!source) {
    return null
  }

  return (
    <div className="w-full">
      {title && (
        <h1 className="text-2xl font-bold text-foreground py-2">
          {title}
        </h1>
      )}
      <ReactMarkdown components={components}>{source}</ReactMarkdown>
    </div>
  )
}
