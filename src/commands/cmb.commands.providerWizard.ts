import * as vscode from 'vscode';
import { addModel, addProvider, getProviders } from '../provider/config/cmb.provider.settings';
import { EditToolName, ModelConfig, ReasoningLevel } from '../types';
import { cmdAddModel } from './cmb.commands.modelWizard';
import { EDIT_TOOL_ITEMS, REASONING_LEVEL_ITEMS } from './cmb.commands.items';

/** Wizard: collect provider details and save */
export async function cmdAddProvider(): Promise<void> {
  const displayName = await vscode.window.showInputBox({
    title: 'Add Provider (1/4) – Display Name',
    ignoreFocusOut: true,
    prompt: 'Enter a human-readable name for this provider',
    placeHolder: 'e.g. NVIDIA NIM',
    validateInput: v => v.trim() ? undefined : 'Display name cannot be empty',
  });
  if (!displayName) { return; }

  const suggestedId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = await vscode.window.showInputBox({
    title: 'Add Provider (2/4) – Provider ID',
    ignoreFocusOut: true,
    prompt: 'Unique identifier (no spaces). Used internally to route LM requests.',
    value: suggestedId,
    validateInput: v => {
      if (!v.trim()) { return 'ID cannot be empty'; }
      if (/\s/.test(v)) { return 'ID must not contain spaces'; }
      if (getProviders().some(p => p.id === v)) { return `Provider "${v}" already exists`; }
      return undefined;
    },
  });
  if (!id) { return; }

  const baseUrl = await vscode.window.showInputBox({
    title: 'Add Provider (3/4) – Base URL',
    ignoreFocusOut: true,
    prompt: 'OpenAI-compatible API base URL (without trailing slash)',
    placeHolder: 'https://integrate.api.nvidia.com/v1',
    validateInput: v => {
      if (!v.trim()) { return 'Base URL cannot be empty'; }
      try { new URL(v); return undefined; }
      catch { return 'Enter a valid URL'; }
    },
  });
  if (!baseUrl) { return; }

  const apiKey = await vscode.window.showInputBox({
    title: 'Add Provider (4/4) – API Key',
    ignoreFocusOut: true,
    prompt: 'API key / bearer token (leave empty if not required)',
    password: true,
    placeHolder: 'nvapi-xxxx…  or leave empty',
  });
  const resolvedKey = apiKey ?? '';

  try {
    await addProvider(id, displayName, baseUrl, resolvedKey);
    const action = await vscode.window.showInformationMessage(
      `✅ Provider "${displayName}" added. Would you like to add a model now?`,
      'Add Model', 'Later'
    );
    if (action === 'Add Model') {
      await cmdAddModel(id);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to add provider: ${(err as Error).message}`);
  }
}
