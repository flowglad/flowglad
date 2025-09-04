import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const contentDirectory = path.join(process.cwd(), 'content/blog')

export interface BlogPost {
  title: string
  description: string
  date: string
  author: string
  slug: string
  content: string
}

export function getBlogPost(slug: string): BlogPost | null {
  try {
    const filePath = path.join(contentDirectory, `${slug}.mdx`)
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContents)

    return {
      title: data.title,
      description: data.description,
      date: data.date,
      author: data.author,
      slug: data.slug,
      content,
    }
  } catch {
    return null
  }
}

export function getAllBlogPosts(): BlogPost[] {
  try {
    const files = fs.readdirSync(contentDirectory)
    const posts = files
      .filter((file) => file.endsWith('.mdx'))
      .map((file) => {
        const slug = file.replace('.mdx', '')
        return getBlogPost(slug)
      })
      .filter((post): post is BlogPost => post !== null)
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      )

    return posts
  } catch {
    return []
  }
}
