<p align="center">
  <img src="../images/logo.png" alt="Copilot Model Bridge" width="128">
</p>

<h1 align="center">Copilot Model Bridge</h1>

<p align="center">
  A VS Code extension that bridges OpenAI-compatible models into GitHub Copilot Chat.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=weisiren.cmb-copilot-model-bridge">
    <img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace">
  </a>
  <img src="https://img.shields.io/badge/Version-1.1.5-4C8BF5?style=flat-square" alt="Version 1.1.5">
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.115.0-007ACC?style=flat-square" alt="VS Code 1.115.0+">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="../README.md">中文</a>
</p>

![Copilot Model Bridge configuration UI](../images/screenshot.png)

Copilot Model Bridge registers your configured models in the Copilot Chat model picker. It supports OpenAI-compatible Chat Completions, Responses API, and Anthropic Messages providers, including OpenAI, Ollama, LM Studio, vLLM, NVIDIA NIM, Groq, Grok, OpenRouter, Together AI, DeepSeek, Gemini-compatible gateways, and Anthropic-compatible services.

## Features

- Manage multiple providers and models in one place
- Stream responses through Chat Completions, Responses API, or Anthropic Messages
- Use built-in OpenAI GPT-5.6 Sol, Terra, and Luna model profiles
- Configure a separate Base URL and API key per provider
- Toggle stable tool-calling and vision capabilities per model
- Configure reasoning effort and preserve reasoning across multi-turn requests
- Use native thinking parts when the host exposes them, with stable DataPart preservation and replay as the fallback
- Use a visual config manager or command palette wizards

## v1.1.5 Highlights

- Added Grok model and compatible gateway support
- Restored model-specific reasoning effort choices, including `none`, `low`, `medium`, `high`, `xhigh`, and `max`
- Improved reasoning parsing, aggregation, and multi-turn replay across Chat Completions, Responses, and Anthropic Messages
- Removed the Marketplace package's required dependency on proposed VS Code APIs

## v1.1.3 Highlights

- Added official OpenAI GPT-5.6, Sol, Terra, and Luna model profiles
- Added an OpenAI preset that uses the Responses API by default
- Preserved reasoning effort when function tools are enabled in Chat Completions
- Improved reasoning summary aggregation, deduplication, and display cleanup

## Requirements

| Item | Requirement |
| --- | --- |
| VS Code | `1.115.0` or newer |
| GitHub Copilot | Copilot Chat on an Individual plan |
| Model service | OpenAI-compatible streaming endpoint, Responses API, or Anthropic Messages endpoint |

> [!NOTE]
> The Marketplace manifest does not declare proposed VS Code APIs and does not require `--enable-proposed-api`. If your VS Code build or organization policy disables third-party providers, the extension can still be installed, but its models may not appear in Copilot Chat.

> [!NOTE]
> VS Code's built-in **Custom Endpoint** supports Chat Completions, Responses, and Messages APIs. Use it directly for a single standard endpoint; this extension remains useful for managing multiple providers and compatibility differences.

## Quick Start

1. Install [Copilot Model Bridge](https://marketplace.visualstudio.com/items?itemName=weisiren.cmb-copilot-model-bridge).
2. Open the command palette and run `Copilot Model Bridge: Open Config Manager`.
3. Add a provider with a name, Provider ID, Base URL, and API key.
4. Select `chat`, `responses`, or `anthropic` as the provider API style.
5. Add a model under that provider with its model ID, display name, token limits, and capability toggles.
6. Open Copilot Chat and select the model from the model picker.

Models are shown as `<model name> (<provider name>)`, for example:

```text
Kimi K2.5 (NVIDIA NIM)
```

## Configuration Example

The config manager is the recommended way to edit settings. If you need to edit Settings JSON directly, use `copilot-model-bridge.providers`:

```json
{
  "copilot-model-bridge.providers": [
    {
      "id": "ollama-local",
      "displayName": "Ollama",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "",
      "models": [
        {
          "id": "llama3.2",
          "name": "Llama 3.2",
          "maxInputTokens": 32000,
          "maxOutputTokens": 4096,
          "supportsToolCalling": false,
          "supportsVision": false,
          "supportsReasoning": false
        }
      ]
    }
  ]
}
```

Common Base URLs:

| Service | Base URL |
| --- | --- |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Together AI | `https://api.together.xyz/v1` |

## Common Commands

| Command | Purpose |
| --- | --- |
| `Copilot Model Bridge: Open Config Manager` | Open the visual config manager |
| `Copilot Model Bridge: Add Provider` | Add a provider |
| `Copilot Model Bridge: Add Model` | Add a model |
| `Copilot Model Bridge: Import Models from JSON` | Import models from JSON |
| `Copilot Model Bridge: Validate Provider Config` | Check configuration issues |
| `Copilot Model Bridge: List Providers` | List configured providers and models |

## Local Development

```bash
npm install
npm run compile
npm test
```

Open the repository in VS Code and press `F5` to launch the Extension Development Host.

Useful scripts:

| Script | Description |
| --- | --- |
| `npm run compile` | Compile TypeScript |
| `npm run watch` | Watch and recompile |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |
