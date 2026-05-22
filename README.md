<p align="center">
  <img src="images/logo.png" alt="Copilot Model Bridge" width="128">
</p>

<h1 align="center">Copilot Model Bridge</h1>

<p align="center">
  把 OpenAI 兼容模型接入 GitHub Copilot Chat 的 VS Code 扩展。
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge">
    <img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace">
  </a>
  <img src="https://img.shields.io/badge/VS%20Code-%5E1.99.0-007ACC?style=flat-square" alt="VS Code 1.99.0+">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
</p>

<p align="center">
  <a href="docs/README.en.md">English</a>
</p>

![Copilot Model Bridge 配置界面](images/screenshot.png)

Copilot Model Bridge 会把你配置的模型注册到 Copilot Chat 模型选择器中。只要服务兼容 OpenAI Chat Completions 流式接口，就可以接入，例如 Ollama、LM Studio、vLLM、NVIDIA NIM、Groq、OpenRouter、Together AI 等。

## 功能

- 多 provider、多模型统一管理
- 支持 `/chat/completions` 流式响应
- 每个 provider 独立 Base URL 和 API Key
- 支持工具调用、编辑工具提示、视觉输入能力开关
- 支持 reasoning 模型的 Thinking Effort 配置
- 提供可视化配置管理器，也保留命令面板向导

## 要求

| 项目 | 要求 |
| --- | --- |
| VS Code | `1.99.0` 或更高 |
| GitHub Copilot | 个人版 Copilot Chat |
| 模型服务 | 兼容 OpenAI `/chat/completions`，并支持流式返回 |

> [!NOTE]
> 如果当前 VS Code 或组织策略禁用了语言模型 provider 能力，扩展可以安装，但模型可能不会出现在 Copilot Chat 中。

## 快速开始

1. 安装 [Copilot Model Bridge](https://marketplace.visualstudio.com/items?itemName=weisiren.copilot-model-bridge)。
2. 打开命令面板，运行 `Copilot Model Bridge: Open Config Manager`。
3. 新增 provider，填写名称、Provider ID、Base URL 和 API Key。
4. 在该 provider 下新增模型，填写模型 ID、显示名称、token 限制和能力开关。
5. 打开 Copilot Chat，在模型选择器中选择刚添加的模型。

模型会以 `<模型名> (<Provider 名>)` 的形式显示，例如：

```text
Kimi K2.5 (NVIDIA NIM)
```

## 配置示例

推荐使用配置管理器编辑。需要手写配置时，可在 VS Code Settings JSON 中使用 `copilot-model-bridge.providers`：

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

常用 Base URL：

| 服务 | Base URL |
| --- | --- |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Together AI | `https://api.together.xyz/v1` |

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `Copilot Model Bridge: Open Config Manager` | 打开可视化配置管理器 |
| `Copilot Model Bridge: Add Provider` | 新增 provider |
| `Copilot Model Bridge: Add Model` | 新增模型 |
| `Copilot Model Bridge: Import Models from JSON` | 从 JSON 导入模型 |
| `Copilot Model Bridge: Validate Provider Config` | 检查配置问题 |
| `Copilot Model Bridge: List Providers` | 查看已配置 provider 和模型 |

## 本地开发

```bash
npm install
npm run compile
npm test
```

在 VS Code 中打开仓库后按 `F5`，即可启动 Extension Development Host 调试扩展。

常用脚本：

| 脚本 | 说明 |
| --- | --- |
| `npm run compile` | 编译 TypeScript |
| `npm run watch` | 监听编译 |
| `npm test` | 运行测试 |
| `npm run lint` | 运行 ESLint |
