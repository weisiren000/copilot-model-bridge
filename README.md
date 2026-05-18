# OAIProvider

[中文说明](docs/README.zh-CN.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/calgan.oai-provider?label=VS%20Code%20Marketplace&logo=visualstudiocode&color=blue)](https://marketplace.visualstudio.com/items?itemName=calgan.oai-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

OAIProvider is a VS Code extension that plugs any OpenAI-compatible endpoint into GitHub Copilot Chat through the official `LanguageModelChatProvider` API.

It lets you expose models from NVIDIA NIM, Ollama, LM Studio, vLLM, Together AI, Groq, OpenRouter, and similar OpenAI-format services directly in the Copilot model picker.

## What It Supports

- Multiple providers in one VS Code profile
- Multiple models per provider
- Streaming chat responses over `/chat/completions`
- Per-provider API keys
- Tool-calling capability flags
- Vision capability flags
- Default reasoning level per model
- Command-based setup without manually editing JSON

## Requirements

| Item | Requirement |
| --- | --- |
| VS Code | `1.99.0` or newer |
| GitHub Copilot | Individual plan |
| Backend API | OpenAI-compatible `/chat/completions` endpoint |

> [!NOTE]
> VS Code's language model chat provider flow is currently oriented around Copilot individual usage. If your environment blocks this API, the extension will install but the model integration will not be available.

## Quick Start

### 1. Install

From Marketplace:

- Open the [OAIProvider extension page](https://marketplace.visualstudio.com/items?itemName=calgan.oai-provider)
- Click `Install`
- Reload VS Code

From source:

```bash
git clone https://github.com/calganaygun/copilot-oai-provider.git
cd copilot-oai-provider
npm install
npm run compile
```

Then press `F5` in VS Code to launch an Extension Development Host.

### 2. Add a provider

Open the command palette and run:

```text
OAIProvider: Add Provider
```

The wizard asks for:

1. Display name
2. Provider ID
3. Base URL
4. API key

Example:

- Display name: `NVIDIA NIM`
- Provider ID: `nvidia-nim`
- Base URL: `https://integrate.api.nvidia.com/v1`

### 3. Add a model

Run:

```text
OAIProvider: Add Model
```

The wizard lets you configure:

1. Model ID
2. Display name
3. Max input tokens
4. Tool calling support
5. Vision support
6. Default reasoning level

Supported reasoning levels:

- `none`
- `low`
- `medium`
- `high`
- `xhigh`
- `max`

### 4. Use the model in Copilot Chat

Open Copilot Chat, switch the model picker, and choose the model contributed by OAIProvider.

Model names are shown as:

```text
<Model Name> (<Provider Name>)
```

For example:

```text
Kimi K2.5 (NVIDIA NIM)
```

## Commands

| Command | Description |
| --- | --- |
| `OAIProvider: Manage Providers` | Main management entry |
| `OAIProvider: Add Provider` | Add a new provider |
| `OAIProvider: Remove Provider` | Remove a provider and its models |
| `OAIProvider: Add Model` | Add a model to a provider |
| `OAIProvider: Remove Model` | Remove a model from a provider |
| `OAIProvider: List Providers` | Show all configured providers and models |

## Configuration

The extension stores data in:

```json
"openai-compat-provider.providers"
```

Example:

```json
"openai-compat-provider.providers": [
  {
    "id": "nvidia-nim",
    "displayName": "NVIDIA NIM",
    "baseUrl": "https://integrate.api.nvidia.com/v1",
    "apiKey": "nvapi-xxxxxxxxxxxx",
    "models": [
      {
        "id": "moonshotai/kimi-k2.5",
        "name": "Kimi K2.5",
        "maxInputTokens": 131072,
        "maxOutputTokens": 8192,
        "supportsToolCalling": true,
        "supportsVision": true,
        "supportsReasoning": true,
        "supportedReasoningLevels": ["low", "medium", "high"],
        "defaultReasoningLevel": "high"
      }
    ]
  },
  {
    "id": "ollama-local",
    "displayName": "Ollama (local)",
    "baseUrl": "http://localhost:11434/v1",
    "apiKey": "",
    "models": [
      {
        "id": "llama3.2",
        "name": "Llama 3.2 (local)",
        "maxInputTokens": 32000,
        "maxOutputTokens": 4096,
        "supportsToolCalling": false,
        "supportsVision": false,
        "supportsReasoning": false
      }
    ]
  }
]
```

`supportsReasoning` controls whether VS Code shows Thinking Effort for the model.
Existing configs that already set `defaultReasoningLevel` are treated as reasoning-capable for compatibility.

## Compatible Provider Examples

| Provider | Base URL |
| --- | --- |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| Together AI | `https://api.together.xyz/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Mistral AI | `https://api.mistral.ai/v1` |

## How It Works

At runtime the extension:

1. Registers one `LanguageModelChatProvider`
2. Flattens all configured provider/model pairs into selectable Copilot models
3. Converts VS Code chat messages into OpenAI-compatible request payloads
4. Sends streaming requests to `<baseUrl>/chat/completions`
5. Streams text and tool-call parts back into VS Code

If a model is marked as non-vision, image input is rejected before the outbound request is sent.

## Development

```bash
npm install
npm run compile
```

Useful commands:

| Command | Description |
| --- | --- |
| `npm run compile` | Build once |
| `npm run watch` | Watch mode |
| `npx tsc -p ./ --noEmit` | Type-check only |

Core files:

```text
src/extension.ts
src/provider.ts
src/commands.ts
src/config.ts
src/types.ts
```
