import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext'
      try {
        return hljs.highlight(code, { language }).value
      } catch {
        return code
      }
    }
  })
)

marked.use({ gfm: true, breaks: true })

export function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string
  // Add a copy affordance to every code block. Uses a div (DOMPurify forbids button)
  // and is part of the HTML string so it survives React re-renders.
  const withCopy = raw.replace(/<pre>/g, '<pre><div class="code-copy" role="button" title="Copy code" aria-label="Copy code">⧉</div>')
  return DOMPurify.sanitize(withCopy, {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'form', 'input', 'button']
  })
}
