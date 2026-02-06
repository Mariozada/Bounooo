# Bouno

Browser automation Chrome extension. Control web pages using natural language through multiple LLM providers.

## Features

- **Multi-Provider Support**: Anthropic, OpenAI, Google, Groq, OpenRouter, and OpenAI-compatible endpoints (Ollama, LM Studio)
- **Browser Automation Tools**: Click, type, scroll, navigate, screenshot, form filling, and more
- **Accessibility Tree Parsing**: Intelligent page understanding through semantic element detection
- **Conversation Branching**: Edit messages and navigate between response branches
- **Chat Persistence**: IndexedDB storage with export/import functionality
- **Tracing & Observability**: Phoenix/OpenInference integration for debugging

## Project Structure

```
src/
├── agent/                    # Agent logic
│   ├── workflow/             # Workflow execution
│   │   ├── runner.ts         # Agent loop controller
│   │   ├── stream.ts         # LLM streaming
│   │   ├── tools.ts          # Tool execution
│   │   └── messages.ts       # Message building
│   ├── tracing/              # Observability
│   │   ├── tracer.ts         # Span management
│   │   ├── spanBuilder.ts    # Span construction
│   │   ├── messageFormatter.ts # OpenInference formatting
│   │   ├── exporter.ts       # Phoenix export
│   │   └── types.ts          # Tracing types
│   ├── providers.ts          # LLM provider factory
│   ├── config.ts             # Model configurations
│   ├── streamParser.ts       # XML tool call parser
│   └── tools.ts              # Tool definitions
│
├── background/               # Extension background script
│   └── index.ts              # Service worker, tool dispatch
│
├── content/                  # Content scripts
│   ├── index.ts              # Message handler
│   ├── accessibilityTree.ts  # Page parsing
│   ├── eventSimulator.ts     # DOM interactions
│   ├── elementFinder.ts      # Element search
│   ├── formHandler.ts        # Form filling
│   ├── consoleCapture.ts     # Console monitoring
│   └── imageUpload.ts        # File uploads
│
├── storage/                  # Data persistence
│   ├── db.ts                 # Dexie database schema
│   ├── chatStorage.ts        # Re-exports (backward compat)
│   ├── threadStorage.ts      # Thread CRUD
│   ├── messageStorage.ts     # Message operations
│   ├── attachmentStorage.ts  # File attachments
│   ├── branchStorage.ts      # Branch state
│   ├── storageStats.ts       # Usage statistics
│   ├── chatExport.ts         # Export/import
│   └── types.ts              # Storage types
│
├── tools/                    # Browser automation tools
│   ├── definitions/          # Tool schemas
│   │   ├── reading.ts        # read_page, get_page_text, find
│   │   ├── interaction.ts    # computer, form_input, upload_image
│   │   ├── navigation.ts     # navigate, tabs_*, web_fetch
│   │   ├── debugging.ts      # console, network, javascript
│   │   ├── media.ts          # gif_creator
│   │   └── ui.ts             # update_plan
│   └── handlers/             # Tool implementations
│
├── ui/                       # React UI
│   ├── components/
│   │   ├── chat/             # Chat interface
│   │   │   ├── AgentChat.tsx # Main chat component
│   │   │   ├── ChatTopBar.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageComposer.tsx
│   │   │   ├── UserMessage.tsx
│   │   │   ├── AssistantMessage.tsx
│   │   │   └── WelcomeScreen.tsx
│   │   ├── settings/         # Settings panel
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ProviderTab.tsx
│   │   │   ├── TracingTab.tsx
│   │   │   ├── DataTab.tsx
│   │   │   └── useSettingsForm.ts
│   │   └── ...               # Other components
│   ├── hooks/
│   │   ├── threads/          # Thread management
│   │   │   ├── useThreads.ts
│   │   │   └── types.ts
│   │   ├── useSettings.ts
│   │   └── useWorkflowStream.ts
│   └── styles/
│
├── prompts/                  # System prompts
│   └── templates/
│       └── system.jinja      # Agent system prompt
│
└── shared/                   # Shared utilities
    └── settings.ts           # Settings types
```

## Installation

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Development mode (watch)
npm run dev
```

## Loading the Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

## Configuration

### API Keys

Configure your API keys in the extension settings:

- **Anthropic**: Get key from [console.anthropic.com](https://console.anthropic.com)
- **OpenAI**: Get key from [platform.openai.com](https://platform.openai.com)
- **Google**: Get key from [aistudio.google.com](https://aistudio.google.com)
- **Groq**: Get key from [console.groq.com](https://console.groq.com)
- **OpenRouter**: Get key from [openrouter.ai](https://openrouter.ai)

### Local Models (Ollama/LM Studio)

Select "OpenAI Compatible" provider and configure:
- **Base URL**: `http://localhost:11434/v1` (Ollama) or `http://localhost:1234/v1` (LM Studio)
- **Model**: Your model name (e.g., `llama3.2`, `mistral`)

### Tracing (Optional)

Enable Phoenix tracing for debugging:
1. Run Phoenix: `docker run -p 6006:6006 arizephoenix/phoenix`
2. Enable tracing in Settings > Tracing tab
3. View traces at `http://localhost:6006`

## Available Tools

| Tool | Description |
|------|-------------|
| `read_page` | Get accessibility tree of the page |
| `get_page_text` | Extract page text content |
| `find` | Search for elements by description |
| `computer` | Mouse/keyboard actions (click, type, scroll, etc.) |
| `form_input` | Fill form fields |
| `navigate` | Go to URL or navigate history |
| `tabs_context` | List open tabs |
| `tabs_create` | Open new tab |
| `web_fetch` | Fetch URL content |
| `javascript_tool` | Execute JavaScript |
| `read_console_messages` | Get console logs |
| `read_network_requests` | Get network activity |
| `gif_creator` | Record page as GIF |

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **LLM SDK**: Vercel AI SDK with multi-provider support
- **Storage**: Dexie (IndexedDB)
- **Styling**: CSS with motion animations
- **Build**: Rolldown-Vite

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build all (UI + content + background)
npm run build
```

## License

MIT
