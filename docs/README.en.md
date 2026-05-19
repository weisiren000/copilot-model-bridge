<p align="center">
  <img src="../images/logo.png" alt="Copilot Model Bridge" width="128" style="border-radius: 24px;">
</p>

<h1 align="center">Copilot Model Bridge</h1>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="VS Code">
  <img src="https://img.shields.io/badge/OpenAI_API-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI API">
  <a href="https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge">
    <img src="https://img.shields.io/badge/VS_Code_Marketplace-blue?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace">
  </a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge&logo=opensourceinitiative&logoColor=white" alt="MIT License">
</p>

<p align="center">
  <a href="../README.md">中文</a>
</p>

Copilot Model Bridge is a VS Code extension that connects any OpenAI-compatible endpoint to GitHub Copilot Chat.

It exposes models from OpenAI-compatible services such as NVIDIA NIM, Ollama, LM Studio, vLLM, Together AI, Groq, and OpenRouter directly into the Copilot model picker.

## Features

- Multiple providers in one VS Code configuration
- Multiple models per provider
- Streaming responses via `/chat/completions`
- Per-provider API Key
- Tool calling capability toggle
- Agent edit tool hint support
- Vision capability toggle
- Optional Thinking Effort configuration for reasoning models
- Full model metadata display
- Persistent config manager inside VS Code editor tabs
- Command palette wizards — no manual JSON editing required
- Edit, duplicate, import, and validate provider/model configurations

## Requirements

| Item | Requirement |
| --- | --- |
| VS Code | `1.99.0` or newer |
| GitHub Copilot | Individual plan |
| Backend API | OpenAI-compatible `/chat/completions` endpoint |

> [!NOTE]
> VS Code's language model provider API is primarily designed for Copilot Individual. If your environment policy blocks the corresponding API, the extension can still be installed, but models will not appear in the chat panel.

## Quick Start

### 1. Install

From Marketplace:

- Open the [Copilot Model Bridge extension page](https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge)
- Click `Install`
- Reload VS Code

Run from source:

```bash
git clone https://github.com/weisiren000/copilot-model-bridge.git
cd copilot-model-bridge
npm install
npm run compile
```

Then press `F5` in VS Code to start the Extension Development Host.

### 2. Add a Provider

Open the command palette and run:

```text
Copilot Model Bridge: Add Provider
```

The wizard will prompt for:

1. Display name
2. Provider ID
3. Base URL
4. API Key

Example:

- Display name: `NVIDIA NIM`
- Provider ID: `nvidia-nim`
- Base URL: `https://integrate.api.nvidia.com/v1`

### 3. Add a Model

Run:

```text
Copilot Model Bridge: Add Model
```

The wizard supports configuring:

1. Model ID
2. Model display name
3. Max input tokens
4. Tool calling support
5. Agent edit tool hints
6. Vision support
7. Video attachment policy
8. Generic file attachment policy
9. Cost multiplier
10. Configurable reasoning effort

For reasoning models, the wizard will also ask for supported reasoning levels and the default level.

Supported reasoning levels:

- `none`
- `low`
- `medium`
- `high`
- `xhigh`
- `max`

### 4. Use in Copilot Chat

Open Copilot Chat and select a model provided by Copilot Model Bridge from the model picker.

Model display format:

```text
<model name> (<provider name>)
```

Example:

```text
Kimi K2.5 (NVIDIA NIM)
```

## Command List

| Command | Description |
| --- | --- |
| `Copilot Model Bridge: Manage Providers` | Open persistent config manager |
| `Copilot Model Bridge: Open Config Manager` | Open provider/model configuration page |
| `Copilot Model Bridge: Quick Manage Providers` | Open legacy quick-pick management menu |
| `Copilot Model Bridge: Add Provider` | Add a new provider |
| `Copilot Model Bridge: Edit Provider` | Modify provider display name, Base URL, or API Key |
| `Copilot Model Bridge: Remove Provider` | Delete a provider and its models |
| `Copilot Model Bridge: Add Model` | Add a model to a provider |
| `Copilot Model Bridge: Edit Model` | Modify model display name and token limits |
| `Copilot Model Bridge: Duplicate Model` | Clone an existing model configuration |
| `Copilot Model Bridge: Import Models from JSON` | Import models from a JSON array |
| `Copilot Model Bridge: Validate Provider Config` | Check for duplicate IDs and config inconsistencies |
| `Copilot Model Bridge: Remove Model` | Delete a model |
| `Copilot Model Bridge: List Providers` | View all current providers and models |

## Configuration

The extension stores data in:

```json
"copilot-model-bridge.providers"
```

Recommended configuration entry point:

```text
Copilot Model Bridge: Open Config Manager
```

It opens a config manager in a VS Code editor tab, supporting provider/model lists, field editing, validation, JSON import, model duplication, and saving. The legacy quick-pick commands are still available, and the input box stays open when focus changes.

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

`supportsReasoning` controls whether VS Code displays Thinking Effort for the model. For backwards compatibility, models with `defaultReasoningLevel` set but no explicit `supportsReasoning` are treated as supporting reasoning. Explicit `supportsReasoning: false` suppresses Thinking Effort display.

`supportsEditTools` controls whether Agent mode receives model-preferred edit tool hints. It defaults to `supportsToolCalling`. When enabled without `preferredEditTools`, the default hints are `find-replace`, `multi-find-replace`, and `apply-patch`. Unknown values in `preferredEditTools` are filtered out; if all values are unknown, no edit tool hints are declared. Models with `supportsToolCalling: false` never declare edit tool hints.

`supportsVideo` and `supportsFileInput` define attachment boundaries. Images are sent as OpenAI-compatible `image_url`, while text and JSON data parts are converted to text. Video and unknown binary attachments will produce a clear error instead of being silently ignored.

`multiplier` sets the cost multiplier label displayed in VS Code, defaulting to `0x`. Labels like `1x` and `0.5x` auto-derive `multiplierNumeric` unless you explicitly configure it.

`family`, `version`, `categoryLabel`, `categoryOrder`, and `statusIcon` improve metadata display in the VS Code model picker and Manage Models view. `family` is inferred from the model ID when not configured. Category fields default to not being declared. `statusIcon` only accepts safe VS Code ThemeIcon IDs, such as `sparkle` or `warning`.

Token counts are estimates. Text uses a rough rule of 4 characters ≈ 1 token. Images are estimated at 1024 tokens each. Tool calls, tool results, JSON, and text data parts are estimated by their serialized text length. These values are used for VS Code context budgets and may differ from a specific provider's tokenizer results.

## Compatible Services

| Service | Base URL |
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

1. Registers a `LanguageModelChatProvider`
2. Flattens all provider/model combinations into Copilot-selectable models
3. Converts VS Code chat messages into OpenAI-compatible request bodies
4. Sends streaming requests to `<baseUrl>/chat/completions`
5. Continuously streams text and tool call fragments back to VS Code

If a model is marked as not supporting vision, the extension intercepts image inputs before sending the request. Unsupported video and unknown binary attachments are also blocked with clear error messages.

## Development

```bash
npm install
npm run compile
```

Common commands:

| Command | Description |
| --- | --- |
| `npm run compile` | Compile once |
| `npm run watch` | Watch and recompile |
| `npx tsc -p ./ --noEmit` | Type check only |

Core files:

```text
src/extension.ts
src/provider.ts
src/commands.ts
src/config.ts
src/types.ts
```
