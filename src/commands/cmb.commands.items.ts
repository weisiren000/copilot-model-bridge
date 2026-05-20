import * as vscode from 'vscode';
import { EditToolName, ReasoningLevel } from '../types';

export const EDIT_TOOL_ITEMS: Array<vscode.QuickPickItem & { value: EditToolName }> = [
  { label: 'find-replace', description: 'Find and replace text in one document', value: 'find-replace' },
  { label: 'multi-find-replace', description: 'Find and replace multiple snippets across documents', value: 'multi-find-replace' },
  { label: 'apply-patch', description: 'Apply file-oriented patches', value: 'apply-patch' },
  { label: 'code-rewrite', description: 'Rewrite a snippet and return the replacement', value: 'code-rewrite' },
];

export const REASONING_LEVEL_ITEMS: Array<vscode.QuickPickItem & { value: ReasoningLevel }> = [
  { label: 'none', description: 'No extra reasoning effort', value: 'none' },
  { label: 'low', description: 'Faster, lower reasoning effort', value: 'low' },
  { label: 'medium', description: 'Balanced default', value: 'medium' },
  { label: 'high', description: 'Higher reasoning effort', value: 'high' },
  { label: 'xhigh', description: 'Very high reasoning effort', value: 'xhigh' },
  { label: 'max', description: 'Maximum reasoning effort', value: 'max' },
];
