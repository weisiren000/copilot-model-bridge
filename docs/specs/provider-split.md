# 项目模块化拆分规格

> 日期：2026-05-20
> 目标：以 Provider 拆分为起点，逐步拆分项目中超过职责边界或超过 300 行的文件，形成稳定、可测试、低耦合的模块结构。

## 命名规范

**强制唯一格式：`cmb.<module>.<subject>[.<kind>].<ext>`。**

```
cmb.openaiCompatible.stream.ts
 │      │        │     └── 扩展名
 │      │        └──────── subject：职责名，camelCase 或小写单词
 │      └───────────────── module：模块名，camelCase 或小写单词
 └──────────────────────── 固定项目前缀

cmb.openaiCompatible.content.test.ts
 │      │      │       │  └── 扩展名
 │      │      │       └──── kind：文件类型，仅 test/spec/mock/helper 等需要出现
 │      │      └──────────── subject：职责名
 │      └─────────────────── module：模块名
 └────────────────────────── 固定项目前缀
```

硬规则：
- 文件名必须以 `cmb.` 开头。
- 允许例外仅限：聚合出口 `index.ts`、VS Code manifest 入口源文件 `extension.ts`、公共类型聚合 `types.ts`、`src/vscode-dts/*.d.ts`、配置文件。
- `module` 固定使用：`provider`、`openaiCompatible`、`deepseek`、`commands`、`management`、`configManager`、`test`。
- `subject` 使用职责名，不把 module 和 subject 粘成一个词：用 `cmb.openaiCompatible.messages.test.ts`，不用 `cmb.openaiCompatibleMessages.test.ts`。
- 测试文件统一使用 `.test.ts`，格式是 `cmb.<module>.<subject>.test.ts`。
- CSS/JS 同样遵守 module：用 `cmb.configManager.tokens.css`，不用 `cmb.tokens.css`。
- 文件夹用业务域或协议域命名（camelCase/小写），不重复 `cmb` 前缀：`provider/`、`provider/openaiCompatible/`、`provider/deepseek/`、`commands/`、`management/`、`configManager/`。
- 不再新增 `cmb-xxx/` 文件夹；Provider 协议实现统一放在 `src/provider/openaiCompatible/`。

## Provider 目录归属原则

Provider 相关代码按三层归属，不再平铺：

1. `src/provider/core/`：VS Code `LanguageModelChatProvider` 胶水层、模型列表、路由、请求编排。这里不放具体协议的消息转换或流解析。
2. `src/provider/openaiCompatible/`：OpenAI-compatible 协议实现，包括消息转换、SSE 流解析、OpenAI content part、能力、reasoning、token、billing、请求头和模型目录。
3. `src/provider/deepseek/`：DeepSeek 作为 OpenAI-compatible 之上的 provider 专属适配层，只放检测、thinking/reasoning patch、reasoning_content replay 和兼容数据解码。

配置管理、命令和 Webview 仍保留在各自域内；涉及 provider/model 配置数据的纯函数归到 `src/provider/config/` 或 `src/provider/model/`。迁移完成后删除旧根目录文件，不保留兼容出口。

---

## 背景

第一阶段围绕 `OpenAICompatChatProvider` 展开：该类实现 `vscode.LanguageModelChatProvider` 接口，拆分前承载了过多职责：

- LM Provider 接口适配（顶层胶水）
- 模型列表构建
- VS Code 消息 → OpenAI 消息格式转换
- SSE 流解析
- ThinkingPart 处理（运行时类型检测与回报）
- Token 估算

同类问题也存在于项目其他区域：

- `commands.ts` 同时负责命令注册、主菜单、Provider wizard、Model wizard。
- OpenAI-compatible 协议工具曾同时负责内容转换、模型能力、reasoning 配置、费用倍率和 token 估算。
- `configManager*` 与 `src/webview/*` 同时承载 Webview 宿主、HTML 模板、状态 reducer、浏览器端渲染、对话框与检查器逻辑。
- 大测试文件与大生产文件绑定过紧，难以定位回归。

## 目标

1. 所有生产 TS/JS 文件默认 ≤300 行；Provider 子模块默认 ≤150 行。
2. 保持 VS Code manifest 入口兼容：`extension.ts` 仍编译到 `out/extension.js`，命令 id 和配置 key 不变；`OpenAICompatChatProvider` 迁移到 `src/provider/core/`。
3. 按职责域拆分，不按"工具/组件"泛分类堆文件。
4. 每次拆分先补或调整定向测试，再移动代码。
5. 无循环依赖，无跨层反向 import。
6. 不为拆而拆：≤150 行且职责单一的文件保持原状。

## Provider 拆分方案

### 文件清单

| 文件 | 状态 | 预计行数 | 职责 |
|------|------|----------|------|
| `src/provider/openaiCompatible/cmb.openaiCompatible.stream.ts` | 目标路径 | 150 | OpenAI-compatible SSE 流解析 + ThinkingPart 处理 |
| `src/provider/openaiCompatible/cmb.openaiCompatible.messages.ts` | 目标路径 | 143 | OpenAI-compatible 消息转换 + Token 估算 |
| `src/provider/deepseek/cmb.deepseek.adapter.ts` | 目标路径 | 176 | DeepSeek 适配、reasoning patch、reasoning replay |
| `src/provider/core/cmb.provider.chatProvider.ts` | 目标路径 | 360 | LM Provider 顶层胶水 |

Provider 第一阶段迁移完成后，Provider core、OpenAI-compatible、DeepSeek、配置和模型模块均归入 `src/provider/**`，不保留根层兼容出口。

### 1. `provider/openaiCompatible/cmb.openaiCompatible.stream.ts`

职责边界：该模块负责"响应流输出侧"的 SSE 解析，同时集中维护 ThinkingPart 运行时兼容函数。`isThinkingPart` 与 `readThinkingValue` 也会被消息转换模块复用，但 ThinkingPart 兼容逻辑仍只保留一份，避免两边重复实现。

**导出函数：**

| 函数 | 来源（provider.ts 原行号） |
|------|---------------------------|
| `isThinkingPart(part: unknown)` | L354-359 |
| `readThinkingValue(part)` | L362-367 |
| `reportThinkingPart(progress, value)` | L335-351 |
| `consumeSSEStream(body, progress, token)` | L548-644 |

**外部依赖：** `vscode`, `../../types`, `../deepseek/cmb.deepseek.adapter`

### 2. `provider/openaiCompatible/cmb.openaiCompatible.messages.ts`

职责边界：该模块只处理 VS Code 消息到 OpenAI 兼容消息的转换，以及 Token 估算输入的归一化；不读取 Provider 配置、不组装 HTTP 请求、不处理 SSE 响应。

**导出函数：**

| 函数 | 来源（provider.ts 原行号） |
|------|---------------------------|
| `safeTokenText(value: unknown)` | L433-439 |
| `toTokenEstimateParts(parts)` | L405-431 |
| `convertMessages(messages, policy)` | L445-537 |

**外部依赖：** `vscode`, `./cmb.openaiCompatible.content`, `./cmb.openaiCompatible.token`, `../deepseek/cmb.deepseek.adapter`, `./cmb.openaiCompatible.stream`

### 3. `src/provider/core/cmb.provider.chatProvider.ts`

**保留的类成员：**

| 成员 | 变更说明 |
|------|----------|
| `changeEmitter` / `refreshModels()` / `dispose()` | 不变 |
| `provideLanguageModelChatInformation()` | 不变 |
| `buildModelList()` | 不变 |
| `provideLanguageModelChatResponse()` | `this.convertMessages()` → `convertMessages()`；`this.consumeSSEStream()` → `consumeSSEStream()` |
| `readModelConfiguration()` | 不变 |
| `applyDeepSeekRequestPatch()` | 不变 |
| `hasImageInput()` | 不变 |
| `provideTokenCount()` | `this.toTokenEstimateParts()` → `toTokenEstimateParts()` |
| `resolveProvider()` | 不变 |

**移除的成员：** 全部 7 个已搬走的私有方法

## 依赖关系图

```
provider/core/cmb.provider.chatProvider.ts ──→ provider/openaiCompatible/cmb.openaiCompatible.stream.ts
          │                                                           ↑
          ├──→ provider/openaiCompatible/cmb.openaiCompatible.messages.ts
          │        ├──→ provider/openaiCompatible/cmb.openaiCompatible.content.ts
          │        ├──→ provider/openaiCompatible/cmb.openaiCompatible.token.ts
          │        └──→ provider/deepseek/cmb.deepseek.adapter.ts
          ├──→ provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient.ts
          ├──→ provider/openaiCompatible/cmb.openaiCompatible.requestHeaders.ts
          ├──→ provider/openaiCompatible/index.ts
          ├──→ provider/config/cmb.provider.settings.ts
          └──→ provider/model/cmb.provider.modelMetadata.ts
```

## 第二阶段候选范围

如果后续仍要求 `src/provider/core/cmb.provider.chatProvider.ts` ≤250 行，不要在本次拆分中顺手扩大范围。应单独规划第二阶段：

- 抽出模型列表构建逻辑：`buildModelList` → `provider/core/cmb.provider.models.ts`
- 抽出请求 body 组装逻辑 → `provider/core/cmb.provider.request.ts`
- 抽出 provider/model 解析逻辑 → `provider/core/cmb.provider.routing.ts`

## 全项目目标结构

### OpenAI-Compatible 协议工具

把 OpenAI-compatible 协议工具拆成 `src/provider/openaiCompatible/` 下的职责模块，同时提供新目录聚合出口保持调用方稳定。不保留根层兼容出口。

```
src/provider/openaiCompatible/
├── cmb.openaiCompatible.billing.ts
├── cmb.openaiCompatible.capabilities.ts
├── cmb.openaiCompatible.content.ts
├── cmb.openaiCompatible.messages.ts
├── cmb.openaiCompatible.modelsCatalog.ts
├── cmb.openaiCompatible.reasoning.ts
├── cmb.openaiCompatible.requestHeaders.ts
├── cmb.openaiCompatible.stream.ts
├── cmb.openaiCompatible.token.ts
└── index.ts
```

职责边界：
- content：OpenAI content part、DataPart/MIME 转换。
- capabilities：模型 capabilities、edit tools。
- reasoning：reasoning schema、reasoning level 解析。
- token：字符串、DataPart、tool call、tool result 估算。
- billing：multiplier label 与 numeric 归一化。

兼容要求：
- 更新所有调用方 import 到 `src/provider/openaiCompatible/` 或其 `index.ts`。
- 不保留根层兼容出口。

### 命令系统

把命令注册、菜单、wizard、管理命令拆开。

```
src/commands/
├── cmb.commands.registry.ts
├── cmb.commands.manage.ts
├── cmb.commands.providerWizard.ts
├── cmb.commands.modelWizard.ts
├── cmb.commands.items.ts
└── index.ts

src/management/
├── cmb.management.provider.ts
├── cmb.management.model.ts
├── cmb.management.import.ts
├── cmb.management.validate.ts
├── cmb.management.list.ts
├── cmb.management.ui.ts
└── index.ts
```

兼容要求：
- `registerCommands(context, onConfigSaved)` 行为不变。
- package.json 中的 command id 不变。
- VS Code QuickPick/InputBox 文案不在拆分中改变。

### Config Manager 宿主侧

把 Webview panel 生命周期、消息处理、HTML 模板和 reducer 分离。

```
src/configManager/
├── cmb.configManager.panel.ts
├── cmb.configManager.handlers.ts
├── cmb.configManager.confirm.ts
├── cmb.configManager.html.ts
├── cmb.configManager.modals.ts
├── cmb.configManager.state.ts
├── cmb.configManager.reducer.ts
├── cmb.configManager.actions.ts
└── index.ts
```

兼容要求：
- `openConfigManagerPanel`、`renderConfigManagerHtml`、`reduceConfigManagerMessage` 从 `src/configManager/` 聚合出口导出。
- Webview message union 类型只有一个来源，避免重复定义后漂移。

### Webview 浏览器端

拆分浏览器端 JS，不引入打包器。

```
src/webview/configManager/
├── cmb.configManager.state.js
├── cmb.configManager.dom.js
├── cmb.configManager.renderProviders.js
├── cmb.configManager.renderModels.js
├── cmb.configManager.events.js
├── cmb.configManager.dialogShared.js
├── cmb.configManager.dialogProvider.js
├── cmb.configManager.dialogModel.js
├── cmb.configManager.inspectorExport.js
├── cmb.configManager.inspectorPreview.js
├── cmb.configManager.inspectorFormat.js
```

约束：
- 保持 script 标签加载顺序显式稳定。
- 不引入构建步骤。
- 不改变用户可见交互。

### Webview 样式

按层拆分 CSS，避免全局覆盖链继续变长。

```
src/webview/styles/
├── cmb.configManager.tokens.css
├── cmb.configManager.layout.css
├── cmb.configManager.buttons.css
├── cmb.configManager.forms.css
├── cmb.configManager.lists.css
├── cmb.configManager.dialogs.css
├── cmb.configManager.inspector.css
└── cmb.configManager.utilities.css
```

加载顺序：tokens → layout → components → feature → utilities。

### 测试文件

测试跟随生产模块分组，全部使用 `cmb.` 前缀。

```
src/test/
├── cmb.openaiCompatible.messages.test.ts
├── cmb.openaiCompatible.stream.test.ts
├── cmb.openaiCompatible.content.test.ts
├── cmb.openaiCompatible.capabilities.test.ts
├── cmb.openaiCompatible.reasoning.test.ts
├── cmb.openaiCompatible.token.test.ts
├── cmb.openaiCompatible.billing.test.ts
├── cmb.openaiCompatible.requestHeaders.test.ts
├── cmb.configManager.html.test.ts
├── cmb.configManager.messages.test.ts
├── cmb.provider.configManagement.test.ts
├── cmb.provider.configKeys.test.ts
├── cmb.provider.settings.test.ts
├── cmb.provider.modelConfig.test.ts
├── cmb.provider.modelMetadata.test.ts
├── cmb.deepseek.adapter.test.ts
├── cmb.deepseek.detect.test.ts
├── cmb.deepseek.requestPatch.test.ts
├── cmb.deepseek.reasoningReplay.test.ts
├── cmb.openaiCompatible.chatHttpClient.test.ts
├── cmb.provider.models.test.ts
├── cmb.provider.routing.test.ts
└── helpers/
    ├── cmb.test.vscodeMock.ts
    ├── cmb.test.webviewStateFactories.ts
    └── cmb.test.streamFactories.ts
```

## 小文件强制命名迁移清单

以下文件当前职责边界可接受，但仍必须按业务域归类并改成 `cmb.*` 文件名；这些迁移由 Provider 归类收尾阶段覆盖，只改名和 import，不重写实现。

| 当前文件 | 目标文件 | 原因 |
|----------|----------|------|
| 旧根层 DeepSeek 适配 | `src/provider/deepseek/cmb.deepseek.adapter.ts` | DeepSeek 适配聚合仍可读 |
| 旧根层模型目录拉取 | `src/provider/openaiCompatible/cmb.openaiCompatible.modelsCatalog.ts` | OpenAI-compatible 模型目录/拉取职责单一 |
| 旧根层 Provider 配置数据操作 | `src/provider/config/cmb.provider.configManagement.ts` | Provider 配置数据操作职责清晰 |
| 旧根层模型配置解析 | `src/provider/model/cmb.provider.modelConfig.ts` | 模型配置输入解析职责单一 |
| 旧根层 VS Code settings 读写 | `src/provider/config/cmb.provider.settings.ts` | VS Code settings 读写职责单一 |
| 旧根层模型元数据构建 | `src/provider/model/cmb.provider.modelMetadata.ts` | Provider 模型元数据构建职责单一 |
| 旧根层 HTTP 流请求 | `src/provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient.ts` | HTTP 流请求职责单一 |
| 旧根层请求 Header 构建 | `src/provider/openaiCompatible/cmb.openaiCompatible.requestHeaders.ts` | OpenAI-compatible Chat 请求 Header 构建职责单一 |
| 旧根层配置 key 常量 | `src/provider/config/cmb.provider.configKeys.ts` | 配置 key 常量 |

允许保留旧名的文件：
- `src/extension.ts`：VS Code manifest `main` 入口源文件。
- `src/types.ts`：公共类型聚合，避免类型 import 大面积 churn。
- `src/vscode-dts/vscode.proposed.languageModelThinkingPart.d.ts`：外部提案声明文件。

除以上文件外，迁移完成后不得保留旧 root-level 源文件作为兼容出口。

## 分阶段验收标准

每个阶段必须满足：

- [ ] `npm run compile` 成功
- [ ] `npm run lint` 成功
- [ ] 阶段相关 `node --test` 成功
- [ ] 新增模块无循环依赖
- [ ] 对外入口路径、命令 id、配置 key 不变
- [ ] 单文件行数符合阶段目标

## 全量拆分完成后的预期文件树

```text
src/
├── commands/
│   ├── cmb.commands.items.ts
│   ├── cmb.commands.manage.ts
│   ├── cmb.commands.modelWizard.ts
│   ├── cmb.commands.providerWizard.ts
│   ├── cmb.commands.registry.ts
│   └── index.ts
├── configManager/
│   ├── cmb.configManager.actions.ts
│   ├── cmb.configManager.confirm.ts
│   ├── cmb.configManager.handlers.ts
│   ├── cmb.configManager.html.ts
│   ├── cmb.configManager.modals.ts
│   ├── cmb.configManager.panel.ts
│   ├── cmb.configManager.reducer.ts
│   ├── cmb.configManager.state.ts
│   └── index.ts
├── management/
│   ├── cmb.management.import.ts
│   ├── cmb.management.list.ts
│   ├── cmb.management.model.ts
│   ├── cmb.management.provider.ts
│   ├── cmb.management.ui.ts
│   ├── cmb.management.validate.ts
│   └── index.ts
├── provider/
│   ├── config/
│   │   ├── cmb.provider.configKeys.ts
│   │   ├── cmb.provider.configManagement.ts
│   │   ├── cmb.provider.settings.ts
│   │   └── index.ts
│   ├── core/
│   │   ├── cmb.provider.chatProvider.ts
│   │   ├── cmb.provider.models.ts
│   │   ├── cmb.provider.request.ts
│   │   ├── cmb.provider.routing.ts
│   │   └── index.ts
│   ├── deepseek/
│   │   ├── cmb.deepseek.adapter.ts
│   │   ├── cmb.deepseek.detect.ts
│   │   ├── cmb.deepseek.reasoningReplay.ts
│   │   ├── cmb.deepseek.requestPatch.ts
│   │   └── index.ts
│   ├── model/
│   │   ├── cmb.provider.modelConfig.ts
│   │   ├── cmb.provider.modelMetadata.ts
│   │   └── index.ts
│   ├── openaiCompatible/
│   │   ├── cmb.openaiCompatible.billing.ts
│   │   ├── cmb.openaiCompatible.capabilities.ts
│   │   ├── cmb.openaiCompatible.chatHttpClient.ts
│   │   ├── cmb.openaiCompatible.content.ts
│   │   ├── cmb.openaiCompatible.messages.ts
│   │   ├── cmb.openaiCompatible.modelsCatalog.ts
│   │   ├── cmb.openaiCompatible.reasoning.ts
│   │   ├── cmb.openaiCompatible.requestHeaders.ts
│   │   ├── cmb.openaiCompatible.stream.ts
│   │   ├── cmb.openaiCompatible.token.ts
│   │   └── index.ts
│   └── index.ts
├── test/
│   ├── cmb.configManager.html.test.ts
│   ├── cmb.configManager.messages.test.ts
│   ├── cmb.deepseek.adapter.test.ts
│   ├── cmb.deepseek.detect.test.ts
│   ├── cmb.deepseek.reasoningReplay.test.ts
│   ├── cmb.deepseek.requestPatch.test.ts
│   ├── cmb.openaiCompatible.chatHttpClient.test.ts
│   ├── cmb.openaiCompatible.billing.test.ts
│   ├── cmb.openaiCompatible.capabilities.test.ts
│   ├── cmb.openaiCompatible.content.test.ts
│   ├── cmb.openaiCompatible.messages.test.ts
│   ├── cmb.openaiCompatible.reasoning.test.ts
│   ├── cmb.openaiCompatible.requestHeaders.test.ts
│   ├── cmb.openaiCompatible.stream.test.ts
│   ├── cmb.openaiCompatible.token.test.ts
│   ├── cmb.provider.models.test.ts
│   ├── cmb.provider.routing.test.ts
│   ├── cmb.provider.chatProvider.test.ts
│   ├── cmb.provider.configKeys.test.ts
│   ├── cmb.provider.configManagement.test.ts
│   ├── cmb.provider.modelConfig.test.ts
│   ├── cmb.provider.modelMetadata.test.ts
│   └── helpers/
│       ├── cmb.test.streamFactories.ts
│       ├── cmb.test.vscodeMock.ts
│       └── cmb.test.webviewStateFactories.ts
├── webview/
│   ├── configManager/
│   │   ├── cmb.configManager.dialogModel.js
│   │   ├── cmb.configManager.dialogProvider.js
│   │   ├── cmb.configManager.dialogShared.js
│   │   ├── cmb.configManager.dom.js
│   │   ├── cmb.configManager.events.js
│   │   ├── cmb.configManager.inspectorExport.js
│   │   ├── cmb.configManager.inspectorFormat.js
│   │   ├── cmb.configManager.inspectorPreview.js
│   │   ├── cmb.configManager.renderModels.js
│   │   ├── cmb.configManager.renderProviders.js
│   │   └── cmb.configManager.state.js
│   └── styles/
│       ├── cmb.configManager.buttons.css
│       ├── cmb.configManager.dialogs.css
│       ├── cmb.configManager.forms.css
│       ├── cmb.configManager.inspector.css
│       ├── cmb.configManager.layout.css
│       ├── cmb.configManager.lists.css
│       ├── cmb.configManager.tokens.css
│       └── cmb.configManager.utilities.css
├── extension.ts
├── types.ts
└── vscode-dts/
    └── vscode.proposed.languageModelThinkingPart.d.ts
```

说明：最终架构不保留旧 root-level 源文件。`src/extension.ts` 是唯一必须保持在根目录的 VS Code manifest 源入口，因为 `package.json` 的 `main` 指向编译产物 `./out/extension.js`。其他实现文件迁移完成后必须删除旧文件，并更新所有 import。命令 id、配置 key、VS Code manifest 入口保持稳定。

## 推荐顺序

1. Provider 归类收尾：Provider 相关实现统一迁移到 `src/provider/**`。
2. OpenAI-Compatible 协议工具细化：在新目录基础上按增长情况继续拆分并补测试。
3. 命令系统拆分：最大文件 `commands.ts` 优先降复杂度。
4. Config Manager 宿主侧拆分：稳定 Webview 与后端消息边界。
5. Webview JS 拆分：变更面大，放在宿主侧稳定后。
6. Webview CSS 拆分：最后处理视觉层，避免与 JS 拆分互相干扰。
7. Provider core 二阶段：按需要把 `src/provider/core/cmb.provider.chatProvider.ts` 继续压到 ≤250 行。
