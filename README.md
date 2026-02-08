# Bouno

Browser automation Chrome extension. Control web pages using natural language through multiple LLM providers.

[**Download Latest Release**](https://github.com/Mariozada/Bouno/releases/latest/download/bouno.zip)

## Demo

<video src="https://github.com/Mariozada/Bouno/raw/main/docs/demo.mp4" controls width="100%"></video>

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

### Dev Build (latest from main)

1. Download [bouno-dev.zip](https://nightly.link/Mariozada/Bouno/workflows/build/main/bouno-dev.zip)
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

## Contributing

Contributions are welcome! Feel free to open a PR.

## License

MIT
