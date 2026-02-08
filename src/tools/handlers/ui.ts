import { registerTool } from '../registry'

let currentPlan: {
  approach: string
  domains: string[]
  createdAt: number
} | null = null

async function updatePlan(params: {
  approach: string
  domains: string[]
}): Promise<unknown> {
  const { approach, domains } = params

  if (!approach || typeof approach !== 'string') {
    throw new Error('approach (string description) is required')
  }

  // Normalize domains: accept array, string, or missing
  const normalizedDomains = Array.isArray(domains)
    ? domains
    : typeof domains === 'string'
      ? [domains]
      : []

  currentPlan = {
    approach,
    domains: normalizedDomains,
    createdAt: Date.now()
  }

  return {
    status: 'plan_created',
    plan: currentPlan,
    message: 'Plan created and ready for user approval.'
  }
}

export function getCurrentPlan() {
  return currentPlan
}

export function clearPlan(): void {
  currentPlan = null
}

export function registerUiTools(): void {
  registerTool('update_plan', updatePlan as (params: Record<string, unknown>) => Promise<unknown>)
}
