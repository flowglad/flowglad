'use client'

import { useState } from 'react'
import { trpc } from '../_trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Loader2 } from 'lucide-react'

const InternalTurbopufferDemoPage = () => {
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)

  const { data, isLoading, refetch } =
    trpc.turbopuffer.queryDocs.useQuery(
      { query, topK },
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
                      <Badge variant="outline">{result.path}</Badge>
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
                        Markdown file not found at path: {result.path}
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
    </div>
  )
}

export default InternalTurbopufferDemoPage
