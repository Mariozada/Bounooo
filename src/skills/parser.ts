/**
 * SKILL.md Parser
 *
 * Parses SKILL.md files with YAML frontmatter and markdown instructions.
 *
 * Format:
 * ```markdown
 * ---
 * name: my-skill
 * description: What this skill does
 * version: 1.0.0
 * ---
 * # Skill Instructions
 *
 * Your markdown instructions here...
 * ```
 */

import type { SkillFrontmatter, ParsedSkill, SkillArgument } from './types'

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Parse a SKILL.md file content into frontmatter and instructions
 */
export function parseSkillContent(content: string): ParsedSkill {
  const trimmed = content.trim()
  const match = trimmed.match(FRONTMATTER_REGEX)

  if (!match) {
    throw new Error('Invalid SKILL.md format: missing YAML frontmatter (must start with ---)')
  }

  const yamlContent = match[1]
  const instructions = trimmed.slice(match[0].length).trim()

  const frontmatter = parseYamlFrontmatter(yamlContent)

  if (!frontmatter.name) {
    throw new Error('Invalid SKILL.md: missing required "name" field in frontmatter')
  }

  if (!frontmatter.description) {
    throw new Error('Invalid SKILL.md: missing required "description" field in frontmatter')
  }

  return {
    frontmatter,
    instructions,
  }
}

/**
 * Simple YAML parser for frontmatter
 * Handles basic key-value pairs, arrays, and nested objects
 */
function parseYamlFrontmatter(yaml: string): SkillFrontmatter {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')

  let currentKey = ''
  let currentArray: unknown[] | null = null
  let currentObject: Record<string, unknown> | null = null
  let objectKey = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    // Check for array item
    if (trimmedLine.startsWith('- ')) {
      if (currentArray !== null) {
        const value = parseYamlValue(trimmedLine.slice(2).trim())
        // Check if it's an object item (like arguments array)
        if (typeof value === 'string' && value.includes(':')) {
          const objItem = parseInlineObject(trimmedLine.slice(2).trim(), lines, i)
          currentArray.push(objItem.obj)
          i = objItem.endIndex
        } else {
          currentArray.push(value)
        }
      }
      continue
    }

    // Check for indented object property
    const indentMatch = line.match(/^(\s+)(\w+):\s*(.*)$/)
    if (indentMatch && currentObject !== null) {
      const [, , key, value] = indentMatch
      currentObject[key] = parseYamlValue(value)
      continue
    }

    // Check for top-level key-value
    const kvMatch = trimmedLine.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      // Save previous array/object if any
      if (currentArray !== null && currentKey) {
        result[currentKey] = currentArray
        currentArray = null
      }
      if (currentObject !== null && objectKey) {
        result[objectKey] = currentObject
        currentObject = null
      }

      const [, key, value] = kvMatch
      currentKey = key

      if (value === '' || value === '|' || value === '>') {
        // Check next line for array or object
        const nextLine = lines[i + 1]?.trim() || ''
        if (nextLine.startsWith('- ')) {
          currentArray = []
        } else if (nextLine.match(/^\w+:/)) {
          currentObject = {}
          objectKey = key
        } else {
          result[key] = ''
        }
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array
        result[key] = parseInlineArray(value)
      } else {
        result[key] = parseYamlValue(value)
      }
    }
  }

  // Save any remaining array/object
  if (currentArray !== null && currentKey) {
    result[currentKey] = currentArray
  }
  if (currentObject !== null && objectKey) {
    result[objectKey] = currentObject
  }

  return normalizeFrontmatter(result)
}

/**
 * Parse an inline YAML array like [a, b, c]
 */
function parseInlineArray(value: string): unknown[] {
  const inner = value.slice(1, -1).trim()
  if (!inner) return []

  return inner.split(',').map(item => {
    const trimmed = item.trim()
    // Remove quotes if present
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1)
    }
    return parseYamlValue(trimmed)
  })
}

/**
 * Parse inline object from array item
 */
function parseInlineObject(
  firstLine: string,
  lines: string[],
  startIndex: number
): { obj: Record<string, unknown>; endIndex: number } {
  const obj: Record<string, unknown> = {}
  let endIndex = startIndex

  // Parse first line if it has a key
  const firstKv = firstLine.match(/^(\w+):\s*(.*)$/)
  if (firstKv) {
    obj[firstKv[1]] = parseYamlValue(firstKv[2])
  }

  // Look for indented properties on following lines
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    const indentMatch = line.match(/^(\s{2,})(\w+):\s*(.*)$/)

    if (indentMatch) {
      obj[indentMatch[2]] = parseYamlValue(indentMatch[3])
      endIndex = i
    } else if (line.trim().startsWith('- ') || line.match(/^\w+:/)) {
      // New array item or top-level key, stop
      break
    } else if (line.trim() === '') {
      continue
    } else {
      break
    }
  }

  return { obj, endIndex }
}

/**
 * Parse a YAML value (handle booleans, numbers, quoted strings)
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim()

  // Empty value
  if (trimmed === '' || trimmed === 'null' || trimmed === '~') {
    return undefined
  }

  // Booleans
  if (trimmed === 'true' || trimmed === 'yes' || trimmed === 'on') {
    return true
  }
  if (trimmed === 'false' || trimmed === 'no' || trimmed === 'off') {
    return false
  }

  // Quoted strings
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }

  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed)
  }

  // Plain string
  return trimmed
}

/**
 * Normalize parsed YAML to SkillFrontmatter type
 */
function normalizeFrontmatter(raw: Record<string, unknown>): SkillFrontmatter {
  const fm: SkillFrontmatter = {
    name: String(raw.name || ''),
    description: String(raw.description || ''),
  }

  if (raw.version !== undefined) {
    fm.version = String(raw.version)
  }

  if (raw.author !== undefined) {
    fm.author = String(raw.author)
  }

  if (raw.userInvocable !== undefined || raw['user-invocable'] !== undefined) {
    fm.userInvocable = Boolean(raw.userInvocable ?? raw['user-invocable'])
  }

  if (raw.autoDiscover !== undefined || raw['auto-discover'] !== undefined) {
    fm.autoDiscover = Boolean(raw.autoDiscover ?? raw['auto-discover'])
  }

  if (raw.allowedTools !== undefined || raw['allowed-tools'] !== undefined) {
    const tools = raw.allowedTools ?? raw['allowed-tools']
    if (Array.isArray(tools)) {
      fm.allowedTools = tools.map(String)
    }
  }

  if (raw.requires !== undefined && typeof raw.requires === 'object') {
    const req = raw.requires as Record<string, unknown>
    fm.requires = {}
    if (Array.isArray(req.tools)) {
      fm.requires.tools = req.tools.map(String)
    }
  }

  if (raw.arguments !== undefined && Array.isArray(raw.arguments)) {
    fm.arguments = (raw.arguments as Record<string, unknown>[]).map(arg => ({
      name: String(arg.name || ''),
      description: String(arg.description || ''),
      required: Boolean(arg.required),
      default: arg.default !== undefined ? String(arg.default) : undefined,
    })) as SkillArgument[]
  }

  return fm
}

/**
 * Validate a parsed skill
 */
export function validateParsedSkill(parsed: ParsedSkill): string[] {
  const errors: string[] = []

  if (!parsed.frontmatter.name) {
    errors.push('Missing required field: name')
  } else if (!/^[a-z0-9-]+$/.test(parsed.frontmatter.name)) {
    errors.push('Skill name must be lowercase alphanumeric with hyphens only')
  }

  if (!parsed.frontmatter.description) {
    errors.push('Missing required field: description')
  }

  if (!parsed.instructions || parsed.instructions.length < 10) {
    errors.push('Skill instructions are too short (minimum 10 characters)')
  }

  return errors
}

/**
 * Escape a YAML string value if needed
 * Quotes strings containing special characters
 */
function escapeYamlValue(value: string): string {
  // Check if the value needs quoting
  const needsQuoting =
    value.includes(':') ||
    value.includes('#') ||
    value.includes("'") ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value.startsWith('-') ||
    value.startsWith('[') ||
    value.startsWith('{') ||
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    /^\d/.test(value)

  if (!needsQuoting) {
    return value
  }

  // Use double quotes and escape internal quotes
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

/**
 * Serialize a skill back to SKILL.md format
 */
export function serializeSkill(frontmatter: SkillFrontmatter, instructions: string): string {
  const lines: string[] = ['---']

  lines.push(`name: ${escapeYamlValue(frontmatter.name)}`)
  lines.push(`description: ${escapeYamlValue(frontmatter.description)}`)

  if (frontmatter.version) {
    lines.push(`version: ${escapeYamlValue(frontmatter.version)}`)
  }

  if (frontmatter.author) {
    lines.push(`author: ${escapeYamlValue(frontmatter.author)}`)
  }

  if (frontmatter.userInvocable !== undefined) {
    lines.push(`user-invocable: ${frontmatter.userInvocable}`)
  }

  if (frontmatter.autoDiscover !== undefined) {
    lines.push(`auto-discover: ${frontmatter.autoDiscover}`)
  }

  if (frontmatter.allowedTools && frontmatter.allowedTools.length > 0) {
    const escapedTools = frontmatter.allowedTools.map(escapeYamlValue)
    lines.push(`allowed-tools: [${escapedTools.join(', ')}]`)
  }

  if (frontmatter.requires?.tools && frontmatter.requires.tools.length > 0) {
    const escapedRequiredTools = frontmatter.requires.tools.map(escapeYamlValue)
    lines.push('requires:')
    lines.push(`  tools: [${escapedRequiredTools.join(', ')}]`)
  }

  if (frontmatter.arguments && frontmatter.arguments.length > 0) {
    lines.push('arguments:')
    for (const arg of frontmatter.arguments) {
      lines.push(`  - name: ${escapeYamlValue(arg.name)}`)
      lines.push(`    description: ${escapeYamlValue(arg.description)}`)
      if (arg.required) {
        lines.push(`    required: true`)
      }
      if (arg.default !== undefined) {
        lines.push(`    default: ${escapeYamlValue(arg.default)}`)
      }
    }
  }

  lines.push('---')
  lines.push('')
  lines.push(instructions)

  return lines.join('\n')
}
