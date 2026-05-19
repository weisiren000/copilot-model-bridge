# Copilot Model Bridge

[中文说明](README.zh-CN.md)

Copilot Model Bridge is a VS Code extension that connects any OpenAI-compatible endpoint to GitHub Copilot Chat.

If you want the full guide, read the [Chinese documentation](README.zh-CN.md).

## Features

- Multiple providers in one VS Code profile
- Multiple models per provider
- Streaming `/chat/completions`
- Per-provider API keys
- Tool calling, Agent edit tool hints, Vision, and Reasoning
- Persistent config manager
- JSON import, duplication, validation, and editing

## Requirements

| Item | Requirement |
| --- | --- |
| VS Code | `1.99.0` or newer |
| GitHub Copilot | Individual plan |
| Backend API | OpenAI-compatible `/chat/completions` endpoint |

## Quick Start

1. Install from the Marketplace or run from source.
2. Open the command palette and run `Copilot Model Bridge: Add Provider`.
3. Run `Copilot Model Bridge: Add Model` to configure a model.
4. Pick the model from the Copilot Chat model selector.

## Main Commands

- `Copilot Model Bridge: Manage Providers`
- `Copilot Model Bridge: Open Config Manager`
- `Copilot Model Bridge: Add Provider`
- `Copilot Model Bridge: Add Model`
- `Copilot Model Bridge: Edit Provider`
- `Copilot Model Bridge: Edit Model`
- `Copilot Model Bridge: Duplicate Model`
- `Copilot Model Bridge: Import Models from JSON`
- `Copilot Model Bridge: Validate Provider Config`
- `Copilot Model Bridge: Remove Provider`
- `Copilot Model Bridge: Remove Model`
- `Copilot Model Bridge: List Providers`
