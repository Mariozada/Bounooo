/**
 * Built-in Skills
 *
 * These skills ship with Bouno and are installed on first run.
 * Commands (user-invocable only, auto-discover: false) don't expose
 * themselves to the agent — they're just slash-command prompt templates.
 */

/**
 * Page summarizer — available as /summary command
 */
const SUMMARY = `---
name: summary
description: Summarize the current web page content and structure
version: 1.0.0
author: Bouno
user-invocable: true
auto-discover: false
---

# Page Summary Skill

Summarize the CURRENT WEB PAGE the user is viewing. Do NOT summarize the conversation.

## Instructions

1. First, call \`get_page_text\` to read the page content
2. Then call \`read_page\` to understand the structure
3. Provide a brief summary including:
   - What the page is about
   - Key content or information
   - Available actions (buttons, forms, links)

Keep it short and useful.
`

/**
 * All built-in skills/commands
 */
export const BUILTIN_SKILLS = [
  SUMMARY,
]
