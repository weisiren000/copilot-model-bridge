<p align="center">
  <img src="../images/logo.png" alt="Copilot Model Bridge" width="128">
</p>

<h1 align="center">Copilot Model Bridge</h1>

<p align="center">
  A VS Code extension that bridges OpenAI-compatible models into GitHub Copilot Chat.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge">
    <img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace">
  </a>
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.99.0-007ACC?style=flat-square" alt="VS Code 1.99.0+">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="../README.md">中文</a>
</p>

![Copilot Model Bridge configuration UI](../images/screenshot.png)

Copilot Model Bridge registers your configured models in the Copilot Chat model picker. Any service compatible with the OpenAI Chat Completions streaming API can be connected, including Ollama, LM Studio, vLLM, NVIDIA NIM, Groq, OpenRouter, and Together AI.

## Features

- Manage multiple providers and models in one place
- Stream responses through `/chat/completions`
- Configure a separate Base URL and API key per provider
- Toggle tool calling, edit tool hints, and vision support per model
- Configure Thinking Effort for reasoning models
- Use a visual config manager or command palette wizards

## Requirements

| Item | Requirement |
| --- | --- |
| VS Code | `1.99.0` or newer |
| GitHub Copilot | Copilot Chat on an Individual plan |
| Model service | OpenAI-compatible `/chat/completions` endpoint with streaming support |

> [!NOTE]
> If your VS Code build or organization policy disables the language model provider API, the extension can still be installed, but its models may not appear in Copilot Chat.

## Quick Start

1. Install [Copilot Model Bridge](https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge).
2. Open the command palette and run `Copilot Model Bridge: Open Config Manager`.
3. Add a provider with a name, Provider ID, Base URL, and API key.
4. Add a model under that provider with its model ID, display name, token limits, and capability toggles.
5. Open Copilot Chat and select the model from the model picker.

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
