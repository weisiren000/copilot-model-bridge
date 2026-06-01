import { ToolChoiceMode } from '../../types';

export type AnthropicRequestedToolMode = 'auto' | 'required' | 'none';

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: unknown;
}

export type AnthropicToolChoice =
  | { type: 'auto'; disable_parallel_tool_use?: boolean }
  | { type: 'any'; disable_parallel_tool_use?: boolean }
  | { type: 'tool'; name: string; disable_parallel_tool_use?: boolean }
  | { type: 'none' };

export interface BuildAnthropicToolOptionsInput {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  requestedToolMode?: AnthropicRequestedToolMode;
  toolChoiceMode?: ToolChoiceMode;
  specificToolName?: string;
  disableParallelToolUse?: boolean;
}

export function buildAnthropicToolOptions(
  options: BuildAnthropicToolOptionsInput
): { tools?: AnthropicToolDefinition[]; tool_choice?: AnthropicToolChoice } {
  if (!options.tools || options.tools.length === 0) {
    return {};
  }

  const result: { tools?: AnthropicToolDefinition[]; tool_choice?: AnthropicToolChoice } = {
    tools: options.tools.map(toAnthropicToolDefinition),
  };
  const toolChoice = resolveAnthropicToolChoice(
    options.requestedToolMode ?? 'auto',
    options.toolChoiceMode,
    options.specificToolName,
    options.disableParallelToolUse
  );
  if (toolChoice) {
    result.tool_choice = toolChoice;
  }
  return result;
}

function toAnthropicToolDefinition(
  tool: NonNullable<BuildAnthropicToolOptionsInput['tools']>[number]
): AnthropicToolDefinition {
  const definition: AnthropicToolDefinition = {
    name: tool.name,
    input_schema: normalizeInputSchema(tool.name, tool.inputSchema),
  };
  if (tool.description) {
    definition.description = tool.description;
  }
  return definition;
}

function resolveAnthropicToolChoice(
  requestedToolMode: AnthropicRequestedToolMode,
  toolChoiceMode: ToolChoiceMode | undefined,
  specificToolName: string | undefined,
  disableParallelToolUse: boolean | undefined
): AnthropicToolChoice | undefined {
  const strategy = toolChoiceMode ?? 'required';
  if (strategy === 'omit') {
    return undefined;
  }
  if (strategy === 'none' || requestedToolMode === 'none') {
    return { type: 'none' };
  }
  if (specificToolName && requestedToolMode === 'required') {
    return withParallelToolUseOption(
      { type: 'tool', name: specificToolName },
      disableParallelToolUse
    );
  }
  if (requestedToolMode === 'auto' || strategy === 'auto') {
    return withParallelToolUseOption({ type: 'auto' }, disableParallelToolUse);
  }
  if (requestedToolMode === 'required' && strategy === 'required') {
    return withParallelToolUseOption({ type: 'any' }, disableParallelToolUse);
  }
  return withParallelToolUseOption({ type: 'auto' }, disableParallelToolUse);
}

function normalizeInputSchema(toolName: string, schema: unknown): Record<string, unknown> {
  if (schema === undefined) {
    return { type: 'object', properties: {} };
  }
  if (!isRecord(schema)) {
    throw new Error(`Anthropic tool "${toolName}" input_schema must be an object JSON Schema.`);
  }
  if (schema.type !== undefined && schema.type !== 'object') {
    throw new Error(`Anthropic tool "${toolName}" input_schema root type must be object.`);
  }
  return {
    ...schema,
    type: 'object',
    properties: isRecord(schema.properties) ? schema.properties : {},
  };
}

function withParallelToolUseOption<T extends Exclude<AnthropicToolChoice, { type: 'none' }>>(
  toolChoice: T,
  disableParallelToolUse: boolean | undefined
): T {
  return disableParallelToolUse
    ? { ...toolChoice, disable_parallel_tool_use: true }
    : toolChoice;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
