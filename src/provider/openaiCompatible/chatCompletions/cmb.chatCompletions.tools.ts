import * as vscode from 'vscode';
import { ToolChoiceMode } from '../../../types';
import { resolveToolChoice } from '..';

export function buildChatToolOptions(
  options: vscode.ProvideLanguageModelChatResponseOptions,
  toolChoiceMode: ToolChoiceMode | undefined
): { tools?: unknown[]; tool_choice?: unknown } {
  if (!options.tools || options.tools.length === 0) {
    return {};
  }

  const result: { tools?: unknown[]; tool_choice?: unknown } = {
    tools: options.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema ?? {
          type: 'object',
          properties: {},
        },
      },
    })),
  };

  const toolChoice = resolveToolChoice({
    hasTools: true,
    requestedToolMode: options.toolMode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto',
    toolChoiceMode,
  });

  if (toolChoice !== undefined) {
    result.tool_choice = toolChoice;
  }

  return result;
}
