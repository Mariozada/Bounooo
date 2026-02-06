import { DEFAULT_TREE_DEPTH, MAX_OUTPUT_CHARS } from '@shared/constants'

interface ElementMap {
  [key: string]: WeakRef<Element>
}

declare global {
  interface Window {
    __bounoElementMap: ElementMap
    __bounoRefCounter: number
  }
}

window.__bounoElementMap = window.__bounoElementMap || {}
window.__bounoRefCounter = window.__bounoRefCounter || 0

export function getElementByRef(refId: string): Element | null {
  const weakRef = window.__bounoElementMap[refId]
  if (!weakRef) return null

  const element = weakRef.deref()
  if (!element) {
    delete window.__bounoElementMap[refId]
    return null
  }

  return element
}

export function clearRefs(): void {
  window.__bounoElementMap = {}
  window.__bounoRefCounter = 0
}

export function getRefCount(): number {
  return Object.keys(window.__bounoElementMap).length
}

const ROLE_MAP: Record<string, string | ((el: Element) => string)> = {
  a: 'link',
  button: 'button',
  input: (el) => {
    const type = (el as HTMLInputElement).type || 'text'
    if (type === 'submit' || type === 'button') return 'button'
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'file') return 'button'
    return 'textbox'
  },
  select: 'combobox',
  textarea: 'textbox',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'image',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  section: 'region',
  article: 'article',
  aside: 'complementary',
  form: 'form',
  table: 'table',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  label: 'label'
}

export function getRole(element: Element): string {
  const explicitRole = element.getAttribute('role')
  if (explicitRole) return explicitRole

  const tagName = element.tagName.toLowerCase()
  const mapping = ROLE_MAP[tagName]

  if (typeof mapping === 'function') {
    return mapping(element)
  }
  if (typeof mapping === 'string') {
    return mapping
  }

  return 'generic'
}

export function getAccessibleName(element: Element): string {
  const tagName = element.tagName.toLowerCase()

  if (tagName === 'select') {
    const select = element as HTMLSelectElement
    const selectedOption = select.querySelector('option[selected]') ||
                          select.options[select.selectedIndex]
    if (selectedOption?.textContent?.trim()) {
      return selectedOption.textContent.trim()
    }
  }

  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel?.trim()) return ariaLabel.trim()

  const placeholder = element.getAttribute('placeholder')
  if (placeholder?.trim()) return placeholder.trim()

  const title = element.getAttribute('title')
  if (title?.trim()) return title.trim()

  const alt = element.getAttribute('alt')
  if (alt?.trim()) return alt.trim()

  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`)
    if (label?.textContent?.trim()) {
      return label.textContent.trim()
    }
  }

  if (tagName === 'input') {
    const input = element as HTMLInputElement
    const inputType = input.type || ''
    const value = input.getAttribute('value')
    if (inputType === 'submit' && value?.trim()) {
      return value.trim()
    }
    if (input.value && input.value.length < 50 && input.value.trim()) {
      return input.value.trim()
    }
  }

  if (['button', 'a', 'summary'].includes(tagName)) {
    let textContent = ''
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        textContent += child.textContent
      }
    }
    if (textContent.trim()) return textContent.trim()
  }

  if (/^h[1-6]$/.test(tagName)) {
    const text = element.textContent
    if (text?.trim()) {
      return text.trim().substring(0, 100)
    }
  }

  if (tagName === 'img') return ''

  let directText = ''
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      directText += child.textContent
    }
  }
  if (directText?.trim()?.length >= 3) {
    const trimmed = directText.trim()
    return trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed
  }

  return ''
}

export function isVisible(element: Element): boolean {
  try {
    const style = window.getComputedStyle(element)
    const el = element as HTMLElement
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           el.offsetWidth > 0 &&
           el.offsetHeight > 0
  } catch {
    return true
  }
}

function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.top < window.innerHeight &&
         rect.bottom > 0 &&
         rect.left < window.innerWidth &&
         rect.right > 0
}

export function isInteractive(element: Element): boolean {
  const tagName = element.tagName.toLowerCase()
  return ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'].includes(tagName) ||
         element.getAttribute('onclick') !== null ||
         element.getAttribute('tabindex') !== null ||
         element.getAttribute('role') === 'button' ||
         element.getAttribute('role') === 'link' ||
         element.getAttribute('contenteditable') === 'true'
}

function isLandmark(element: Element): boolean {
  const tagName = element.tagName.toLowerCase()
  return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'main', 'header', 'footer', 'section', 'article', 'aside'].includes(tagName) ||
         element.getAttribute('role') !== null
}

const SKIP_TAGS = ['script', 'style', 'meta', 'link', 'title', 'noscript']

interface ProcessOptions {
  filter: 'all' | 'interactive'
  refId?: string
}

function shouldInclude(element: Element, options: ProcessOptions): boolean {
  const tagName = element.tagName.toLowerCase()

  if (SKIP_TAGS.includes(tagName)) return false
  if (options.filter !== 'all' && element.getAttribute('aria-hidden') === 'true') return false
  if (options.filter !== 'all' && !isVisible(element)) return false
  if (options.filter !== 'all' && !options.refId && !isInViewport(element)) return false
  if (options.filter === 'interactive') return isInteractive(element)

  if (isInteractive(element)) return true
  if (isLandmark(element)) return true
  if (getAccessibleName(element).length > 0) return true

  const role = getRole(element)
  return role !== 'generic' && role !== 'image'
}

export function assignRef(element: Element): string {
  for (const id in window.__bounoElementMap) {
    const weakRef = window.__bounoElementMap[id]
    if (weakRef.deref() === element) {
      return id
    }
  }

  const refId = 'ref_' + (++window.__bounoRefCounter)
  window.__bounoElementMap[refId] = new WeakRef(element)
  return refId
}

function processElement(
  element: Element,
  currentDepth: number,
  maxDepth: number,
  options: ProcessOptions,
  output: string[]
): void {
  if (currentDepth > maxDepth || !element || !element.tagName) return

  const include = shouldInclude(element, options) ||
                 (options.refId !== undefined && currentDepth === 0)

  if (include) {
    const role = getRole(element)
    const name = getAccessibleName(element)
    const refId = assignRef(element)

    let line = ' '.repeat(currentDepth) + role
    if (name) {
      const sanitizedName = name.replace(/\s+/g, ' ').substring(0, 100).replace(/"/g, '\\"')
      line += ` "${sanitizedName}"`
    }
    line += ` [${refId}]`

    const href = element.getAttribute('href')
    if (href) {
      line += ` href="${href}"`
    }
    const type = element.getAttribute('type')
    if (type) {
      line += ` type="${type}"`
    }
    const placeholder = element.getAttribute('placeholder')
    if (placeholder) {
      line += ` placeholder="${placeholder}"`
    }

    output.push(line)
  }

  if (element.children && currentDepth < maxDepth) {
    for (const child of element.children) {
      processElement(
        child,
        include ? currentDepth + 1 : currentDepth,
        maxDepth,
        options,
        output
      )
    }
  }
}

export interface ReadPageParams {
  depth?: number
  filter?: 'all' | 'interactive'
  ref_id?: string
}

export interface ReadPageResult {
  pageContent: string
  viewport: { width: number; height: number }
  refCount: number
  error?: string
}

export function handleReadPage(params: ReadPageParams): ReadPageResult {
  const { depth = DEFAULT_TREE_DEPTH, filter = 'all', ref_id } = params
  const output: string[] = []
  const options: ProcessOptions = { filter, refId: ref_id }

  try {
    if (ref_id) {
      const weakRef = window.__bounoElementMap[ref_id]
      if (!weakRef) {
        return {
          error: `Element with ref_id '${ref_id}' not found. It may have been removed from the page. Use read_page without ref_id to get the current page state.`,
          pageContent: '',
          viewport: { width: window.innerWidth, height: window.innerHeight },
          refCount: getRefCount()
        }
      }
      const element = weakRef.deref()
      if (!element) {
        return {
          error: `Element with ref_id '${ref_id}' no longer exists. It may have been removed from the page. Use read_page without ref_id to get the current page state.`,
          pageContent: '',
          viewport: { width: window.innerWidth, height: window.innerHeight },
          refCount: getRefCount()
        }
      }
      processElement(element, 0, depth, options, output)
    } else {
      if (document.body) {
        processElement(document.body, 0, depth, options, output)
      }
    }

    for (const id in window.__bounoElementMap) {
      if (!window.__bounoElementMap[id].deref()) {
        delete window.__bounoElementMap[id]
      }
    }

    const pageContent = output.join('\n')

    if (pageContent.length > MAX_OUTPUT_CHARS) {
      let errorMsg = `Output exceeds ${MAX_OUTPUT_CHARS} character limit (${pageContent.length} characters). `
      if (ref_id) {
        errorMsg += 'The specified element has too much content. Try specifying a smaller depth parameter or focus on a more specific child element.'
      } else if (depth !== DEFAULT_TREE_DEPTH) {
        errorMsg += 'Try specifying an even smaller depth parameter or use ref_id to focus on a specific element.'
      } else {
        errorMsg += 'Try specifying a depth parameter (e.g., depth: 5) or use ref_id to focus on a specific element from the page.'
      }
      return {
        error: errorMsg,
        pageContent: '',
        viewport: { width: window.innerWidth, height: window.innerHeight },
        refCount: getRefCount()
      }
    }

    return {
      pageContent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      refCount: getRefCount()
    }

  } catch (err) {
    return {
      error: 'Error generating accessibility tree: ' + ((err as Error).message || 'Unknown error'),
      pageContent: '',
      viewport: { width: window.innerWidth, height: window.innerHeight },
      refCount: getRefCount()
    }
  }
}

export function handleGetPageText(): { title: string; url: string; source: string; text: string } {
  const article = document.querySelector('article')
  const main = document.querySelector('main')
  const content = article || main || document.body

  let text = (content as HTMLElement).innerText || content.textContent || ''
  text = text.replace(/\s+/g, ' ').trim()

  const source = article ? 'article' : main ? 'main' : 'body'

  return {
    title: document.title,
    url: window.location.href,
    source,
    text
  }
}
