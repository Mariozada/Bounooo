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

import { parse, stringify } from 'yaml'
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

  const raw = parse(yamlContent) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid SKILL.md: frontmatter is not a valid YAML object')
  }

  const frontmatter = normalizeFrontmatter(raw)

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
 * Serialize a skill back to SKILL.md format
 */
export function serializeSkill(frontmatter: SkillFrontmatter, instructions: string): string {
  const obj: Record<string, unknown> = {
    name: frontmatter.name,
    description: frontmatter.description,
  }

  if (frontmatter.version) obj.version = frontmatter.version
  if (frontmatter.author) obj.author = frontmatter.author
  if (frontmatter.userInvocable !== undefined) obj['user-invocable'] = frontmatter.userInvocable
  if (frontmatter.autoDiscover !== undefined) obj['auto-discover'] = frontmatter.autoDiscover
  if (frontmatter.allowedTools?.length) obj['allowed-tools'] = frontmatter.allowedTools
  if (frontmatter.requires?.tools?.length) obj.requires = { tools: frontmatter.requires.tools }
  if (frontmatter.arguments?.length) obj.arguments = frontmatter.arguments

  const yaml = stringify(obj, { lineWidth: 0 }).trimEnd()

  return `---\n${yaml}\n---\n\n${instructions}`
}
