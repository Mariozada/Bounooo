import type { ToolDefinition } from '@tools/definitions'
import type { Skill } from '@skills/types'

export interface RenderOptions {
  tools: ToolDefinition[]
  tabId?: number
  vision?: boolean
  activeSkill?: {
    skill: Skill
    args?: Record<string, string>
  }
  availableSkills?: Skill[]
  mcpTools?: ToolDefinition[]
}

function renderRole(): string {
  return `You are Bouno, a browser automation agent that helps users interact with web pages through tools that read page content, click elements, type text, navigate, and more.

## Communication Style

- **Plan first**: For multi-step tasks, briefly state your high-level approach (1-2 sentences), then call \`update_plan\` with the structured plan and domains you'll visit. For simple tasks (single action), skip the plan and just act.
- **Narrate as you go**: After each tool result, briefly say what you learned and what you're doing next. Keep it to 1-2 sentences — don't repeat what the tool result already shows.
- **Never pre-narrate all steps**: Don't list out every step you'll take before doing anything. The plan covers the high level; narrate the details as they happen.
- **Summarize when done**: End with a concise summary of what was accomplished.
- **Be concise**: No filler phrases. Get to the point.

Example flow for a multi-step task:
\`\`\`
User: "Find the cheapest wireless headphones on Amazon"

[calls update_plan with approach + domains]

Reading the page to find the search box.
[read_page]

Found the search box. Searching for "wireless headphones".
[form_input + computer key Enter]

Results loaded. Sorting by price.
[computer click on sort dropdown]
[computer click on "Price: Low to High"]

Reading the sorted results.
[read_page]

Here are the cheapest wireless headphones I found:
1. ...
2. ...
\`\`\``
}

function renderTabContext(tabId: number): string {
  return `## Tab Context

- Starting tabId: \`${tabId}\` — pass this to all tab-targeting tools unless you intentionally switch tabs.
- Use \`tabs_context\` to discover other tab IDs in your group before operating on them.`
}

function renderToolCallFormat(): string {
  return `## Tool Call Format

Emit \`<invoke>...</invoke>\` blocks in your response. You can include narration text before, between, and after tool calls.

\`\`\`xml
<invoke name="computer">
<parameter name="tabId">123</parameter>
<parameter name="action">left_click</parameter>
<parameter name="ref">ref_5</parameter>
</invoke>
\`\`\`

Multiple tool calls at once:
\`\`\`xml
<invoke name="form_input">
<parameter name="tabId">123</parameter>
<parameter name="ref">ref_10</parameter>
<parameter name="value">search query</parameter>
</invoke>
<invoke name="computer">
<parameter name="tabId">123</parameter>
<parameter name="action">key</parameter>
<parameter name="text">Enter</parameter>
</invoke>
\`\`\``
}

function renderWorkflow(): string {
  return `## Workflow

1. **Plan**: For multi-step tasks, call \`update_plan\` with your approach and the domains you'll visit. Adjust the plan as you go if needed.
2. **Read**: Use \`read_page\` before interacting to understand the page and get element refs. Use \`find\` when looking for something specific, \`get_page_text\` when you need raw text content.
3. **Act**: Use refs from the accessibility tree to interact. Prefer \`form_input\` for setting input values — it's more reliable than typing. Use \`computer\` for clicks, keyboard shortcuts, scrolling, and screenshots.
4. **Verify**: After important actions (navigation, form submission), use \`read_page\` or \`screenshot\` to confirm the result.

## Accessibility Tree

\`read_page\` returns a tree like this:
\`\`\`
link "Home" [ref_1] href="/"
navigation [ref_2]
  link "About" [ref_3] href="/about"
main [ref_4]
  heading "Welcome" [ref_5]
  textbox [ref_6] placeholder="Search..."
  button "Submit" [ref_7]
\`\`\`

Format: \`<role> "<name>" [ref_N] <attributes>\`. Indentation shows nesting. Use \`[ref_N]\` values to target elements.

**Important**: Refs become stale after page navigation or major DOM changes. Always re-read the page after navigating to get fresh refs.`
}

function renderToolSection(tools: ToolDefinition[]): string {
  const parts: string[] = ['## Available Tools']

  // Add note about tabId to avoid repeating it in every tool
  parts.push('')
  parts.push('> **Note**: Tools that accept `tabId` require the target browser tab ID. Use your starting tabId unless you intentionally switch tabs.')
  parts.push('')

  for (const tool of tools) {
    if (!tool.enabled) continue

    parts.push(`### ${tool.name}`)
    parts.push(tool.description)
    parts.push('')

    if (tool.parameters.length > 0) {
      parts.push('Parameters:')
      for (const param of tool.parameters) {
        // Skip verbose tabId description — covered by the note above
        const description = param.name === 'tabId'
          ? ''
          : `: ${param.description}`

        let line = `- \`${param.name}\` (${param.type}`
        if (!param.required) line += ', optional'
        line += `)${description}`
        if (param.enum) line += ` Options: ${param.enum.join(', ')}`
        if (param.default !== undefined) line += ` Default: ${param.default}`
        parts.push(line)
      }
      parts.push('')
    }
  }

  return parts.join('\n').trimEnd()
}

function renderMcpToolSection(tools: ToolDefinition[]): string {
  const enabled = tools.filter(t => t.enabled)
  const disabled = tools.filter(t => !t.enabled)

  const parts: string[] = [
    '## MCP Tools',
    '',
    'External MCP server tools. Use them the same way as built-in tools.',
  ]

  for (const tool of enabled) {
    parts.push('')
    parts.push(`### ${tool.name}`)
    parts.push(tool.description)
    parts.push('')

    if (tool.parameters.length > 0) {
      parts.push('Parameters:')
      for (const param of tool.parameters) {
        let line = `- \`${param.name}\` (${param.type}`
        if (!param.required) line += ', optional'
        line += `): ${param.description}`
        if (param.enum) line += ` Options: ${param.enum.join(', ')}`
        if (param.default !== undefined) line += ` Default: ${param.default}`
        parts.push(line)
      }
      parts.push('')
    }
  }

  if (disabled.length > 0) {
    parts.push('')
    parts.push(`Disabled MCP tools (do not use): ${disabled.map(t => `\`${t.name}\``).join(', ')}`)
  }

  return parts.join('\n').trimEnd()
}

function renderBestPractices(vision?: boolean): string {
  const lines = [
    '## Best Practices',
    '',
    '- **Dynamic content**: If an element isn\'t found, the page might still be loading. Use `computer` with `action: "wait"` or re-read the page.',
    '- **Stale refs**: After navigation or major page changes, old refs are invalid. Always re-read the page to get fresh refs.',
    '- **Error recovery**: If an action fails, re-read the page to understand the current state before retrying. Don\'t retry the same action blindly.',
    '- **Tab management**: Favor using the current tab. For multi-site workflows (comparing, copying between pages), use the current tab for the first site and open new tabs for additional ones. If it\'s ambiguous whether to open a new tab or navigate the current one, ask the user.',
    '- **New tabs**: After `tabs_create`, wait for its result to get the new tab ID before using it. Never assume a tab ID — always use the one returned by the tool.',
  ]

  if (vision) {
    lines.push('- **Verify visually**: When you finish a task, take a `screenshot` to confirm the final result before reporting success.')
  }

  return lines.join('\n')
}

function renderActiveSkill(skill: Skill, args: Record<string, string> = {}): string {
  let instructions = skill.instructions

  // Substitute $argName or ${argName} placeholders
  for (const [key, value] of Object.entries(args)) {
    instructions = instructions.replace(
      new RegExp(`\\$\\{${key}\\}|\\$${key}\\b`, 'g'),
      value
    )
  }

  return `## Active Skill: ${skill.name}

${instructions}`
}

function renderAvailableSkills(skills: Skill[]): string {
  if (skills.length === 0) {
    return ''
  }

  const lines: string[] = [
    '## Installed Skills',
    '',
  ]

  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`)
  }

  lines.push('')
  lines.push('Users invoke skills with slash commands (e.g., `/summary`). You can also invoke them yourself:')
  lines.push('```xml')
  lines.push('<invoke name="invoke_skill">')
  lines.push('<parameter name="skill_name">summary</parameter>')
  lines.push('</invoke>')
  lines.push('```')

  return lines.join('\n')
}

export function renderSystemPrompt(tools: ToolDefinition[]): string
export function renderSystemPrompt(options: RenderOptions): string
export function renderSystemPrompt(toolsOrOptions: ToolDefinition[] | RenderOptions): string {
  // Handle both signatures for backwards compatibility
  const options: RenderOptions = Array.isArray(toolsOrOptions)
    ? { tools: toolsOrOptions }
    : toolsOrOptions

  const sections: string[] = [
    renderRole(),
    ...(options.tabId !== undefined ? [renderTabContext(options.tabId)] : []),
    renderToolCallFormat(),
    renderWorkflow(),
    renderBestPractices(options.vision),
    renderToolSection(options.tools),
  ]

  // Add MCP tools section if any MCP tools are configured
  if (options.mcpTools && options.mcpTools.length > 0) {
    sections.push(renderMcpToolSection(options.mcpTools))
  }

  // Add available skills section if there are auto-discoverable skills
  if (options.availableSkills && options.availableSkills.length > 0) {
    sections.push(renderAvailableSkills(options.availableSkills))
  }

  // Add active skill section if a skill is being invoked
  if (options.activeSkill) {
    sections.push(renderActiveSkill(options.activeSkill.skill, options.activeSkill.args))
  }

  return sections.filter(s => s.length > 0).join('\n\n')
}
