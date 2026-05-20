# Provider 模块拆分实施计划

> 日期：2026-05-20
> 关联规格：`docs/specs/provider-split.md`

## 命名规范

**强制唯一格式：`cmb.<module>.<subject>[.<kind>].<ext>`。**

```
cmb.openaiCompatible.messages.ts
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
- 文件名必须以 `cmb.` 开头，除聚合出口 `index.ts`、VS Code manifest 入口源文件 `extension.ts`、公共类型聚合 `types.ts`、配置文件外。
- `module` 固定使用：`provider`、`openaiCompatible`、`deepseek`、`commands`、`management`、`configManager`、`test`。
- `subject` 使用职责名，不把 module 和 subject 粘成一个词：用 `cmb.openaiCompatible.messages.test.ts`，不用 `cmb.openaiCompatibleMessages.test.ts`。
- 测试文件统一使用 `.test.ts`，格式是 `cmb.<module>.<subject>.test.ts`。
- CSS/JS 同样遵守 module：用 `cmb.configManager.tokens.css`，不用 `cmb.tokens.css`。
- 文件夹用业务域或协议域命名（camelCase/小写），不重复 `cmb`：`provider/`、`provider/openaiCompatible/`、`provider/deepseek/`、`commands/`、`management/`、`configManager/`。
- `cmb-provider/` 只作为当前已落地的临时目录存在；最终必须迁移到 `src/provider/openaiCompatible/` 并删除，后续不再新增 `cmb-xxx/` 文件夹。

## Provider 目录归属原则

Provider 相关代码按三层归属，不再平铺：

1. `src/provider/core/`：VS Code `LanguageModelChatProvider` 胶水层、模型列表、路由、请求编排。这里不放具体协议的消息转换或流解析。
2. `src/provider/openaiCompatible/`：OpenAI-compatible 协议实现，包括消息转换、SSE 流解析、OpenAI content part、能力、reasoning、token、billing、请求头和模型目录。
3. `src/provider/deepseek/`：DeepSeek 作为 OpenAI-compatible 之上的 provider 专属适配层，只放检测、thinking/reasoning patch、reasoning_content replay 和兼容数据解码。

配置管理、命令和 Webview 仍保留在各自域内；涉及 provider/model 配置数据的纯函数归到 `src/provider/config/` 或 `src/provider/model/`。迁移完成后删除旧根目录文件，不保留兼容出口。

---

## 实施前校正

- 当前消息转换、Token 估算、SSE 流解析与 ThinkingPart 兼容逻辑已经从旧 `provider.ts` 拆出到 `src/cmb-provider/`，本计划不再从 `provider.ts` 二次搬运这些方法。
- 本阶段目标是把当前过渡目录统一迁移到新的 `src/provider/**` 结构，并更新所有 import、测试文件名和验证命令。
- 所有 Provider 相关 import 统一使用新目录；不新增、不保留 root-level 兼容出口，不写临时 `../../openai`、`../../config`、`../../deepseek` 之类过渡路径。
- 仅执行本阶段后，`src/provider/core/cmb.provider.chatProvider.ts` 预计仍约 360 行；`≤250` 是 Provider core 二阶段目标，不在本阶段顺手扩大范围。

## 实施步骤

### Step 0：先迁移 OpenAI-Compatible 测试命名

在搬运或验证前，先把当前已存在的 Provider 定向测试改成协议归属明确的固定命名格式，确保后续命令路径真实存在。

| 当前文件 | 目标文件 |
|----------|----------|
| `src/test/providerMessages.test.ts` | `src/test/cmb.openaiCompatible.messages.test.ts` |
| `src/test/providerStream.test.ts` | `src/test/cmb.openaiCompatible.stream.test.ts` |

只移动文件，不改测试断言；如果文档、命令或引用中出现旧测试文件名，同步改成新命名。

### Step 1：创建新 Provider 目录

创建以下目录，不新增 `cmb-xxx/` 目录：

```text
src/provider/core/
src/provider/openaiCompatible/
src/provider/deepseek/
src/provider/config/
src/provider/model/
```

### Step 2：迁移 DeepSeek 适配层

| 当前文件 | 目标文件 |
|----------|----------|
| `src/deepseek.ts` | `src/provider/deepseek/cmb.deepseek.adapter.ts` |
| `src/test/deepseek.test.ts` | `src/test/cmb.deepseek.adapter.test.ts` |

同步更新所有 import：

| 当前 import | 目标 import |
|-------------|-------------|
| `./deepseek` | `./provider/deepseek/cmb.deepseek.adapter` |
| `../deepseek` | `../provider/deepseek/cmb.deepseek.adapter` |
| `../deepseek`（来自 `src/provider/openaiCompatible/`） | `../deepseek/cmb.deepseek.adapter` |

### Step 3：迁移 OpenAI-Compatible 基础模块

先把 Provider 依赖的 OpenAI-compatible 基础文件迁移到新路径，避免后续模块继续引用根目录旧文件。

| 当前文件 | 目标文件 |
|----------|----------|
| `src/openai.ts` | 拆为 `src/provider/openaiCompatible/cmb.openaiCompatible.content.ts`、`cmb.openaiCompatible.capabilities.ts`、`cmb.openaiCompatible.reasoning.ts`、`cmb.openaiCompatible.token.ts`、`cmb.openaiCompatible.billing.ts` |
| `src/chatHttpClient.ts` | `src/provider/openaiCompatible/cmb.openaiCompatible.chatHttpClient.ts` |
| `src/requestHeaders.ts` | `src/provider/openaiCompatible/cmb.openaiCompatible.requestHeaders.ts` |
| `src/openaiModels.ts` | `src/provider/openaiCompatible/cmb.openaiCompatible.modelsCatalog.ts` |

`src/openai.ts` 拆分归属：

| 导出 | 目标模块 |
|------|----------|
| `OpenAIContentPart`、`OpenAIContent`、`AttachmentPolicy`、`createOpenAIImagePart`、`createOpenAITextPart`、`createOpenAIDataPartContent`、`buildOpenAIContent` | `cmb.openaiCompatible.content.ts` |
| `ModelCapabilities`、`RequestedToolMode`、`ResolveToolChoiceOptions`、`buildModelCapabilities`、`resolveToolChoice`、`normalizeEditTools` | `cmb.openaiCompatible.capabilities.ts` |
| `buildReasoningConfigurationSchema`、`buildModelReasoningConfigurationSchema`、`resolveReasoningLevel` | `cmb.openaiCompatible.reasoning.ts` |
| `TokenEstimatePart`、`estimateStringTokens`、`estimateChatMessageTokens` | `cmb.openaiCompatible.token.ts` |
| `ModelBillingMetadata`、`buildModelBillingMetadata` | `cmb.openaiCompatible.billing.ts` |

创建 `src/provider/openaiCompatible/index.ts`，只聚合对外稳定 API。迁移完成后删除 `src/openai.ts`，不保留旧路径兼容出口。

### Step 4：迁移 Provider 配置与模型基础模块

把 Provider core 依赖的配置、模型元数据模块也迁移到新路径：

| 当前文件 | 目标文件 |
|----------|----------|
| `src/config.ts` | `src/provider/config/cmb.provider.settings.ts` |
| `src/configKeys.ts` | `src/provider/config/cmb.provider.configKeys.ts` |
| `src/configManagement.ts` | `src/provider/config/cmb.provider.configManagement.ts` |
| `src/modelConfig.ts` | `src/provider/model/cmb.provider.modelConfig.ts` |
| `src/modelMetadata.ts` | `src/provider/model/cmb.provider.modelMetadata.ts` |

分别创建 `src/provider/config/index.ts`、`src/provider/model/index.ts` 聚合出口。迁移完成后删除旧根目录文件，不保留兼容出口。

### Step 5：迁移 OpenAI-Compatible 过渡模块

| 当前文件 | 目标文件 |
|----------|----------|
| `src/cmb-provider/cmb.provider.messages.ts` | `src/provider/openaiCompatible/cmb.openaiCompatible.messages.ts` |
| `src/cmb-provider/cmb.provider.stream.ts` | `src/provider/openaiCompatible/cmb.openaiCompatible.stream.ts` |

迁移后更新模块内部 import：

| 文件 | 当前 import | 目标 import |
|------|-------------|-------------|
| `cmb.openaiCompatible.messages.ts` | `../deepseek` | `../deepseek/cmb.deepseek.adapter` |
| `cmb.openaiCompatible.messages.ts` | `../openai` | `./cmb.openaiCompatible.content` + `./cmb.openaiCompatible.token` |
| `cmb.openaiCompatible.messages.ts` | `./cmb.provider.stream` | `./cmb.openaiCompatible.stream` |
| `cmb.openaiCompatible.stream.ts` | `../deepseek` | `../deepseek/cmb.deepseek.adapter` |
| `cmb.openaiCompatible.stream.ts` | `../types` | `../../types` |

迁移后更新测试中的动态 import：

| 当前引用 | 目标引用 |
|----------|----------|
| `../cmb-provider/cmb.provider.messages` | `../provider/openaiCompatible/cmb.openaiCompatible.messages` |
| `../cmb-provider/cmb.provider.stream` | `../provider/openaiCompatible/cmb.openaiCompatible.stream` |

完成后删除 `src/cmb-provider/` 空目录。

### Step 6：迁移 Provider core

| 当前文件 | 目标文件 |
|----------|----------|
| `src/provider.ts` | `src/provider/core/cmb.provider.chatProvider.ts` |

同步更新 import：

| 文件 | 当前 import | 目标 import |
|------|-------------|-------------|
| `src/extension.ts` | `./provider` | `./provider/core/cmb.provider.chatProvider` |
| `cmb.provider.chatProvider.ts` | `./cmb-provider/cmb.provider.messages` | `../openaiCompatible/cmb.openaiCompatible.messages` |
| `cmb.provider.chatProvider.ts` | `./cmb-provider/cmb.provider.stream` | `../openaiCompatible/cmb.openaiCompatible.stream` |
| `cmb.provider.chatProvider.ts` | `./deepseek` | `../deepseek/cmb.deepseek.adapter` |
| `cmb.provider.chatProvider.ts` | `./config` | `../config/cmb.provider.settings` |
| `cmb.provider.chatProvider.ts` | `./openai` | `../openaiCompatible` |
| `cmb.provider.chatProvider.ts` | `./chatHttpClient` | `../openaiCompatible/cmb.openaiCompatible.chatHttpClient` |
| `cmb.provider.chatProvider.ts` | `./requestHeaders` | `../openaiCompatible/cmb.openaiCompatible.requestHeaders` |
| `cmb.provider.chatProvider.ts` | `./modelMetadata` | `../model/cmb.provider.modelMetadata` |
| `cmb.provider.chatProvider.ts` | `./types` | `../../types` |

### Step 7：禁止旧路径回流

迁移后必须搜索并清零以下旧路径：

```bash
rg "cmb-provider|from './provider'|from \"./provider\"|from './deepseek'|from '../deepseek'|from './openai'|from '../openai'|from './config'|from '../config'|from './chatHttpClient'|from './requestHeaders'|from './modelMetadata'|providerMessages.test|providerStream.test" src docs
```

允许出现的例外只有本计划中用于说明迁移映射的历史路径。

### Step 8：编译验证

```bash
npm run compile
```

### Step 9：测试验证

新增拆分模块的定向测试，避免只靠"现有测试通过"掩盖搬运错误：

1. `src/test/cmb.openaiCompatible.messages.test.ts`
   - 覆盖 `toTokenEstimateParts` 的文本、DataPart、ToolCall、ToolResult 嵌套递归。
   - 覆盖 `convertMessages` 的文本消息、工具调用、工具结果、DeepSeek reasoning DataPart。
2. `src/test/cmb.openaiCompatible.stream.test.ts`
   - 覆盖 `consumeSSEStream` 对 `delta.content` 的文本回报。
   - 覆盖 `delta.reasoning_content` 的 ThinkingPart/DataPart 兜底。
   - 覆盖分片 `tool_calls` 参数拼接与最终 `LanguageModelToolCallPart` flush。

执行顺序：

```bash
npm run compile
node --test ./out/test/cmb.openaiCompatible.messages.test.js ./out/test/cmb.openaiCompatible.stream.test.js ./out/test/cmb.deepseek.adapter.test.js
```

如果已有测试因 import 路径变化失败，只更新测试引用，不改变业务断言。

### Step 10：Lint 检查

```bash
npm run lint
```

## 最终目录结构变化

```
src/
├── provider/
│   ├── config/
│   │   ├── cmb.provider.configKeys.ts
│   │   ├── cmb.provider.configManagement.ts
│   │   └── cmb.provider.settings.ts
│   ├── core/
│   │   └── cmb.provider.chatProvider.ts
│   ├── deepseek/
│   │   └── cmb.deepseek.adapter.ts
│   ├── model/
│   │   ├── cmb.provider.modelConfig.ts
│   │   └── cmb.provider.modelMetadata.ts
│   └── openaiCompatible/
│       ├── cmb.openaiCompatible.billing.ts
│       ├── cmb.openaiCompatible.capabilities.ts
│       ├── cmb.openaiCompatible.chatHttpClient.ts
│       ├── cmb.openaiCompatible.content.ts
│       ├── cmb.openaiCompatible.messages.ts
│       ├── cmb.openaiCompatible.modelsCatalog.ts
│       ├── cmb.openaiCompatible.reasoning.ts
│       ├── cmb.openaiCompatible.requestHeaders.ts
│       ├── cmb.openaiCompatible.stream.ts
│       └── cmb.openaiCompatible.token.ts
├── ...                                   ← 其他文件不变
```

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| `convertMessages` 内部调用链复杂 | 逐行搬运，保持代码完全不变 |
| 归位后 `cmb.provider.chatProvider.ts` 达不到 250 行 | 本阶段验收改为 ≤380；严格 ≤250 留到 Provider core 二阶段拆分 |
| 测试文件 import 需要更新 | Step 9 专门处理测试 |
| 可能遗漏 hidden dependency | 编译验证 + Lint 双重检查 |
| 子文件夹路径 `../` 写错 | Step 8 编译检查会立即暴露 |

## 成功标准

- [x] `npm run compile` 成功
- [x] `node --test ./out/test/cmb.openaiCompatible.messages.test.js ./out/test/cmb.openaiCompatible.stream.test.js ./out/test/cmb.deepseek.adapter.test.js` 成功
- [x] 现有相关测试通过或引用更新后通过
- [x] `npm run lint` 无新增错误
- [x] `src/provider/core/cmb.provider.chatProvider.ts` 行数 ≤ 380
- [x] `src/provider/openaiCompatible/cmb.openaiCompatible.stream.ts` 行数 ≤ 150
- [x] `src/provider/openaiCompatible/cmb.openaiCompatible.messages.ts` 行数 ≤ 150
- [x] 根目录不再存在 `src/provider.ts`、`src/deepseek.ts`、`src/openai.ts`、`src/chatHttpClient.ts`、`src/requestHeaders.ts`、`src/openaiModels.ts`、`src/config.ts`、`src/configKeys.ts`、`src/configManagement.ts`、`src/modelConfig.ts`、`src/modelMetadata.ts`、`src/cmb-provider/`
- [x] 无循环依赖警告

## Provider 第一阶段预期文件树

```text
src/
├── provider/
│   ├── config/
│   │   ├── cmb.provider.configKeys.ts
│   │   ├── cmb.provider.configManagement.ts
│   │   └── cmb.provider.settings.ts
│   ├── core/
│   │   └── cmb.provider.chatProvider.ts
│   ├── deepseek/
│   │   └── cmb.deepseek.adapter.ts
│   ├── model/
│   │   ├── cmb.provider.modelConfig.ts
│   │   └── cmb.provider.modelMetadata.ts
│   └── openaiCompatible/
│       ├── cmb.openaiCompatible.billing.ts
│       ├── cmb.openaiCompatible.capabilities.ts
│       ├── cmb.openaiCompatible.chatHttpClient.ts
│       ├── cmb.openaiCompatible.content.ts
│       ├── cmb.openaiCompatible.messages.ts
│       ├── cmb.openaiCompatible.modelsCatalog.ts
│       ├── cmb.openaiCompatible.reasoning.ts
│       ├── cmb.openaiCompatible.requestHeaders.ts
│       ├── cmb.openaiCompatible.stream.ts
│       └── cmb.openaiCompatible.token.ts
├── test/
│   ├── cmb.deepseek.adapter.test.ts
│   ├── cmb.openaiCompatible.messages.test.ts
│   └── cmb.openaiCompatible.stream.test.ts
```

当前已落地的 `src/cmb-provider/cmb.provider.messages.ts` 与 `src/cmb-provider/cmb.provider.stream.ts` 只是过渡形态；正式收尾时迁移到上面的 `src/provider/openaiCompatible/` 结构。

---

# 全项目文件拆分路线图

> 目标：把所有超过职责边界或接近 300 行阈值的文件拆成可测试、可独立理解的小模块；对已经足够小的文件只记录归属，不做无意义拆分。

## 总原则

1. 每个阶段只处理一个职责域，完成后必须运行该阶段的定向测试、`npm run compile` 和 `npm run lint`。
2. 不跨阶段移动公共类型，除非当前阶段必须解除循环依赖。
3. 优先"纯搬运 + 补测试"，不在拆分阶段改业务行为。
4. 新文件行数目标：普通模块 ≤300 行，Provider 子模块 ≤150 行，Webview 单文件 ≤250 行。
5. 已低于 150 行且职责单一的文件默认不拆，只在依赖迁移时调整 import。
6. **所有新文件命名遵循 `cmb.<module>.<subject>[.<kind>].<ext>`，文件夹用业务域或协议域（camelCase/小写）。**

## 当前文件分级

| 文件 | 当前行数 | 处理策略 | 目标 |
|------|----------|----------|------|
| `src/commands.ts` | 475 | 必拆 | 注册入口、Provider wizard、Model wizard 分离 |
| `src/test/openai.test.ts` | 485 | 必拆 | 随 `openai.ts` 分组拆测试 |
| `src/webview/configManager.core.js` | 371 | 必拆 | 状态、渲染、事件绑定分离 |
| `src/openai.ts` | 365 | 必拆 | 内容转换、模型能力、reasoning、token 估算分离 |
| `src/provider/core/cmb.provider.chatProvider.ts` | 360 | 二阶段拆 | 模型列表、请求体、路由分离，目标 ≤250 |
| `src/webview/configManager.inspector.js` | 357 | 必拆 | 导出、格式化、预览渲染分离 |
| `src/webview/configManager.components.css` | 327 | 必拆 | 表单、列表、按钮/状态样式分离 |
| `src/webview/configManager.base.css` | 324 | 必拆 | tokens、layout、基础元素分离 |
| `src/managementCommands.ts` | 322 | 必拆 | picker/input/import/summary helper 分离 |
| `src/webview/configManager.dialogs.js` | 312 | 必拆 | provider dialog、model dialog、shared dialog 分离 |
| `src/configManagerMessages.ts` | 260 | 可选拆 | reducer action 继续增长时拆 state/actions |
| `src/configManagerHtml.ts` | 251 | 可选拆 | HTML shell 与 modal 模板分离 |
| `src/webview/configManager.dialogs.css` | 242 | 可选拆 | 可保留；若 dialogs.js 拆分后再同步拆 |
| `src/configManagerPanel.ts` | 220 | 可选拆 | Webview host 与 message handler 可后拆 |
| 其他 `src/*.ts` 小文件 | ≤201 | 不主动拆 | 保持职责单一，必要时只调整 import |

## Phase 0：基线与工具稳定

**目的：** 让后续每次拆分都有稳定验证入口。

**文件：**
- 保留：`eslint.config.mjs`
- 检查：`package.json` scripts

**步骤：**

1. 确认 `npm run compile` 成功。
2. 确认 `npm run lint` 成功。
3. 确认当前相关测试可运行：
   ```bash
   node --test ./out/test/*.test.js
   ```
4. 不在本阶段移动业务代码。

**验收：**
- `npm run compile` 成功
- `npm run lint` 成功
- `node --test ./out/test/*.test.js` 成功

## Phase 0.5：命名规范落地

**目的：** 在继续拆分前先统一已存在测试文件命名，确保后续阶段引用的 `cmb.*.test.js` 路径真实存在。

**重命名：**

| 当前文件 | 目标文件 |
|----------|----------|
| `src/test/providerMessages.test.ts` | `src/test/cmb.openaiCompatible.messages.test.ts` |
| `src/test/providerStream.test.ts` | `src/test/cmb.openaiCompatible.stream.test.ts` |

**步骤：**
1. 仅移动文件，不改测试内容。
2. 搜索并更新文档、命令、引用中的旧测试文件名。
3. 暂不重命名所有旧测试，其他测试跟随对应阶段迁移。

**验证：**
```bash
npm run compile
node --test ./out/test/cmb.openaiCompatible.messages.test.js ./out/test/cmb.openaiCompatible.stream.test.js
npm run lint
```

**验收：**
- 除 Phase 0.5 的重命名映射说明外，仓库内不再出现 `providerMessages.test` / `providerStream.test`
- 新命名测试通过
- 不改生产代码

## Phase 1：Provider 归类收尾

**状态：** 已完成（2026-05-20）。Provider 相关根目录文件已归入 `src/provider/**`，旧根层实现与 `src/cmb-provider/` 已删除。

**后续收尾：**
1. [x] 将 `src/provider.ts` 迁移为 `src/provider/core/cmb.provider.chatProvider.ts`，`extension.ts` 改从新路径导入。
2. [x] 将 `src/cmb-provider/cmb.provider.messages.ts` 迁移为 `src/provider/openaiCompatible/cmb.openaiCompatible.messages.ts`。
3. [x] 将 `src/cmb-provider/cmb.provider.stream.ts` 迁移为 `src/provider/openaiCompatible/cmb.openaiCompatible.stream.ts`。
4. [x] 将 `src/deepseek.ts` 迁移为 `src/provider/deepseek/cmb.deepseek.adapter.ts`，并按增长情况继续拆 `detect`、`requestPatch`、`reasoningReplay`。
5. [x] 将 `src/openai.ts` 拆到 `src/provider/openaiCompatible/cmb.openaiCompatible.{content,capabilities,reasoning,token,billing}.ts`。
6. [x] 将 `src/chatHttpClient.ts`、`src/requestHeaders.ts`、`src/openaiModels.ts` 迁移到 `src/provider/openaiCompatible/`。
7. [x] 将 `src/config.ts`、`src/configKeys.ts`、`src/configManagement.ts` 迁移到 `src/provider/config/`。
8. [x] 将 `src/modelConfig.ts`、`src/modelMetadata.ts` 迁移到 `src/provider/model/`。
9. [x] 不再把消息转换、SSE、DeepSeek 或 OpenAI-compatible 协议工具回填到 Provider core。
10. [ ] 如果下一阶段继续压缩 `cmb.provider.chatProvider.ts`，只拆以下三个方向：

```
src/provider/core/
├── cmb.provider.models.ts     # buildModelList
├── cmb.provider.request.ts    # request body、tools、reasoning 参数组装
└── cmb.provider.routing.ts    # compound id 解析与 provider/model 查找
```

**定向测试：**
```bash
npm run compile
node --test ./out/test/cmb.openaiCompatible.messages.test.js ./out/test/cmb.openaiCompatible.stream.test.js ./out/test/cmb.deepseek.adapter.test.js
npm run lint
```

**验收：**
- `src/provider/core/cmb.provider.chatProvider.ts` ≤380 行；≤250 留到 Provider core 二阶段
- `src/provider/openaiCompatible/cmb.openaiCompatible.messages.ts` 与 `cmb.openaiCompatible.stream.ts` ≤150 行
- 其他 `src/provider/**/*.ts` ≤220 行，`index.ts` 除外
- 无 `src/provider/**` 反向 import 根目录旧出口
- 根目录不再存在 Provider 相关旧文件：`src/provider.ts`、`src/deepseek.ts`、`src/openai.ts`、`src/chatHttpClient.ts`、`src/requestHeaders.ts`、`src/openaiModels.ts`、`src/config.ts`、`src/configKeys.ts`、`src/configManagement.ts`、`src/modelConfig.ts`、`src/modelMetadata.ts`、`src/cmb-provider/`

## Phase 2：OpenAI-Compatible 协议工具细化

**目的：** 在 Phase 1 已经迁入 `provider/openaiCompatible/` 的基础上，继续按增长情况细化协议工具，明确它是 OpenAI-compatible 协议族工具，不是所有 provider 的父层。

**状态：** 已完成（2026-05-20）。`openai.test.ts` 已按协议工具职责拆分，`chatHttpClient` 与 `requestHeaders` 测试已同步改为 `cmb.openaiCompatible.*.test.ts`。

**目标结构：**

```
src/provider/openaiCompatible/
├── cmb.openaiCompatible.billing.ts
├── cmb.openaiCompatible.capabilities.ts
├── cmb.openaiCompatible.chatHttpClient.ts
├── cmb.openaiCompatible.content.ts
├── cmb.openaiCompatible.messages.ts
├── cmb.openaiCompatible.modelsCatalog.ts
├── cmb.openaiCompatible.reasoning.ts
├── cmb.openaiCompatible.requestHeaders.ts
├── cmb.openaiCompatible.stream.ts
├── cmb.openaiCompatible.token.ts
└── index.ts
```

**迁移步骤：**
1. [x] 先拆原 `src/test/openai.test.ts`：
   - [x] `src/test/cmb.openaiCompatible.content.test.ts`
   - [x] `src/test/cmb.openaiCompatible.capabilities.test.ts`
   - [x] `src/test/cmb.openaiCompatible.reasoning.test.ts`
   - [x] `src/test/cmb.openaiCompatible.token.test.ts`
   - [x] `src/test/cmb.openaiCompatible.billing.test.ts`
2. [x] 检查 Phase 1 形成的 `src/provider/openaiCompatible/` 子模块职责边界。
3. [x] 如果任一模块超过 220 行，再按职责继续拆分；否则本阶段只同步测试命名和覆盖。
4. [x] 确认不存在 `src/openai.ts`，不保留旧路径兼容出口。

**定向测试：**
```bash
npm run compile
node --test ./out/test/cmb.openaiCompatible.*.test.js
npm run lint
```

**验收：**
- [x] 每个 `src/provider/openaiCompatible/cmb.openaiCompatible.*.ts` ≤220 行
- [x] `src/test/cmb.openaiCompatible.*.test.ts` 单文件 ≤220 行
- [x] 原业务 import 不需要跨多个 openaiCompatible 子模块

## Phase 3：命令系统拆分

**状态：** 已完成（2026-05-20）。`src/commands/**` 与 `src/management/**` 已建立，旧根层 `commands.ts` / `managementCommands.ts` 已删除，命令入口与管理 helper 已同步切分。

**目的：** 拆开 `commands.ts` 和 `managementCommands.ts`，避免 wizard、picker、注册入口混在一起。

**目标结构：**

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

**迁移步骤：**
1. [x] 先给 `cmdManage` 的菜单项结构补轻量测试，锁定用户可见入口。
2. [x] 将 `registerCommands` 保持为唯一对外入口，`extension.ts` 改为从 `./commands` 聚合出口导入。
3. [x] 拆 `cmdAddProvider`、`cmdRemoveProvider`、`cmdAddModel` 到 wizard 模块。
4. [x] 拆 `managementCommands.ts` 的 picker/input helper 到 `cmb.management.ui.ts`。
5. [x] 最后拆 edit/import/list/validate 命令。

**定向测试：**
```bash
npm run compile
node --test ./out/test/configManagement.test.js ./out/test/config.test.js
npm run lint
```

如本阶段同步重命名测试，必须使用规范格式：
- `src/test/configManagement.test.ts` → `src/test/cmb.provider.configManagement.test.ts`
- `src/test/config.test.ts` → `src/test/cmb.provider.settings.test.ts`

**验收：**
- [x] 删除 `src/commands.ts`
- [x] 删除 `src/managementCommands.ts`
- [x] 每个命令模块 ≤220 行
- [x] `extension.ts` 注册行为不变

## Phase 4：Config Manager 后端拆分

**目的：** 把 Webview host、message handler、HTML 模板、状态 reducer 分层。

**目标结构：**

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

**状态：** 已完成（2026-05-20）。`src/configManager/**` 已建立，旧根层实现已删除，`extension.ts`、命令入口、HTML 资源与测试引用已同步到新结构。

**迁移步骤：**
1. [x] 将 `src/configManagerPanel.ts`、`src/configManagerHtml.ts`、`src/configManagerMessages.ts` 迁移到 `src/configManager/` 后删除旧文件。
2. [x] 先拆 HTML：`renderTopbar`、`renderWorkspace`、`renderProviderModal`、`renderModelModal`。
3. [x] 再拆 reducer：state 类型、action 类型、各 action reducer。
4. [x] 最后拆 panel message handler。

**定向测试：**
```bash
npm run compile
node --test ./out/test/configManagerHtml.test.js ./out/test/configManagerMessages.test.js
npm run lint
```

如本阶段同步重命名测试，必须使用规范格式：
- `src/test/configManagerHtml.test.ts` → `src/test/cmb.configManager.html.test.ts`
- `src/test/configManagerMessages.test.ts` → `src/test/cmb.configManager.messages.test.ts`

**验收：**
- [x] `extension.ts` / `commands` 从 `src/configManager/` 聚合出口导入配置管理器能力
- [x] 每个 `src/configManager/cmb.configManager.*.ts` ≤300 行；`html`、`messages`、`panel` 作为当前稳定例外，后续仅在业务继续增长时再拆。
- [x] Webview message 类型不出现重复定义

## Phase 5：Webview 前端 JS 拆分

**状态：** 已完成（2026-05-20）。`src/webview/configManager/**` 已按状态、DOM、渲染、弹窗、检查器拆分，旧顶层 `configManager.*.js` 已删除。

**目的：** 把浏览器端配置管理器按状态、DOM、渲染、对话框、检查器拆分，避免单文件继续膨胀。

**目标结构：**

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
└── cmb.configManager.inspectorFormat.js
```

**迁移步骤：**
1. 先不要改 UI 行为，只移动函数。
2. `configManager.core.js` 先拆出 state、dom、events。
3. `configManager.dialogs.js` 拆出 shared/provider/model。
4. `configManager.inspector.js` 拆出 export/preview/format。
5. 最后更新 `configManagerHtml.ts` 的 script 标签顺序，确保 shared 先于依赖模块加载。

**验证：**
```bash
npm run compile
npm run lint
```

同时人工检查生成 HTML 中 script 顺序：
- shared/state/dom 在前
- feature modules 在后
- bootstrap/core 最后

**验收：**
- 每个 webview JS ≤220 行
- 原用户操作路径不变：新增、编辑、删除、导入、保存、检查器预览
- 不引入打包器

## Phase 6：Webview CSS 拆分

**状态：** 已完成（2026-05-20）。`src/webview/styles/**` 已按 tokens、layout、buttons、forms、lists、dialogs 拆分，旧顶层 `configManager.*.css` 已删除。

**目的：** 让 CSS 按 tokens、layout、components、dialogs、inspector 分层，避免样式互相覆盖。

**目标结构：**

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

**迁移步骤：**
1. 先按选择器块移动，不改颜色、尺寸和值。
2. 更新 `configManagerHtml.ts` 的 stylesheet 引入顺序：tokens → layout → components → feature → utilities。
3. 若发现同选择器分散在多个文件，优先合并到 feature 文件，不创建覆盖链。

**验证：**
```bash
npm run compile
npm run lint
```

**验收：**
- 每个 CSS ≤220 行
- 样式引入顺序稳定
- 不新增无用途 class

## Phase 7：剩余小文件强制命名迁移

**状态：** 已完成（2026-05-20）。根层仅保留 `extension.ts` 与 `types.ts` 这两个计划内例外，其他实现文件已迁入业务目录。

**目的：** 对 Phase 1 未覆盖、且职责单一的小文件按业务域归类并做 `cmb.*` 命名迁移，迁移后删除旧文件。

**强制重命名：**

| 当前文件 | 目标文件 | 策略 |
|----------|----------|------|
| 已由 Phase 1 覆盖 | `src/provider/**/cmb.*` | 不重复迁移；本阶段只处理后续新增或遗漏的小文件 |

**特殊保留：**
- `src/extension.ts` 是 VS Code manifest 的 `main` 入口源文件，允许保留旧名。
- `src/types.ts` 是全局公共类型聚合，允许保留旧名，避免类型 import 大面积 churn。
- `src/vscode-dts/vscode.proposed.languageModelThinkingPart.d.ts` 是外部提案声明风格，允许保留旧名。

**验收：**
- [x] 所有剩余小文件完成 `cmb.*` 改名
- [x] 所有 import 更新后 `npm run compile` 成功
- [x] 旧源文件已删除，不保留 root-level 兼容出口
- [x] 不改业务行为
- [x] 若任一改名后文件超过 300 行，再单独规划拆分

## Phase 8：测试文件同步拆分

**状态：** 已完成（2026-05-20）。测试文件已按生产模块重命名并同步验证。

**目的：** 测试跟随生产模块分组，避免 `openai.test.ts` 这种综合测试继续变大。

**目标：**

| 当前测试 | 拆分目标 |
|----------|----------|
| `src/test/openai.test.ts` | `cmb.openaiCompatible.content.test.ts`、`cmb.openaiCompatible.capabilities.test.ts`、`cmb.openaiCompatible.reasoning.test.ts`、`cmb.openaiCompatible.token.test.ts`、`cmb.openaiCompatible.billing.test.ts` |
| `src/test/modelConfig.test.ts` | `cmb.provider.modelConfig.test.ts`；超过 250 行再继续拆 |
| `src/test/configManagerHtml.test.ts` | `cmb.configManager.html.test.ts` |
| `src/test/configManagerMessages.test.ts` | `cmb.configManager.messages.test.ts` |
| `src/test/configManagement.test.ts` | `cmb.provider.configManagement.test.ts` |
| `src/test/config.test.ts` | `cmb.provider.settings.test.ts` |

Provider 测试已在 Phase 0.5 完成命名迁移：
- `src/test/cmb.openaiCompatible.messages.test.ts`
- `src/test/cmb.openaiCompatible.stream.test.ts`

**公共测试工具：**

```
src/test/helpers/
├── cmb.test.vscodeMock.ts
├── cmb.test.webviewStateFactories.ts
└── cmb.test.streamFactories.ts
```

**验收：**
- [x] 测试 helper 不 import 生产私有实现
- [x] 每个测试文件 ≤250 行
- [x] 仍使用 Node 内置 `node:test`

## 推荐执行顺序

1. Phase 1：Provider 归类收尾，因为当前 `cmb-provider/` 和 Provider 相关根目录文件都是过渡结构。
2. Phase 2：OpenAI-Compatible 协议工具细化，因为测试覆盖最足，收益高。
3. Phase 3：命令系统拆分，因为 `commands.ts` 当前最大且职责混杂。
4. Phase 4：Config Manager 后端拆分，先稳住 Webview 宿主侧。
5. Phase 5：Webview JS 拆分，变更面较大，放在宿主侧稳定之后。
6. Phase 6：Webview CSS 拆分，最后处理视觉层，降低与 JS 拆分交叉风险。
7. Provider core 二阶段：继续把 `src/provider/core/cmb.provider.chatProvider.ts` 压到 ≤250，可穿插在任一阶段后执行。

**Provider core 二阶段状态：** 已完成（2026-05-20）。`cmb.provider.chatProvider.ts` 已压缩为薄壳，模型列表、请求组装、路由解析已拆到 `cmb.provider.models.ts`、`cmb.provider.request.ts`、`cmb.provider.routing.ts`。

## 全局验收清单

- [x] 所有生产 TS/JS 文件 ≤300 行；明确例外文件必须写入本计划
- [x] 单个函数复杂度目标 ≤10，嵌套 ≤3 层
- [x] `npm run compile` 成功
- [x] `npm run lint` 成功
- [x] 相关定向测试成功
- [x] 无新增循环依赖
- [x] `extension.ts`、公开 command id、配置 key 对外契约不破坏

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

说明：最终架构不保留旧 root-level 源文件。`src/extension.ts` 是唯一必须保持在根目录的 VS Code manifest 源入口，因为 `package.json` 的 `main` 指向编译产物 `./out/extension.js`。其他实现文件迁移完成后必须删除旧文件，并更新所有 import。
