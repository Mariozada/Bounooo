# Bouno

Browser automation Chrome extension. Control web pages using natural language through multiple LLM providers.

[**Download Latest Release**](https://github.com/Mariozada/Bouno/releases/latest/download/bouno.zip)

## Features

- **Natural Language Control** — tell it what to do in plain English, it clicks, types, scrolls, and navigates for you
- **Multi-Provider Support** — Anthropic, OpenAI, Google, Groq, OpenRouter, and OpenAI-compatible endpoints (Ollama, LM Studio)
- **Side Panel UI** — stays open alongside any webpage
- **Tab Group Isolation** — each session is scoped to its own tab group
- **Conversation Branching** — edit messages and explore different response paths
- **Scheduled Tasks** — set up recurring automations
- **Screenshots & GIFs** — capture what's happening on screen
- **Chat Persistence** — conversations saved locally in IndexedDB
- **Privacy First** — no backend, no data collection, API calls go directly to your provider

## Install

### From Release (recommended)

1. Download [bouno.zip](https://github.com/Mariozada/Bouno/releases/latest/download/bouno.zip)
2. Unzip the file
3. Open `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the unzipped folder

### Build from Source

```bash
bun install
bun run build
```

Then load the `dist/` folder as an unpacked extension.

## Configuration

Open the extension side panel and go to Settings.

### API Keys

- **Anthropic** — [console.anthropic.com](https://console.anthropic.com)
- **OpenAI** — [platform.openai.com](https://platform.openai.com)
- **Google** — [aistudio.google.com](https://aistudio.google.com)
- **Groq** — [console.groq.com](https://console.groq.com)
- **OpenRouter** — [openrouter.ai](https://openrouter.ai)

### Local Models

Select "OpenAI Compatible" provider:
- **Ollama** — `http://localhost:11434/v1`
- **LM Studio** — `http://localhost:1234/v1`

## Architecture

Three build targets compiled with Rolldown-Vite:

- **UI** — React side panel (ES modules, code-split)
- **Content Script** — IIFE injected into web pages for DOM interaction
- **Background** — Service worker handling message routing and tool dispatch

Communication flows: UI → Background → Content Script via Chrome messaging APIs.

The agent uses an XML-based tool calling format (not native AI SDK tool calling). The agentic loop streams LLM responses, parses tool calls from XML, executes them sequentially, and loops until complete.

## Development

```bash
bun run dev          # Vite dev server for UI (hot reload)
bun run build        # Build all targets
bun run build:ui     # Build UI only
bun run build:content    # Build content script only
bun run build:background # Build background script only
bun run lint         # ESLint
```

### Project Structure

```
src/
├── agent/           # Provider factory, XML parser, workflow runner
├── background/      # Service worker, message routing, scheduler
├── content/         # DOM interaction, accessibility tree, event simulation
├── prompts/         # System prompt construction
├── shared/          # Types, messages, constants
├── skills/          # Extensible skill system
├── storage/         # IndexedDB via Dexie (threads, messages, attachments)
├── tools/           # Tool definitions and handlers
└── ui/              # React side panel, hooks, components, styles
```

## Contributing

Feel free to open a PR to contribute.

## License

MIT
