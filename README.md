# Copilot Model Bridge

[中文说明](docs/README.zh-CN.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/weisiren.copilot-model-bridge?label=VS%20Code%20Marketplace&logo=visualstudiocode&color=blue)](https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Copilot Model Bridge is a VS Code extension that plugs any OpenAI-compatible endpoint into GitHub Copilot Chat through the official `LanguageModelChatProvider` API.

It lets you expose models from NVIDIA NIM, Ollama, LM Studio, vLLM, Together AI, Groq, OpenRouter, and similar OpenAI-format services directly in the Copilot model picker.

## What It Supports

- Multiple providers in one VS Code profile
- Multiple models per provider
- Streaming chat responses over `/chat/completions`
- Per-provider API keys
- Tool-calling capability flags
- Agent edit tool capability hints
- Vision capability flags
- Optional Thinking Effort controls for reasoning models
- Polished model metadata in VS Code model surfaces
- Command-based setup without manually editing JSON
- Editing, duplicating, importing, and validating provider/model configs

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

- Open the [Copilot Model Bridge extension page](https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge)
- Click `Install`
- Reload VS Code

From source:

```bash
git clone https://github.com/weisiren000/copilot-model-bridge.git
cd copilot-model-bridge
npm install
npm run compile
```

Then press `F5` in VS Code to launch an Extension Development Host.

### 2. Add a provider

Open the command palette and run:

```text
Copilot Model Bridge: Add Provider
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
Copilot Model Bridge: Add Model
```

The wizard lets you configure:

1. Model ID
2. Display name
3. Max input tokens
4. Tool calling support
5. Edit tool hints for Agent mode
6. Vision support
7. Video attachment policy
8. Generic file attachment policy
9. Cost multiplier
10. Whether the model supports configurable reasoning effort

For reasoning models, the wizard also asks for supported reasoning levels and the default reasoning level.

Supported reasoning levels:

- `none`
- `low`
- `medium`
- `high`
- `xhigh`
- `max`

### 4. Use the model in Copilot Chat

Open Copilot Chat, switch the model picker, and choose the model contributed by Copilot Model Bridge.

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
| `Copilot Model Bridge: Manage Providers` | Main management entry |
| `Copilot Model Bridge: Add Provider` | Add a new provider |
| `Copilot Model Bridge: Edit Provider` | Update provider display name, base URL, or API key |
| `Copilot Model Bridge: Remove Provider` | Remove a provider and its models |
| `Copilot Model Bridge: Add Model` | Add a model to a provider |
| `Copilot Model Bridge: Edit Model` | Update model display name and token limits |
| `Copilot Model Bridge: Duplicate Model` | Copy an existing model configuration |
| `Copilot Model Bridge: Import Models from JSON` | Append models from a pasted JSON array |
| `Copilot Model Bridge: Validate Provider Config` | Find duplicate IDs and inconsistent settings |
| `Copilot Model Bridge: Remove Model` | Remove a model from a provider |
| `Copilot Model Bridge: List Providers` | Show all configured providers and models |

## Configuration

The extension stores data in:

```json
"copilot-model-bridge.providers"
```

Example:

```json
"copilot-model-bridge.providers": [
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
        "supportsEditTools": true,
        "preferredEditTools": ["find-replace", "multi-find-replace", "apply-patch"],
        "supportsVision": true,
        "supportsVideo": false,
        "supportsFileInput": false,
        "supportsReasoning": true,
        "supportedReasoningLevels": ["low", "medium", "high"],
        "defaultReasoningLevel": "high",
        "multiplier": "1x",
        "family": "kimi",
        "version": "2026-05-18",
        "categoryLabel": "Reasoning",
        "categoryOrder": 10,
        "statusIcon": "sparkle"
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
        "supportsEditTools": false,
        "supportsVision": false,
        "supportsVideo": false,
        "supportsFileInput": false,
        "supportsReasoning": false,
        "multiplier": "0x"
      }
    ]
  }
]
```

`supportsReasoning` controls whether VS Code shows Thinking Effort for the model. Existing configs that already set `defaultReasoningLevel` and omit `supportsReasoning` are treated as reasoning-capable for compatibility. If `supportsReasoning` is explicitly `false`, Thinking Effort stays disabled.
`supportsEditTools` controls whether Agent mode receives preferred edit tool hints. It defaults to `supportsToolCalling`; if enabled without `preferredEditTools`, the default hints are `find-replace`, `multi-find-replace`, and `apply-patch`. Unknown values in `preferredEditTools` are filtered; if all configured values are unknown, no edit tool hints are declared. Models with `supportsToolCalling: false` never declare edit tool hints.
`supportsVideo` and `supportsFileInput` define the attachment boundary. Images are sent as OpenAI-compatible `image_url` parts, text and JSON data parts are converted to text, and video or unknown binary attachments are rejected with a clear error instead of being silently ignored.
`multiplier` controls the cost label shown by VS Code. It defaults to `0x`; labels like `1x` and `0.5x` automatically provide `multiplierNumeric` unless you set `multiplierNumeric` explicitly.
`family`, `version`, `categoryLabel`, `categoryOrder`, and `statusIcon` polish the metadata shown by VS Code model picker and Manage Models surfaces. `family` is inferred from the model id when omitted, category fields are optional, and `statusIcon` only accepts safe VS Code ThemeIcon ids such as `sparkle` or `warning`.

Token counts are estimates. Text uses a simple 4 characters per token heuristic, images are counted as 1024 tokens each, and tool calls, tool results, JSON, and text data parts are estimated from their serialized text. The value is intended for VS Code context budgeting and may differ from the provider's tokenizer.

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

If a model is marked as non-vision, image input is rejected before the outbound request is sent. Unsupported video and unknown binary attachments are also rejected before the API call.

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


