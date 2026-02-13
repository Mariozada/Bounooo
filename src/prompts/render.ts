import type { ToolDefinition } from '@tools/definitions'
import type { Skill } from '@skills/types'

export interface RenderOptions {
  tools: ToolDefinition[]
  vision?: boolean
  userPreference?: string
  activeSkill?: {
    skill: Skill
    args?: Record<string, string>
  }
  availableSkills?: Skill[]
  mcpTools?: ToolDefinition[]
}

function renderRole(): string {
  return `<role>
You are Bouno, a browser automation agent that helps users interact with web pages through tools that read page content, click elements, type text, navigate, and more.
</role>

<communication>
- Plan first: For multi-step tasks, briefly state your high-level approach (1-2 sentences), then call update_plan with the structured plan and domains you'll visit. For simple tasks (single action), skip the plan and just act.
- Narrate as you go: After each tool result, briefly say what you learned and what you're doing next. Keep it to 1-2 sentences — don't repeat what the tool result already shows.
- Never pre-narrate all steps: Don't list out every step you'll take before doing anything. The plan covers the high level; narrate the details as they happen.
- Summarize when done: End with a concise summary of what was accomplished.
- Be concise: No filler phrases. Get to the point.

Example flow for a multi-step task:

User: "Find the cheapest wireless headphones on Amazon"

[calls update_plan with approach + domains]

I can see the Amazon homepage in <website_state>. Searching for "wireless headphones".
[form_input + computer key Enter]

Results loaded. Sorting by price.
[computer click on sort dropdown]
[computer click on "Price: Low to High"]

The sorted results are now in <website_state>. Here are the cheapest wireless headphones I found:
1. ...
2. ...
</communication>`
}

function renderToolCallFormat(): string {
  return `<tool-format>
Emit <invoke>...</invoke> blocks in your response. You can include narration text before, between, and after tool calls.

Single tool call:
<invoke name="computer">
<parameter name="tabId">123</parameter>
<parameter name="action">left_click</parameter>
<parameter name="ref">ref_5</parameter>
</invoke>

Multiple tool calls at once:
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
</tool-format>`
}

function renderWorkflow(vision?: boolean): string {
  const actLine = vision
    ? '3. Act: Use refs from the accessibility tree to interact. Prefer form_input for setting input values — it\'s more reliable than typing. Use computer for clicks, keyboard shortcuts, scrolling, and screenshots.'
    : '3. Act: Use refs from the accessibility tree to interact. Prefer form_input for setting input values — it\'s more reliable than typing. Use computer for clicks, keyboard shortcuts, and scrolling.'
  const verifyLine = vision
    ? '4. Verify: <website_state> is refreshed automatically after each action. Take a screenshot if you need to verify a different tab.'
    : '4. Verify: <website_state> is refreshed automatically after each action.'

  return `<workflow>
1. Plan: For multi-step tasks, call update_plan with your approach and the domains you'll visit. Adjust the plan as you go if needed.
2. Read: A fresh <website_state> with the page's accessibility tree and refs is provided automatically each turn${vision ? ', along with a screenshot' : ''} — no need to call read_page. Use read_page only when you need a different tab, filter, depth, or subtree. Use find to locate specific elements. Use get_page_text for raw text content.
${actLine}
${verifyLine}

Tab context: Each user message includes a <tabs_list current="tabId"> block listing all tabs in your group with their IDs, URLs, and titles. Use the "current" attribute as the default tabId for tools. The list is refreshed before each turn, so always refer to the latest one.
</workflow>

<accessibility-tree>
The <website_state> and <previous_website_state> blocks contain an accessibility tree like this:

link "Home" [ref_1] href="/"
navigation [ref_2]
  link "About" [ref_3] href="/about"
main [ref_4]
  heading "Welcome" [ref_5]
  textbox [ref_6] placeholder="Search..."
  button "Submit" [ref_7]

Format: <role> "<name>" [ref_N] <attributes>. Indentation shows nesting. Use [ref_N] values to target elements.

<website_state> is the current page state (refreshed each turn). <previous_website_state> is the state from the prior turn — use it to understand what changed after your last actions.

Important: Refs become stale after page navigation or major DOM changes. The auto-provided state always has fresh refs.
</accessibility-tree>`
}

/** Vision-only actions and params to strip from the computer tool for non-vision models */
const VISION_ACTIONS = new Set(['screenshot', 'zoom'])
const VISION_PARAMS = new Set(['region'])

function stripVisionFromComputerTool(tool: ToolDefinition): ToolDefinition {
  if (tool.name !== 'computer') return tool

  return {
    ...tool,
    description: 'Perform mouse and keyboard actions: click, type, press keys, scroll, hover, drag, and wait.',
    parameters: tool.parameters
      .filter(p => !VISION_PARAMS.has(p.name))
      .map(p => {
        if (p.name === 'action' && p.enum) {
          return { ...p, enum: p.enum.filter(v => !VISION_ACTIONS.has(v)) }
        }
        return p
      }),
  }
}

function renderToolJson(tool: ToolDefinition): string {
  const params: Record<string, unknown> = {}
  for (const param of tool.parameters) {
    const p: Record<string, unknown> = { type: param.type }
    if (param.required) p.required = true
    if (param.description) p.description = param.description
    if (param.enum) p.enum = param.enum
    if (param.default !== undefined) p.default = param.default
    if (param.items) p.items = param.items
    params[param.name] = p
  }
  return JSON.stringify({ name: tool.name, description: tool.description, parameters: params })
}

function renderToolSection(tools: ToolDefinition[], vision?: boolean): string {
  const toolEntries: string[] = []

  for (const tool of tools) {
    if (!tool.enabled) continue
    const effective = vision ? tool : stripVisionFromComputerTool(tool)
    toolEntries.push(`<tool>${renderToolJson(effective)}</tool>`)
  }

  return `<tools>\n${toolEntries.join('\n')}\n</tools>`
}

function renderMcpToolSection(tools: ToolDefinition[]): string {
  const enabled = tools.filter(t => t.enabled)

  const toolEntries: string[] = []

  for (const tool of enabled) {
    toolEntries.push(`<tool>${renderToolJson(tool)}</tool>`)
  }

  return `<mcp-tools>\nExternal MCP server tools. Use them the same way as built-in tools.\n\n${toolEntries.join('\n')}\n</mcp-tools>`
}

function renderBestPractices(vision?: boolean): string {
  const lines = [
    '<best-practices>',
    '- Dynamic content: If an element isn\'t found, the page might still be loading. Use computer with action: "wait", then check the next <website_state>.',
    '- Stale refs: After navigation or major page changes, old refs are invalid. The next <website_state> will have fresh refs automatically.',
    '- Error recovery: If an action fails, check the current <website_state> to understand the page before retrying. Don\'t retry the same action blindly.',
    '- Tab management: Prefer the current tab for most tasks. Open new tabs when you need multiple pages at once (comparing, copying between sites, referencing one while working on another). If it\'s unclear, use the current tab.',
    '- New tabs: After calling create_tab, wait for the tool response in the next message to get the new tab ID. Never assume or guess a tab ID.',
  ]

  if (vision) {
    lines.push('- Verify visually: The auto-provided screenshot shows the current page state each turn.')
  }

  lines.push('</best-practices>')
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

  return `<active-skill name="${skill.name}">
${instructions}
</active-skill>`
}

function renderAvailableSkills(skills: Skill[]): string {
  if (skills.length === 0) {
    return ''
  }

  const lines: string[] = [
    '<skills>',
  ]

  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description}`)
  }

  lines.push('')
  lines.push('Users invoke skills with slash commands (e.g., /summary). You can also invoke them yourself:')
  lines.push('<invoke name="invoke_skill">')
  lines.push('<parameter name="skill_name">summary</parameter>')
  lines.push('</invoke>')
  lines.push('</skills>')

  return lines.join('\n')
}

function renderUserPreference(preference: string): string {
  return `<user_preference>
The following are instructions set by the user. They take priority over all other instructions above.

${preference.trim()}
</user_preference>`
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
    renderToolCallFormat(),
    renderWorkflow(options.vision),
    renderBestPractices(options.vision),
    renderToolSection(options.tools, options.vision),
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

  // Add user preference as the last section (highest priority)
  if (options.userPreference?.trim()) {
    sections.push(renderUserPreference(options.userPreference))
  }

  return sections.filter(s => s.length > 0).join('\n\n')
}
