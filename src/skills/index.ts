/**
 * Skills Module
 *
 * Public API for the Bouno skills system.
 */

// Types
export type {
  SkillSource,
  SkillFrontmatter,
  SkillArgument,
  StoredSkill,
  Skill,
  SkillInput,
  ParsedSkill,
  SkillInvocation,
} from './types'
export { generateSkillId } from './types'

// Parser
export {
  parseSkillContent,
  validateParsedSkill,
  serializeSkill,
} from './parser'

// Storage
export {
  getAllSkills,
  getEnabledSkills,
  getSkill,
  getSkillByName,
  skillExists,
  installSkill,
  updateSkill,
  setSkillEnabled,
  uninstallSkill,
  uninstallSkillByName,
  deleteAllSkills,
  deleteSkillsBySource,
  exportSkill,
  storedSkillToSkill,
  getSkillCount,
  getSkillsBySource,
  importSkills,
  // Marketplace functions
  installSkillFromMarketplace,
  getMarketplaceSkills,
  isSkillMintInstalled,
} from './storage'

// Manager
export {
  initializeBuiltinSkills,
  loadSkills,
  invalidateSkillCache,
  getUserInvocableSkills,
  getAutoDiscoverableSkills,
  getSkillByNameFromCache,
  parseSlashCommand,
  invokeSkill,
  parseSkillArguments,
  getSkillInstructionsWithArgs,
  buildSkillContext,
  buildAvailableSkillsSection,
  getSkillSuggestions,
} from './manager'

// Built-in skills
export { BUILTIN_SKILLS } from './builtin'
