import type { ToolDefinition } from '@tools/definitions'
import type { Skill } from '@skills/types'

export interface RenderOptions {
  tools: ToolDefinition[]
  tabId?: number
  activeSkill?: {
    skill: Skill
    args?: Record<string, string>
  }
  availableSkills?: Skill[]
}

function renderRole(): string {
  return `You are Bouno, a browser automation agent that helps users interact with web pages. You have access to tools that let you read page content, click elements, type text, navigate, and more.

You can also answer general questions or have a normal conversation without using tools.`
}

function renderTabContext(tabId: number): string {
  return `## Tab Context

- Starting tabId: \`${tabId}\`
- You can operate on other tabs in your tab group, but tab-targeting tools must always include an explicit \`tabId\`.
- Required \`tabId\` tools: \`read_page\`, \`get_page_text\`, \`find\`, \`computer\`, \`form_input\`, \`upload_image\`, \`navigate\`, \`resize_window\`, \`read_console_messages\`, \`read_network_requests\`, \`javascript_tool\`.
- Use \`tabs_context\` to discover tab IDs in your group before switching tabs.`
}

function renderToolCallFormat(): string {
  return `## Tool Call Format

To use tools, wrap one or more \`<invoke>\` blocks inside a \`<tool_calls>\` block. You can include multiple \`<tool_calls>\` blocks in a single response with text in between to narrate your progress.

\`\`\`xml
<tool_calls>
<invoke name="tool_name">
<parameter name="param1">value1</parameter>
<parameter name="param2">value2</parameter>
</invoke>
</tool_calls>
\`\`\`

**Parameter types:**
- **String/Number/Boolean**: \`<parameter name="action">left_click</parameter>\` or \`<parameter name="depth">15</parameter>\`
- **Arrays**: Use JSON syntax: \`<parameter name="coordinate">[100, 200]</parameter>\`
- **Code or special characters**: Use CDATA: \`<parameter name="code"><![CDATA[your code here]]></parameter>\`

**Examples:**

Read the page:
\`\`\`xml
<tool_calls>
<invoke name="read_page">
<parameter name="tabId">123</parameter>
<parameter name="filter">interactive</parameter>
</invoke>
</tool_calls>
\`\`\`

Click an element:
\`\`\`xml
<tool_calls>
<invoke name="computer">
<parameter name="tabId">123</parameter>
<parameter name="action">left_click</parameter>
<parameter name="ref">ref_5</parameter>
</invoke>
</tool_calls>
\`\`\`

Multiple tool calls at once:
\`\`\`xml
<tool_calls>
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
</tool_calls>
\`\`\`

Execute JavaScript:
\`\`\`xml
<tool_calls>
<invoke name="javascript_tool">
<parameter name="tabId">123</parameter>
<parameter name="code"><![CDATA[
document.querySelectorAll('a').forEach(link => {
  console.log(link.href);
});
]]></parameter>
</invoke>
</tool_calls>
\`\`\``
}

function renderWorkflow(): string {
  return `## Workflow (for browser automation tasks)

1. **Understand the page first**: Always use \`read_page\` before interacting with a page to understand its structure and find element refs.

2. **Use element refs**: Elements are identified by refs like \`ref_1\`, \`ref_2\`, etc. Use these refs to target elements for clicks, typing, and other interactions.

3. **Verify your actions**: After important actions, use \`read_page\` again or take a \`screenshot\` to verify the result.

## Accessibility Tree Format

The \`read_page\` tool returns an accessibility tree in this format:
\`\`\`
link "Home" [ref_1] href="/"
navigation [ref_2]
  link "About" [ref_3] href="/about"
main [ref_4]
  heading "Welcome" [ref_5]
  textbox [ref_6] placeholder="Search..."
  button "Submit" [ref_7]
\`\`\`

- The format is: \`<role> "<name>" [ref_N] <attributes>\`
- Indentation shows parent-child relationships
- Use the \`[ref_N]\` values to interact with elements`
}

function renderToolSection(tools: ToolDefinition[]): string {
  const parts: string[] = ['## Available Tools']

  for (const tool of tools) {
    if (!tool.enabled) continue

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

  return parts.join('\n').trimEnd()
}

function renderBestPractices(): string {
  return `## Best Practices

1. **Handle dynamic content**: If an element isn't found, the page might still be loading. Use \`computer\` with \`action: "wait"\` or try reading the page again.
2. **Form interactions**: For form inputs, prefer \`form_input\` over typing. It's more reliable and handles various input types.
3. **Error handling**: If an action fails, read the page again to understand the current state before retrying.
4. When you complete a task, summarize what was done.

Large tool outputs (>25k chars) are automatically stored with a result_id. Use \`read_result\` to paginate or search, or \`process_result\` to run JS on the data.`
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
    'The following skills are installed:',
    '',
  ]

  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`)
  }

  lines.push('')
  lines.push('### How to use skills:')
  lines.push('')
  lines.push('1. **User invokes with slash command**: When the user types `/summary`, the skill instructions are automatically added to your prompt.')
  lines.push('')
  lines.push('2. **You invoke with tool**: You can also invoke a skill yourself using the `invoke_skill` tool:')
  lines.push('```xml')
  lines.push('<tool_calls>')
  lines.push('<invoke name="invoke_skill">')
  lines.push('<parameter name="skill_name">summary</parameter>')
  lines.push('</invoke>')
  lines.push('</tool_calls>')
  lines.push('```')
  lines.push('')
  lines.push('**If the user asks "what skills do you have", list the skills above.**')

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
    renderToolSection(options.tools),
  ]

  // Add available skills section if there are auto-discoverable skills
  if (options.availableSkills && options.availableSkills.length > 0) {
    sections.push(renderAvailableSkills(options.availableSkills))
  }

  // Add active skill section if a skill is being invoked
  if (options.activeSkill) {
    sections.push(renderActiveSkill(options.activeSkill.skill, options.activeSkill.args))
  }

  sections.push(renderBestPractices())

  return sections.filter(s => s.length > 0).join('\n\n')
}
