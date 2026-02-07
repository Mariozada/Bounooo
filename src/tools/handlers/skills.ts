import { registerTool } from '../registry'
import { getSkillByName, storedSkillToSkill } from '@skills/storage'

/**
 * Invoke a skill by name
 * Returns the skill instructions so the agent can follow them
 */
async function invokeSkill(params: {
  skill_name: string
}): Promise<unknown> {
  const { skill_name } = params

  if (!skill_name || typeof skill_name !== 'string') {
    throw new Error('skill_name is required')
  }

  // Look up the skill
  const storedSkill = await getSkillByName(skill_name)

  if (!storedSkill) {
    return {
      status: 'error',
      error: `Skill "${skill_name}" not found. Use a valid skill name from the installed skills list.`,
    }
  }

  if (!storedSkill.enabled) {
    return {
      status: 'error',
      error: `Skill "${skill_name}" is disabled.`,
    }
  }

  const skill = storedSkillToSkill(storedSkill)

  return {
    status: 'success',
    skill_name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
    message: `Skill "${skill.name}" activated. Follow the instructions below to complete the task.`,
  }
}

export function registerSkillTools(): void {
  registerTool('invoke_skill', invokeSkill as (params: Record<string, unknown>) => Promise<unknown>)
}
