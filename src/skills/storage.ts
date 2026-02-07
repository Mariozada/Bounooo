/**
 * Skill Storage Operations
 *
 * CRUD operations for skills in IndexedDB
 */

import { db } from '@storage/db'
import type { StoredSkill, SkillSource, SkillInput, Skill } from './types'
import { generateSkillId } from './types'
import { parseSkillContent, validateParsedSkill, serializeSkill } from './parser'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[SkillStorage]', ...args)

/**
 * Get all stored skills
 */
export async function getAllSkills(): Promise<StoredSkill[]> {
  return db.skills.orderBy('installedAt').reverse().toArray()
}

/**
 * Get all enabled skills
 */
export async function getEnabledSkills(): Promise<StoredSkill[]> {
  return db.skills.where('enabled').equals(1).toArray()
}

/**
 * Get a skill by ID
 */
export async function getSkill(id: string): Promise<StoredSkill | undefined> {
  return db.skills.get(id)
}

/**
 * Get a skill by name
 */
export async function getSkillByName(name: string): Promise<StoredSkill | undefined> {
  return db.skills.where('name').equals(name).first()
}

/**
 * Check if a skill with the given name exists
 */
export async function skillExists(name: string): Promise<boolean> {
  const count = await db.skills.where('name').equals(name).count()
  return count > 0
}

/**
 * Install a skill from SKILL.md content
 */
export async function installSkill(input: SkillInput): Promise<StoredSkill> {
  log('Installing skill from content...')

  // Parse the SKILL.md content
  const parsed = parseSkillContent(input.rawContent)

  // Validate
  const errors = validateParsedSkill(parsed)
  if (errors.length > 0) {
    throw new Error(`Invalid skill: ${errors.join(', ')}`)
  }

  // Check if skill with same name exists
  const existing = await getSkillByName(parsed.frontmatter.name)
  if (existing) {
    throw new Error(`Skill "${parsed.frontmatter.name}" already exists. Uninstall it first or use updateSkill.`)
  }

  const now = Date.now()
  const skill: StoredSkill = {
    id: generateSkillId(),
    name: parsed.frontmatter.name,
    description: parsed.frontmatter.description,
    version: parsed.frontmatter.version || '1.0.0',
    author: parsed.frontmatter.author,

    rawContent: input.rawContent,
    frontmatter: parsed.frontmatter,
    instructions: parsed.instructions,

    source: input.source || 'user',
    enabled: true,
    userInvocable: parsed.frontmatter.userInvocable ?? true,
    autoDiscover: parsed.frontmatter.autoDiscover ?? false,

    installedAt: now,
    updatedAt: now,
  }

  await db.skills.add(skill)
  log('Skill installed:', skill.name, skill.id)

  return skill
}

/**
 * Update an existing skill
 */
export async function updateSkill(
  id: string,
  updates: Partial<Pick<StoredSkill, 'enabled' | 'rawContent'>>
): Promise<StoredSkill | undefined> {
  const existing = await getSkill(id)
  if (!existing) {
    return undefined
  }

  const updateData: Partial<StoredSkill> = {
    updatedAt: Date.now(),
  }

  if (updates.enabled !== undefined) {
    updateData.enabled = updates.enabled
  }

  if (updates.rawContent !== undefined) {
    // Re-parse the content
    const parsed = parseSkillContent(updates.rawContent)
    const errors = validateParsedSkill(parsed)
    if (errors.length > 0) {
      throw new Error(`Invalid skill: ${errors.join(', ')}`)
    }

    updateData.rawContent = updates.rawContent
    updateData.frontmatter = parsed.frontmatter
    updateData.instructions = parsed.instructions
    updateData.name = parsed.frontmatter.name
    updateData.description = parsed.frontmatter.description
    updateData.version = parsed.frontmatter.version || existing.version
    updateData.author = parsed.frontmatter.author
    updateData.userInvocable = parsed.frontmatter.userInvocable ?? true
    updateData.autoDiscover = parsed.frontmatter.autoDiscover ?? false
  }

  await db.skills.update(id, updateData)
  log('Skill updated:', id)

  return getSkill(id)
}

/**
 * Enable or disable a skill
 */
export async function setSkillEnabled(id: string, enabled: boolean): Promise<void> {
  await db.skills.update(id, { enabled, updatedAt: Date.now() })
  log('Skill', id, enabled ? 'enabled' : 'disabled')
}

/**
 * Uninstall (delete) a skill
 */
export async function uninstallSkill(id: string): Promise<boolean> {
  const skill = await getSkill(id)
  if (!skill) {
    return false
  }

  await db.skills.delete(id)
  log('Skill uninstalled:', skill.name, id)
  return true
}

/**
 * Uninstall a skill by name
 */
export async function uninstallSkillByName(name: string): Promise<boolean> {
  const skill = await getSkillByName(name)
  if (!skill) {
    return false
  }
  return uninstallSkill(skill.id)
}

/**
 * Delete all skills
 */
export async function deleteAllSkills(): Promise<void> {
  await db.skills.clear()
  log('All skills deleted')
}

/**
 * Delete all skills from a specific source
 */
export async function deleteSkillsBySource(source: SkillSource): Promise<number> {
  const skills = await db.skills.where('source').equals(source).toArray()
  const ids = skills.map(s => s.id)
  await db.skills.bulkDelete(ids)
  log('Deleted', ids.length, 'skills from source:', source)
  return ids.length
}

/**
 * Export a skill to SKILL.md format
 */
export async function exportSkill(id: string): Promise<string | undefined> {
  const skill = await getSkill(id)
  if (!skill) {
    return undefined
  }
  return skill.rawContent
}

/**
 * Convert StoredSkill to runtime Skill
 */
export function storedSkillToSkill(stored: StoredSkill): Skill {
  return {
    id: stored.id,
    name: stored.name,
    description: stored.description,
    version: stored.version,
    author: stored.author,

    instructions: stored.instructions,
    frontmatter: stored.frontmatter,

    source: stored.source,
    enabled: stored.enabled,
    userInvocable: stored.userInvocable,
    autoDiscover: stored.autoDiscover,

    allowedTools: stored.frontmatter.allowedTools,
    arguments: stored.frontmatter.arguments,
  }
}

/**
 * Get skill count
 */
export async function getSkillCount(): Promise<number> {
  return db.skills.count()
}

/**
 * Get skills by source
 */
export async function getSkillsBySource(source: SkillSource): Promise<StoredSkill[]> {
  return db.skills.where('source').equals(source).toArray()
}

/**
 * Import multiple skills at once (for bulk operations)
 */
export async function importSkills(
  contents: string[],
  source: SkillSource = 'user'
): Promise<{ installed: StoredSkill[]; errors: { index: number; error: string }[] }> {
  const installed: StoredSkill[] = []
  const errors: { index: number; error: string }[] = []

  for (let i = 0; i < contents.length; i++) {
    try {
      const skill = await installSkill({ rawContent: contents[i], source })
      installed.push(skill)
    } catch (err) {
      errors.push({ index: i, error: (err as Error).message })
    }
  }

  return { installed, errors }
}
