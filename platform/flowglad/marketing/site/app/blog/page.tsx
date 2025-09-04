import Header from '@/components/header'
import Footer from '@/components/footer'
import { getAllBlogPosts } from '@/lib/blog'
import BlogPageClient from './blog-client'

export default function BlogPage() {
  const blogPosts = getAllBlogPosts()

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="container pt-14 py-16">
        <BlogPageClient blogPosts={blogPosts} />
      </main>
      <Footer />
    </div>
  )
}
