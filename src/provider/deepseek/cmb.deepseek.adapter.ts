/**
 * deepseek.ts
 *
 * DeepSeek 专用适配，处理 DeepSeek API 与通用 OpenAI 兼容协议
 * 在 thinking mode、reasoning_effort 与 tool calling 上的差异。
 *
 * 参考：https://api-docs.deepseek.com/guides/thinking_mode
 *
 * 已实现：
 *   1. 通过 baseUrl 主机名识别 DeepSeek 端点
 *   2. 通过模型 id 识别明显属于 DeepSeek 的模型（deepseek-* / *-reasoner）
 *   3. 启用 thinking 时按 DeepSeek 协议发送 `thinking: { type: 'enabled' }`
 *      与受限的 reasoning_effort（high / max）
 *   4. SSE 流中捕获 reasoning_content 并以专用 MIME 类型的 DataPart
 *      回报给 VS Code，让多轮对话历史中保留思考链
 *   5. 历史里的 assistant 消息透传 reasoning_content；缺失时补空字符串，
 *      满足 DeepSeek thinking 模式对 reasoning_content 字段的强制要求
 */

import { ProviderConfig, ReasoningLevel } from '../../types';

/** DeepSeek 在 thinking mode 下唯一接受的两个 reasoning_effort 取值 */
const DEEPSEEK_VALID_EFFORTS = ['high', 'max'] as const;
type DeepSeekEffort = typeof DEEPSEEK_VALID_EFFORTS[number];

/** 把通用 ReasoningLevel 映射到 DeepSeek 接受的取值 */
const DEEPSEEK_EFFORT_MAP: Record<ReasoningLevel, DeepSeekEffort> = {
  none: 'high',
  low: 'high',
  medium: 'high',
  high: 'high',
  xhigh: 'max',
  max: 'max',
};

/**
 * reasoning_content 通过 DataPart 在多轮 history 里穿越 Copilot 时使用的
 * MIME 类型。Copilot Chat 会原样保留消息内容回传给 provider，扩展端在请求
 * 转换阶段从该 DataPart 中提取 reasoning_content 注入回 DeepSeek 请求。
 */
export const DEEPSEEK_REASONING_MIME = 'application/x-deepseek-reasoning';

/** 通过 baseUrl 主机名判断是否为 DeepSeek 官方端点 */
export function isDeepSeekBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    const hostname = url.hostname.toLowerCase();
    return hostname === 'api.deepseek.com' || hostname.endsWith('.deepseek.com');
  } catch {
    return false;
  }
}

/** 通过模型 id 判断是否为 DeepSeek 模型 */
export function isDeepSeekModelId(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return normalized.startsWith('deepseek')
    || normalized.includes('/deepseek')
    || normalized.endsWith('-reasoner');
}

/** Provider + 模型综合判断 */
export function isDeepSeekRequest(
  provider: Pick<ProviderConfig, 'baseUrl'>,
  modelId: string
): boolean {
  return isDeepSeekBaseUrl(provider.baseUrl) || isDeepSeekModelId(modelId);
}

export interface DeepSeekRequestContext {
  /** 模型本身是否声明支持 reasoning */
  supportsReasoning: boolean;
  /** 该次请求是否带 tools */
  hasTools: boolean;
  /** 由通用解析器算出的 ReasoningLevel */
  reasoningLevel?: ReasoningLevel;
}

export interface DeepSeekRequestPatch {
  /** thinking 顶层字段，启用时会被附加到 request body */
  thinking: { type: 'enabled' | 'disabled' };
  /** 受限后的 reasoning_effort 取值；未设置表示移除该字段 */
  reasoning_effort?: DeepSeekEffort;
}

/**
 * 计算 DeepSeek 请求 body 需要补丁的字段。
 *
 * 之前的实现会在 hasTools 时强制禁用 thinking 以规避 reasoning_content
 * replay 缺失导致的 400。现在 replay 逻辑已实现（见
 * `applyReasoningContentReplay`），thinking 可与 tools 共存。
 */
export function buildDeepSeekRequestPatch(
  context: DeepSeekRequestContext
): DeepSeekRequestPatch {
  if (!context.supportsReasoning) {
    return { thinking: { type: 'disabled' } };
  }

  return {
    thinking: { type: 'enabled' },
    reasoning_effort: mapToDeepSeekEffort(context.reasoningLevel),
  };
}

/**
 * 把通用 ReasoningLevel 映射到 DeepSeek 合法的 reasoning_effort 值。
 * 找不到映射时回退到 'high'（DeepSeek 默认推荐）。
 */
export function mapToDeepSeekEffort(level: ReasoningLevel | undefined): DeepSeekEffort {
  if (!level) return 'high';
  return DEEPSEEK_EFFORT_MAP[level] ?? 'high';
}

/**
 * 把 DataPart 中编码的 reasoning_content 还原为字符串。
 *
 * @param data 由扩展之前响应中通过 DataPart 透传出去、又被 Copilot 历史
 *             原样回传的二进制数据
 * @param mimeType MIME 类型，匹配 DEEPSEEK_REASONING_MIME 时才解码
 * @returns 解码后的 reasoning 文本；如果不是 reasoning 数据则返回 undefined
 */
export function decodeReasoningDataPart(
  data: Uint8Array,
  mimeType: string | undefined
): string | undefined {
  if (!mimeType || mimeType.toLowerCase() !== DEEPSEEK_REASONING_MIME) {
    return undefined;
  }
  try {
    return new TextDecoder().decode(data);
  } catch {
    return undefined;
  }
}

/**
 * 给已转换为 OpenAI 格式的 messages 数组注入 DeepSeek 要求的
 * reasoning_content 字段。
 *
 * DeepSeek thinking 模式下的契约：
 *   - 若 thinking 启用，所有 assistant 消息必须包含 `reasoning_content`，
 *     即使为空字符串
 *   - 若上一轮 assistant 输出了思考链（例如带 tool_calls 的中间步骤），
 *     必须在后续请求里原样回放，否则返回 400
 *
 * 这里把每条 assistant 消息上预先附着的 `__reasoningContent` 字段（由
 * `convertMessages` 阶段设置）提升为正式的 `reasoning_content`，缺失则
 * 补空字符串。
 *
 * @param messages 已经按 OpenAI 协议组装好的 messages 数组
 * @param thinkingEnabled 当前请求是否启用了 thinking
 */
export function applyReasoningContentReplay(
  messages: Array<Record<string, unknown>>,
  thinkingEnabled: boolean
): void {
  if (!thinkingEnabled) {
    for (const msg of messages) {
      delete msg.__reasoningContent;
      delete msg.reasoning_content;
    }
    return;
  }

  for (const msg of messages) {
    if (msg.role !== 'assistant') {
      delete msg.__reasoningContent;
      continue;
    }

    const stashed = msg.__reasoningContent;
    msg.reasoning_content = typeof stashed === 'string' ? stashed : '';
    delete msg.__reasoningContent;
  }
}
