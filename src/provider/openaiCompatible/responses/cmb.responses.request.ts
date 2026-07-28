import { createHash } from 'node:crypto';
import { ReasoningLevel, ResponsesInputItem } from '../../../types';

const GPT_56_MODEL_ID_PATTERN = /(?:^|\/)gpt-5\.6(?:$|-)/i;

export interface ResponsesRequestOptions {
  modelId: string;
  input: ResponsesInputItem[];
  instructions?: string;
  maxOutputTokens: number;
  reasoningEffort?: ReasoningLevel;
  toolOptions: { tools?: unknown[]; tool_choice?: unknown };
}

export function buildResponsesRequestBody(options: ResponsesRequestOptions): Record<string, unknown> {
  const requestBody: Record<string, unknown> = {
    model: options.modelId,
    input: options.input,
    stream: true,
    store: false,
    max_output_tokens: options.maxOutputTokens,
  };
  const promptCacheKey = derivePromptCacheKey(options);

  if (options.instructions) {
    requestBody.instructions = options.instructions;
  }
  if (promptCacheKey) {
    requestBody.prompt_cache_key = promptCacheKey;
  }
  if (options.reasoningEffort === 'none') {
    requestBody.reasoning = { effort: 'none' };
  } else if (options.reasoningEffort) {
    requestBody.reasoning = { effort: options.reasoningEffort, summary: 'auto' };
  }

  Object.assign(requestBody, options.toolOptions);
  return requestBody;
}

function derivePromptCacheKey(options: ResponsesRequestOptions): string | undefined {
  if (!GPT_56_MODEL_ID_PATTERN.test(options.modelId.trim())) {
    return undefined;
  }
  const firstUserMessage = options.input.find(
    item => item.type === 'message' && item.role === 'user'
  );
  if (!firstUserMessage) {
    return undefined;
  }
  const stablePrefix = JSON.stringify({
    model: options.modelId.trim().toLowerCase(),
    instructions: options.instructions ?? '',
    tools: options.toolOptions.tools ?? [],
    firstUserMessage,
  });
  const digest = createHash('sha256').update(stablePrefix).digest('base64url');
  return `cmb_${digest}`;
}
