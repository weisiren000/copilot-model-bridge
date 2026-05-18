# OAIProvider

[English](../README.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/calgan.oai-provider?label=VS%20Code%20Marketplace&logo=visualstudiocode&color=blue)](https://marketplace.visualstudio.com/items?itemName=calgan.oai-provider)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)

OAIProvider 是一个 VS Code 扩展，基于官方 `LanguageModelChatProvider` API，把任意 OpenAI 兼容接口接入 GitHub Copilot Chat。

它可以把 NVIDIA NIM、Ollama、LM Studio、vLLM、Together AI、Groq、OpenRouter 等 OpenAI 格式服务中的模型直接暴露到 Copilot 的模型选择器里。

## 功能概览

- 一个 VS Code 配置中可接入多个 provider
- 每个 provider 可配置多个模型
- 基于 `/chat/completions` 的流式响应
- 每个 provider 独立 API Key
- 支持工具调用能力开关
- 支持视觉能力开关
- 支持模型默认思考层级配置
- 通过命令面板向导完成配置，无需手改 JSON

## 运行要求

| 项目 | 要求 |
| --- | --- |
| VS Code | `1.99.0` 及以上 |
| GitHub Copilot | Individual 个人版 |
| 后端接口 | 兼容 OpenAI `/chat/completions` 的接口 |

> [!NOTE]
> VS Code 当前这套语言模型 provider 能力主要面向 Copilot 个人版场景。如果你的环境策略禁用了对应 API，扩展虽然可以安装，但模型不会真正接入到聊天面板中。

## 快速开始

### 1. 安装

从 Marketplace 安装：

- 打开 [OAIProvider 扩展页面](https://marketplace.visualstudio.com/items?itemName=calgan.oai-provider)
- 点击 `Install`
- 重载 VS Code

从源码运行：

```bash
git clone https://github.com/calganaygun/copilot-oai-provider.git
cd copilot-oai-provider
npm install
npm run compile
```

然后在 VS Code 中按 `F5` 启动 Extension Development Host。

### 2. 添加 provider

打开命令面板并执行：

```text
OAIProvider: Add Provider
```

向导会依次要求输入：

1. 显示名称
2. Provider ID
3. Base URL
4. API Key

示例：

- 显示名称：`NVIDIA NIM`
- Provider ID：`nvidia-nim`
- Base URL：`https://integrate.api.nvidia.com/v1`

### 3. 添加模型

执行：

```text
OAIProvider: Add Model
```

向导支持配置：

1. 模型 ID
2. 模型显示名称
3. 最大输入 token
4. 是否支持工具调用
5. 是否支持视觉输入
6. 默认思考层级

支持的思考层级：

- `none`
- `low`
- `medium`
- `high`
- `xhigh`
- `max`

### 4. 在 Copilot Chat 中使用

打开 Copilot Chat，在模型选择器中选择由 OAIProvider 提供的模型。

模型展示格式为：

```text
<模型名> (<Provider 名>)
```

例如：

```text
Kimi K2.5 (NVIDIA NIM)
```

## 命令列表

| 命令 | 说明 |
| --- | --- |
| `OAIProvider: Manage Providers` | 管理入口 |
| `OAIProvider: Add Provider` | 新增 provider |
| `OAIProvider: Remove Provider` | 删除 provider 及其模型 |
| `OAIProvider: Add Model` | 给 provider 添加模型 |
| `OAIProvider: Remove Model` | 删除模型 |
| `OAIProvider: List Providers` | 查看当前所有 provider 和模型 |

## 配置说明

扩展把数据保存到：

```json
"openai-compat-provider.providers"
```

示例：

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

`supportsReasoning` 决定 VS Code 是否为该模型显示 Thinking Effort。
为了兼容旧配置，已经写过 `defaultReasoningLevel` 的模型会被视为支持 reasoning。

## 兼容服务示例

| 服务 | Base URL |
| --- | --- |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| Together AI | `https://api.together.xyz/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Mistral AI | `https://api.mistral.ai/v1` |

## 工作方式

运行时扩展会：

1. 注册一个 `LanguageModelChatProvider`
2. 把所有 provider/model 组合铺平成 Copilot 可选模型
3. 把 VS Code 的聊天消息转换成 OpenAI 兼容请求体
4. 向 `<baseUrl>/chat/completions` 发送流式请求
5. 把文本片段和工具调用片段持续回传给 VS Code

如果模型被标记为不支持视觉输入，扩展会在发请求前直接拦截图片输入。

## 开发

```bash
npm install
npm run compile
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run compile` | 编译一次 |
| `npm run watch` | 监听编译 |
| `npx tsc -p ./ --noEmit` | 仅做类型检查 |

核心文件：

```text
src/extension.ts
src/provider.ts
src/commands.ts
src/config.ts
src/types.ts
```
