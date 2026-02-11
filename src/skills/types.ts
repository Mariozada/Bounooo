/**
 * Skill Types and Interfaces
 *
 * Skills are reusable instruction packages that extend the agent's capabilities.
 * They consist of a SKILL.md file with YAML frontmatter and markdown instructions.
 */

/**
 * Skill source - where the skill came from
 */
export type SkillSource = 'builtin' | 'user' | 'registry' | 'marketplace'

/**
 * Parsed YAML frontmatter from SKILL.md
 */
export interface SkillFrontmatter {
  // Identity
  name: string
  description: string
  version?: string
  author?: string

  // Invocation settings
  userInvocable?: boolean      // Show in slash command menu (default: true)
  autoDiscover?: boolean       // Agent can invoke autonomously (default: false)

  // Tool restrictions
  allowedTools?: string[]      // Whitelist of tools this skill can use

  // Dependencies
  requires?: {
    tools?: string[]           // Required tools that must be available
  }

  // Arguments for parameterized skills
  arguments?: SkillArgument[]
}

/**
 * Argument definition for parameterized skills
 */
export interface SkillArgument {
  name: string
  description: string
  required?: boolean
  default?: string
}

/**
 * Stored skill in IndexedDB
 */
export interface StoredSkill {
  id: string
  name: string                  // Unique name (used as /command)
  description: string
  version: string
  author?: string

  // Content
  rawContent: string            // Full SKILL.md content
  frontmatter: SkillFrontmatter // Parsed YAML header
  instructions: string          // Markdown body (after frontmatter)

  // Settings
  source: SkillSource
  enabled: boolean
  userInvocable: boolean
  autoDiscover: boolean

  // Metadata
  installedAt: number
  updatedAt: number

  // Marketplace data (if purchased from marketplace)
  marketplaceData?: {
    mint: string           // NFT mint address
    purchasedAt: number    // Timestamp of purchase
    seller: string         // Seller wallet address
    pricePaid: number      // Price paid in lamports
  }
}

/**
 * Skill for runtime use (after loading)
 */
export interface Skill {
  id: string
  name: string
  description: string
  version: string
  author?: string

  instructions: string
  frontmatter: SkillFrontmatter

  source: SkillSource
  enabled: boolean
  userInvocable: boolean
  autoDiscover: boolean

  // Resolved at runtime
  allowedTools?: string[]
  arguments?: SkillArgument[]
}

/**
 * Input for creating/installing a new skill
 */
export interface SkillInput {
  rawContent: string           // Full SKILL.md content
  source?: SkillSource
}

/**
 * Result of parsing a SKILL.md file
 */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter
  instructions: string
}

/**
 * Skill invocation context (when a skill is triggered)
 */
export interface SkillInvocation {
  skillId: string
  skillName: string
  arguments: Record<string, string>
  triggeredBy: 'user' | 'agent'
}

/**
 * Generate a unique skill ID
 */
export function generateSkillId(): string {
  return `skill_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}
