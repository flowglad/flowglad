'use client'

import { useState } from 'react'
import { trpc } from '../_trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Loader2, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'

const InternalTurbopufferDemoPage = () => {
  const [activeTab, setActiveTab] = useState('single')
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [multipleQueries, setMultipleQueries] = useState('')
  const [copied, setCopied] = useState(false)

  const { data, isLoading, refetch } =
    trpc.turbopuffer.queryDocs.useQuery(
      { query, topK },
      {
        enabled: false,
        retry: false,
      }
    )

  const {
    data: multipleData,
    isLoading: isMultipleLoading,
    refetch: refetchMultiple,
  } = trpc.turbopuffer.queryMultipleDocs.useQuery(
    {
      queries: multipleQueries
        .split('\n')
        .map((q) => q.trim())
        .filter((q) => q.length > 0),
      topK,
    },
    {
      enabled: false,
      retry: false,
    }
  )

  const handleSearch = () => {
    if (query.trim()) {
      refetch()
    }
  }

  const handleMultipleSearch = () => {
    const queries = multipleQueries
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 0)
    if (queries.length > 0) {
      refetchMultiple()
    }
  }

  const handleCopyMarkdown = async () => {
    if (!multipleData?.concatenatedMarkdown) return

    try {
      await navigator.clipboard.writeText(
        multipleData.concatenatedMarkdown
      )
      setCopied(true)
      toast.success('Copied to clipboard!', { duration: 2000 })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy text:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

  const handleKeyPress = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Turbopuffer Docs Query Demo
        </h1>
        <p className="text-muted-foreground">
          Query the flowglad-docs namespace in Turbopuffer and view
          both the search results and original markdown files.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="single">Single Query</TabsTrigger>
          <TabsTrigger value="multiple">Multiple Queries</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Search Query</CardTitle>
              <CardDescription>
                Enter a query to search the documentation using vector
                similarity search
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Enter your search query..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading}
                  />
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    placeholder="Top K"
                    value={topK}
                    onChange={(e) =>
                      setTopK(parseInt(e.target.value) || 5)
                    }
                    min={1}
                    max={20}
                    disabled={isLoading}
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={isLoading || !query.trim()}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    'Search'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {data && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Found {data.results.length} result
                {data.results.length !== 1 ? 's' : ''} for &quot;
                {data.query}&quot;
              </div>

              {data.results.map((result, index) => (
                <Card key={result.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-2">
                          {result.title || result.path}
                        </CardTitle>
                        {result.description && (
                          <CardDescription className="mb-2">
                            {result.description}
                          </CardDescription>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline">
                            {result.path}
                          </Badge>
                          <Badge variant="secondary">
                            Distance: {result.distance?.toFixed(4)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="result" className="w-full">
                      <TabsList>
                        <TabsTrigger value="result">
                          Turbopuffer Result
                        </TabsTrigger>
                        <TabsTrigger value="markdown">
                          Original Markdown
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="result" className="mt-4">
                        <div className="bg-muted p-4 rounded-lg">
                          <pre className="whitespace-pre-wrap text-sm font-mono">
                            {result.text}
                          </pre>
                        </div>
                      </TabsContent>
                      <TabsContent value="markdown" className="mt-4">
                        {result.markdown ? (
                          <div className="bg-muted p-4 rounded-lg">
                            <pre className="whitespace-pre-wrap text-sm font-mono max-h-96 overflow-auto">
                              {result.markdown}
                            </pre>
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-sm">
                            Markdown file not found at path:{' '}
                            {result.path}
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!data && !isLoading && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Enter a query above to search the documentation
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="multiple">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Multiple Queries</CardTitle>
              <CardDescription>
                Enter multiple questions (one per line) to get a
                deduplicated list of markdown file paths that appear
                in the top results for any question
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Textarea
                    placeholder="Enter questions, one per line...&#10;&#10;What is the Flowglad client package name for React useBilling hook?&#10;How is Flowglad server configured and initialized in Next.js?"
                    value={multipleQueries}
                    onChange={(e) =>
                      setMultipleQueries(e.target.value)
                    }
                    disabled={isMultipleLoading}
                    rows={10}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex gap-4 items-center">
                  <div className="w-32">
                    <Input
                      type="number"
                      placeholder="Top K"
                      value={topK}
                      onChange={(e) =>
                        setTopK(parseInt(e.target.value) || 5)
                      }
                      min={1}
                      max={20}
                      disabled={isMultipleLoading}
                    />
                  </div>
                  <Button
                    onClick={handleMultipleSearch}
                    disabled={
                      isMultipleLoading ||
                      !multipleQueries
                        .split('\n')
                        .map((q) => q.trim())
                        .filter((q) => q.length > 0).length
                    }
                  >
                    {isMultipleLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      'Search All Questions'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {multipleData && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Deduplicated File Paths</CardTitle>
                  <CardDescription>
                    Found {multipleData.totalPaths} unique path
                    {multipleData.totalPaths !== 1
                      ? 's'
                      : ''} across {multipleData.totalQueries} quer
                    {multipleData.totalQueries !== 1 ? 'ies' : 'y'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {multipleData.paths.map((path, index) => (
                      <div
                        key={index}
                        className="p-3 bg-muted rounded-lg font-mono text-sm"
                      >
                        {path}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle>Concatenated Markdown</CardTitle>
                      <CardDescription>
                        All markdown files concatenated into one
                        document
                        {multipleData.concatenatedMarkdown
                          ? ` (${multipleData.concatenatedMarkdown.length.toLocaleString()} characters)`
                          : ' (no content found)'}
                      </CardDescription>
                    </div>
                    {multipleData.concatenatedMarkdown && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyMarkdown}
                        className="ml-4"
                      >
                        {copied ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {multipleData.concatenatedMarkdown ? (
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="whitespace-pre-wrap text-sm font-mono max-h-[600px] overflow-auto">
                        {multipleData.concatenatedMarkdown}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-sm text-center py-8">
                      No markdown content could be read from the file
                      paths. This might happen if the files don&apos;t
                      exist or there was an error reading them.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {!multipleData && !isMultipleLoading && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Enter multiple questions above (one per line) to get a
                deduplicated list of markdown file paths
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default InternalTurbopufferDemoPage
