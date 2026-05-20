import { EditToolName, ModelConfig, ToolChoiceMode } from '../../types';

const EDIT_TOOLS: readonly EditToolName[] = [
  'find-replace',
  'multi-find-replace',
  'apply-patch',
  'code-rewrite',
];
const DEFAULT_EDIT_TOOLS: readonly EditToolName[] = [
  'find-replace',
  'multi-find-replace',
  'apply-patch',
];

export interface ModelCapabilities {
  toolCalling: boolean;
  imageInput: boolean;
  editTools?: EditToolName[];
}

export type RequestedToolMode = 'auto' | 'required' | 'none';

export interface ResolveToolChoiceOptions {
  hasTools: boolean;
  requestedToolMode?: RequestedToolMode;
  toolChoiceMode?: ToolChoiceMode;
}

export function buildModelCapabilities(
  model: Partial<Pick<ModelConfig, 'supportsToolCalling' | 'supportsVision' | 'supportsEditTools' | 'preferredEditTools'>>
): ModelCapabilities {
  const supportsToolCalling = model.supportsToolCalling ?? true;
  const capabilities: ModelCapabilities = {
    toolCalling: supportsToolCalling,
    imageInput: model.supportsVision ?? false,
  };

  const supportsEditTools = model.supportsEditTools ?? supportsToolCalling;
  if (!supportsToolCalling || !supportsEditTools) {
    return capabilities;
  }

  const editTools = normalizeEditTools(model.preferredEditTools ?? DEFAULT_EDIT_TOOLS);
  if (editTools.length > 0) {
    capabilities.editTools = editTools;
  }
  return capabilities;
}

export function resolveToolChoice(options: ResolveToolChoiceOptions): 'auto' | 'required' | 'none' | undefined {
  if (!options.hasTools) {
    return undefined;
  }

  const strategy = options.toolChoiceMode ?? 'required';
  if (strategy === 'omit') {
    return undefined;
  }
  if (strategy === 'none') {
    return 'none';
  }

  const requestedMode = options.requestedToolMode ?? 'auto';
  if (requestedMode === 'none') {
    return 'none';
  }

  if (requestedMode === 'auto') {
    return 'auto';
  }

  return strategy;
}

export function normalizeEditTools(tools: readonly unknown[] | undefined): EditToolName[] {
  return (tools ?? [])
    .filter(isEditToolName)
    .filter((tool, index, values) => values.indexOf(tool) === index);
}

function isEditToolName(value: unknown): value is EditToolName {
  return typeof value === 'string' && EDIT_TOOLS.includes(value as EditToolName);
}
