import { ReasoningLevel, ResponsesInputItem } from '../../../types';

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

  if (options.instructions) {
    requestBody.instructions = options.instructions;
  }
  if (options.reasoningEffort === 'none') {
    requestBody.reasoning = { effort: 'none' };
  } else if (options.reasoningEffort) {
    requestBody.reasoning = { effort: options.reasoningEffort, summary: 'auto' };
  }

  Object.assign(requestBody, options.toolOptions);
  return requestBody;
}
