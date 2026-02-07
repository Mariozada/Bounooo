/**
 * Skill Manager
 *
 * Manages skill loading, invocation, and integration with the agent.
 */

import type { Skill, SkillInvocation } from './types'
import {
  getAllSkills,
  getEnabledSkills,
  getSkillByName,
  installSkill,
  getSkillsBySource,
  storedSkillToSkill,
} from './storage'
import { BUILTIN_SKILLS } from './builtin'

const DEBUG = true
const log = (...args: unknown[]) => DEBUG && console.log('[SkillManager]', ...args)

// In-memory cache of loaded skills
let skillCache: Skill[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5000 // 5 seconds

/**
 * Initialize built-in skills if they don't exist
 */
export async function initializeBuiltinSkills(): Promise<void> {
  const existingBuiltin = await getSkillsBySource('builtin')

  if (existingBuiltin.length === 0) {
    log('Installing built-in skills...')
    for (const content of BUILTIN_SKILLS) {
      try {
        await installSkill({ rawContent: content, source: 'builtin' })
      } catch (err) {
        console.error('[SkillManager] Failed to install built-in skill:', err)
      }
    }
    log('Built-in skills installed')
  } else {
    log('Built-in skills already exist:', existingBuiltin.length)
  }
}

/**
 * Load all enabled skills (with caching)
 */
export async function loadSkills(forceRefresh = false): Promise<Skill[]> {
  const now = Date.now()

  if (!forceRefresh && skillCache && now - cacheTimestamp < CACHE_TTL) {
    return skillCache
  }

  const stored = await getEnabledSkills()
  skillCache = stored.map(storedSkillToSkill)
  cacheTimestamp = now

  log('Loaded', skillCache.length, 'enabled skills')
  return skillCache
}

/**
 * Invalidate the skill cache (call after changes)
 */
export function invalidateSkillCache(): void {
  skillCache = null
  cacheTimestamp = 0
}

/**
 * Get skills that are user-invocable (for slash commands)
 */
export async function getUserInvocableSkills(): Promise<Skill[]> {
  const skills = await loadSkills()
  return skills.filter(s => s.userInvocable)
}

/**
 * Get skills that are auto-discoverable (for agent)
 */
export async function getAutoDiscoverableSkills(): Promise<Skill[]> {
  const skills = await loadSkills()
  return skills.filter(s => s.autoDiscover)
}

/**
 * Get a skill by name
 */
export async function getSkillByNameFromCache(name: string): Promise<Skill | undefined> {
  const skills = await loadSkills()
  return skills.find(s => s.name === name)
}

/**
 * Parse a slash command from user input
 * Returns skill name and arguments if it's a skill command, null otherwise
 */
export function parseSlashCommand(input: string): { skillName: string; args: string } | null {
  const trimmed = input.trim()

  if (!trimmed.startsWith('/')) {
    return null
  }

  // Match /skill-name or /skill-name args
  const match = trimmed.match(/^\/([a-z0-9-]+)(?:\s+(.*))?$/i)
  if (!match) {
    return null
  }

  return {
    skillName: match[1].toLowerCase(),
    args: match[2] || '',
  }
}

/**
 * Invoke a skill by name
 */
export async function invokeSkill(
  name: string,
  args: Record<string, string> = {},
  triggeredBy: 'user' | 'agent' = 'user'
): Promise<SkillInvocation | null> {
  const skill = await getSkillByNameFromCache(name)

  if (!skill) {
    log('Skill not found:', name)
    return null
  }

  if (!skill.enabled) {
    log('Skill is disabled:', name)
    return null
  }

  if (triggeredBy === 'user' && !skill.userInvocable) {
    log('Skill is not user-invocable:', name)
    return null
  }

  log('Invoking skill:', name, 'triggered by:', triggeredBy)

  return {
    skillId: skill.id,
    skillName: skill.name,
    arguments: args,
    triggeredBy,
  }
}

/**
 * Parse arguments string into key-value pairs
 * Supports: key=value key2=value2 or just plain text for first argument
 */
export function parseSkillArguments(
  argsString: string,
  skillArgs?: { name: string; required?: boolean }[]
): Record<string, string> {
  const result: Record<string, string> = {}
  const trimmed = argsString.trim()

  if (!trimmed) {
    return result
  }

  // Try to parse key=value pairs
  const kvRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g
  let match: RegExpExecArray | null
  let lastIndex = 0
  let hasKvPairs = false

  while ((match = kvRegex.exec(trimmed)) !== null) {
    hasKvPairs = true
    const key = match[1]
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    result[key] = value
    lastIndex = kvRegex.lastIndex
  }

  // If no key=value pairs and we have skill argument definitions,
  // treat the whole string as the first argument's value
  if (!hasKvPairs && skillArgs && skillArgs.length > 0) {
    result[skillArgs[0].name] = trimmed
  }

  return result
}

/**
 * Get skill instructions with argument substitution
 */
export function getSkillInstructionsWithArgs(
  skill: Skill,
  args: Record<string, string>
): string {
  let instructions = skill.instructions

  // Substitute $argName or ${argName} placeholders
  for (const [key, value] of Object.entries(args)) {
    instructions = instructions.replace(
      new RegExp(`\\$\\{${key}\\}|\\$${key}\\b`, 'g'),
      value
    )
  }

  return instructions
}

/**
 * Build skill context for system prompt
 * Returns the skill instructions to inject
 */
export function buildSkillContext(skill: Skill, args: Record<string, string> = {}): string {
  const lines: string[] = []

  lines.push(`## Active Skill: ${skill.name}`)
  lines.push('')
  lines.push(getSkillInstructionsWithArgs(skill, args))

  return lines.join('\n')
}

/**
 * Build available skills section for system prompt
 * This lets the agent know what skills it can invoke
 */
export async function buildAvailableSkillsSection(): Promise<string> {
  const skills = await getAutoDiscoverableSkills()

  if (skills.length === 0) {
    return ''
  }

  const lines: string[] = [
    '## Available Skills',
    '',
    'You can invoke these skills using the `invoke_skill` tool when they would help with the task:',
    '',
  ]

  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`)
    if (skill.arguments && skill.arguments.length > 0) {
      const argStr = skill.arguments
        .map(a => `${a.name}${a.required ? '' : '?'}`)
        .join(', ')
      lines.push(`  Arguments: ${argStr}`)
    }
  }

  lines.push('')

  return lines.join('\n')
}

/**
 * Get skill suggestions for autocomplete
 */
export async function getSkillSuggestions(prefix: string): Promise<Skill[]> {
  const skills = await getUserInvocableSkills()
  const lowerPrefix = prefix.toLowerCase()

  return skills.filter(s =>
    s.name.toLowerCase().startsWith(lowerPrefix) ||
    s.description.toLowerCase().includes(lowerPrefix)
  )
}
