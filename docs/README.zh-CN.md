# Copilot Model Bridge

[English](README.en.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/weisiren.copilot-model-bridge?label=VS%20Code%20Marketplace&logo=visualstudiocode&color=blue)](https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../LICENSE)

Copilot Model Bridge 是一个 VS Code 扩展，基于官方 `LanguageModelChatProvider` API，把任意 OpenAI 兼容接口接入 GitHub Copilot Chat。

它可以把 NVIDIA NIM、Ollama、LM Studio、vLLM、Together AI、Groq、OpenRouter 等 OpenAI 格式服务中的模型直接暴露到 Copilot 的模型选择器里。

## 功能概览

- 一个 VS Code 配置中可接入多个 provider
- 每个 provider 可配置多个模型
- 基于 `/chat/completions` 的流式响应
- 每个 provider 独立 API Key
- 支持工具调用能力开关
- 支持 Agent 编辑工具能力提示
- 支持视觉能力开关
- reasoning 模型可选显示 Thinking Effort 配置
- 支持更完整的模型 metadata 展示
- 支持 VS Code 编辑器页签内的持久配置管理器
- 通过命令面板向导完成配置，无需手改 JSON
- 支持编辑、复制、导入和校验 provider/model 配置

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

- 打开 [Copilot Model Bridge 扩展页面](https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge)
- 点击 `Install`
- 重载 VS Code

从源码运行：

```bash
git clone https://github.com/weisiren000/copilot-model-bridge.git
cd copilot-model-bridge
npm install
npm run compile
```

然后在 VS Code 中按 `F5` 启动 Extension Development Host。

### 2. 添加 provider

打开命令面板并执行：

```text
Copilot Model Bridge: Add Provider
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
Copilot Model Bridge: Add Model
```

向导支持配置：

1. 模型 ID
2. 模型显示名称
3. 最大输入 token
4. 是否支持工具调用
5. 是否向 Agent 模式提供编辑工具提示
6. 是否支持视觉输入
7. 视频附件策略
8. 通用文件附件策略
9. 成本倍率
10. 是否支持可配置 reasoning effort

对于 reasoning 模型，向导还会继续询问支持的思考层级和默认思考层级。

支持的思考层级：

- `none`
- `low`
- `medium`
- `high`
- `xhigh`
- `max`

### 4. 在 Copilot Chat 中使用

打开 Copilot Chat，在模型选择器中选择由 Copilot Model Bridge 提供的模型。

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
| `Copilot Model Bridge: Manage Providers` | 打开持久配置管理器 |
| `Copilot Model Bridge: Open Config Manager` | 打开 provider/model 配置页 |
| `Copilot Model Bridge: Quick Manage Providers` | 打开旧版 quick-pick 管理菜单 |
| `Copilot Model Bridge: Add Provider` | 新增 provider |
| `Copilot Model Bridge: Edit Provider` | 修改 provider 显示名称、Base URL 或 API Key |
| `Copilot Model Bridge: Remove Provider` | 删除 provider 及其模型 |
| `Copilot Model Bridge: Add Model` | 给 provider 添加模型 |
| `Copilot Model Bridge: Edit Model` | 修改模型显示名称和 token 限制 |
| `Copilot Model Bridge: Duplicate Model` | 复制已有模型配置 |
| `Copilot Model Bridge: Import Models from JSON` | 从 JSON 数组导入模型 |
| `Copilot Model Bridge: Validate Provider Config` | 检查重复 ID 和配置不一致 |
| `Copilot Model Bridge: Remove Model` | 删除模型 |
| `Copilot Model Bridge: List Providers` | 查看当前所有 provider 和模型 |

## 配置说明

扩展把数据保存到：

```json
"copilot-model-bridge.providers"
```

推荐配置入口：

```text
Copilot Model Bridge: Open Config Manager
```

它会在 VS Code 编辑器页签中打开配置管理器，支持 provider/model 列表、字段编辑、校验、JSON 导入、复制模型和保存。旧版 quick-pick 命令仍然保留，并且切换焦点时不会自动关闭输入框。

示例：

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

`supportsReasoning` 决定 VS Code 是否为该模型显示 Thinking Effort。为了兼容旧配置，已经写过 `defaultReasoningLevel` 且没有写 `supportsReasoning` 的模型会被视为支持 reasoning；如果显式写了 `supportsReasoning: false`，则不会显示 Thinking Effort。
`supportsEditTools` 决定 Agent 模式是否接收模型偏好的编辑工具提示。它默认跟随 `supportsToolCalling`；启用但未配置 `preferredEditTools` 时，默认提示为 `find-replace`、`multi-find-replace` 和 `apply-patch`。`preferredEditTools` 中的未知值会被过滤；如果配置的值全部未知，则不会声明编辑工具提示。`supportsToolCalling: false` 的模型永远不会声明编辑工具提示。
`supportsVideo` 和 `supportsFileInput` 定义附件边界。图片会按 OpenAI 兼容的 `image_url` 发送，文本和 JSON data part 会转成文本；视频和未知二进制附件会明确报错，不再静默忽略。
`multiplier` 决定 VS Code 中显示的成本倍率标签，默认是 `0x`；`1x`、`0.5x` 这类标签会自动推导 `multiplierNumeric`，除非你显式配置了 `multiplierNumeric`。
`family`、`version`、`categoryLabel`、`categoryOrder` 和 `statusIcon` 用于改善 VS Code 模型选择器和 Manage Models 中的 metadata 展示。`family` 未配置时会从模型 ID 推导，分类字段默认不声明，`statusIcon` 只接受安全的 VS Code ThemeIcon ID，例如 `sparkle` 或 `warning`。

Token count 是估算值。文本使用每 4 个字符约等于 1 token 的粗估规则，图片按每张 1024 tokens 估算，工具调用、工具结果、JSON 和文本 data part 会按序列化后的文本估算。该值用于 VS Code 上下文预算，可能与具体 provider 的 tokenizer 结果不同。

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

如果模型被标记为不支持视觉输入，扩展会在发请求前直接拦截图片输入。不支持的视频和未知二进制附件也会在发请求前明确报错。

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

