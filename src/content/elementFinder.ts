import { assignRef } from './elementRefs'
import { getRole, getAccessibleName, isVisible, isInteractive } from './accessibilityTree'

interface SearchResult {
  element: Element
  score: number
}

interface FindResult {
  ref: string
  tag: string
  role: string
  name: string
  text: string
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  visible: boolean
  interactive: boolean
}

export function handleFindElements(params: { query: string }): {
  elements: FindResult[]
  count: number
  totalMatches: number
} {
  const { query } = params
  const queryLower = query.toLowerCase()
  const results: SearchResult[] = []
  const seen = new Set<Element>()

  const searchStrategies: Array<() => SearchResult[]> = [
    () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
      const matches: SearchResult[] = []
      let node: Node | null
      while ((node = walker.nextNode())) {
        const el = node as Element
        const text = (el.textContent || '').toLowerCase()
        if (text.includes(queryLower) && !seen.has(el)) {
          matches.push({ element: el, score: 3 })
          seen.add(el)
        }
      }
      return matches
    },

    () => {
      return Array.from(document.querySelectorAll('[aria-label]'))
        .filter(el => {
          const label = el.getAttribute('aria-label')
          return label && label.toLowerCase().includes(queryLower) && !seen.has(el)
        })
        .map(el => {
          seen.add(el)
          return { element: el, score: 5 }
        })
    },

    () => {
      return Array.from(document.querySelectorAll('[placeholder]'))
        .filter(el => {
          const placeholder = (el as HTMLInputElement).placeholder
          return placeholder && placeholder.toLowerCase().includes(queryLower) && !seen.has(el)
        })
        .map(el => {
          seen.add(el)
          return { element: el, score: 4 }
        })
    },

    () => {
      return Array.from(document.querySelectorAll('[title]'))
        .filter(el => {
          const title = el.getAttribute('title')
          return title && title.toLowerCase().includes(queryLower) && !seen.has(el)
        })
        .map(el => {
          seen.add(el)
          return { element: el, score: 3 }
        })
    },

    () => {
      const roleKeywords = ['button', 'link', 'input', 'search', 'menu', 'dialog', 'tab', 'checkbox', 'radio']
      const matchedRole = roleKeywords.find(r => queryLower.includes(r))
      if (matchedRole) {
        return Array.from(document.querySelectorAll(`[role="${matchedRole}"], ${matchedRole}`))
          .filter(el => !seen.has(el))
          .map(el => {
            seen.add(el)
            return { element: el, score: 2 }
          })
      }
      return []
    }
  ]

  for (const strategy of searchStrategies) {
    results.push(...strategy())
  }

  results.sort((a, b) => {
    const aVisible = isVisible(a.element) ? 1 : 0
    const bVisible = isVisible(b.element) ? 1 : 0
    if (aVisible !== bVisible) return bVisible - aVisible
    return b.score - a.score
  })

  const elements: FindResult[] = results.map(r => {
    const el = r.element
    const refId = assignRef(el)
    const rect = el.getBoundingClientRect()

    return {
      ref: refId,
      tag: el.tagName.toLowerCase(),
      role: getRole(el),
      name: getAccessibleName(el),
      text: (el.textContent || '').slice(0, 100).trim(),
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      visible: isVisible(el),
      interactive: isInteractive(el)
    }
  })

  return {
    elements,
    count: elements.length,
    totalMatches: results.length
  }
}
