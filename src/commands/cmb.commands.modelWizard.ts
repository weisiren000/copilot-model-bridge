import * as vscode from 'vscode';
import { addModel, getProviders } from '../provider/config/cmb.provider.settings';
import { EditToolName, ModelConfig, ReasoningLevel } from '../types';
import { EDIT_TOOL_ITEMS, REASONING_LEVEL_ITEMS } from './cmb.commands.items';

/** Wizard: add a model to an existing provider.
 *  @param preselectedProviderId – If provided, skip the provider picker.
 */
export async function cmdAddModel(preselectedProviderId?: string): Promise<void> {
  let providerId = preselectedProviderId;

  if (!providerId) {
    const providers = getProviders();
    if (providers.length === 0) {
      vscode.window.showInformationMessage('Add a provider first using "Add Provider".');
      return;
    }

    const chosen = await vscode.window.showQuickPick(
      providers.map(p => ({
        label: p.displayName,
        description: p.baseUrl,
        id: p.id,
      })),
      { ignoreFocusOut: true, placeHolder: 'Select a provider to add a model to' }
    );
    if (!chosen) { return; }
    providerId = chosen.id;
  }

  const providerLabel = getProviders().find(p => p.id === providerId)?.displayName ?? providerId;

  const modelId = await vscode.window.showInputBox({
    title: `Add Model to "${providerLabel}" (1/11) – Model ID`,
    ignoreFocusOut: true,
    prompt: 'The model identifier as the API expects it',
    placeHolder: 'e.g. nvidia/llama-3.1-nemotron-ultra-253b-v1',
    validateInput: v => v.trim() ? undefined : 'Model ID cannot be empty',
  });
  if (!modelId) { return; }

  const modelName = await vscode.window.showInputBox({
    title: `Add Model to "${providerLabel}" (2/11) – Display Name`,
    ignoreFocusOut: true,
    prompt: 'Human-readable name shown in the Copilot model picker',
    placeHolder: 'e.g. Llama 3.1 Nemotron Ultra 253B',
    validateInput: v => v.trim() ? undefined : 'Display name cannot be empty',
  });
  if (!modelName) { return; }

  const maxOutputStr = await vscode.window.showInputBox({
    title: `Add Model to "${providerLabel}" (3/11) – Max Output Tokens`,
    ignoreFocusOut: true,
    prompt: 'Maximum tokens the model can produce in one response',
    value: '4096',
    validateInput: validatePositiveIntegerInput,
  });
  if (!maxOutputStr) { return; }

  const maxOutputTokens = parseInt(maxOutputStr, 10);
  const maxInputStr = await vscode.window.showInputBox({
    title: `Add Model to "${providerLabel}" (4/11) – Max Input Tokens`,
    ignoreFocusOut: true,
    prompt: 'Maximum tokens the model can accept as input',
    value: '128000',
    validateInput: validatePositiveIntegerInput,
  });
  if (!maxInputStr) { return; }

  const toolChoice = await vscode.window.showQuickPick(
    [
      { label: '$(check) Yes – model supports tool/function calling', value: true },
      { label: '$(close) No – text only', value: false },
    ],
    { ignoreFocusOut: true, placeHolder: 'Does this model support tool calling? (5/11)' }
  );
  if (!toolChoice) { return; }

  let supportsEditTools = toolChoice.value;
  let preferredEditTools: EditToolName[] | undefined;
  if (toolChoice.value) {
    const editToolsChoice = await vscode.window.showQuickPick(
      [
        { label: '$(tools) Yes – use default edit tools', value: 'default' },
        { label: '$(checklist) Yes – choose edit tools', value: 'custom' },
        { label: '$(circle-slash) No – no edit tool hints', value: 'disabled' },
      ],
      { ignoreFocusOut: true, placeHolder: 'Should Agent mode receive edit tool hints? (6/11)' }
    );
    if (!editToolsChoice) { return; }

    supportsEditTools = editToolsChoice.value !== 'disabled';
    if (editToolsChoice.value === 'custom') {
      const selectedEditTools = await vscode.window.showQuickPick(
        EDIT_TOOL_ITEMS,
        {
          canPickMany: true,
          ignoreFocusOut: true,
          placeHolder: 'Select edit tools this model should prefer',
        }
      );
      if (!selectedEditTools || selectedEditTools.length === 0) { return; }
      preferredEditTools = selectedEditTools.map(item => item.value);
    }
  } else {
    const editToolsChoice = await vscode.window.showQuickPick(
      [
        { label: '$(circle-slash) No – tool calling is disabled, so edit tool hints will not be declared', value: false },
      ],
      { ignoreFocusOut: true, placeHolder: 'Should Agent mode receive edit tool hints? (6/11)' }
    );
    if (!editToolsChoice) { return; }
    supportsEditTools = editToolsChoice.value;
  }

  const visionChoice = await vscode.window.showQuickPick(
    [
      { label: '$(device-camera) Yes – model supports vision/image input', value: true },
      { label: '$(circle-slash) No – no image input support', value: false },
    ],
    { ignoreFocusOut: true, placeHolder: 'Does this model support image/vision input? (7/11)' }
  );
  if (!visionChoice) { return; }

  const videoChoice = await vscode.window.showQuickPick(
    [
      { label: '$(device-camera-video) Yes – declare video attachment support', value: true },
      { label: '$(circle-slash) No – reject video attachments clearly', value: false },
    ],
    { ignoreFocusOut: true, placeHolder: 'Does this model support video attachments? (8/11)' }
  );
  if (!videoChoice) { return; }

  const fileInputChoice = await vscode.window.showQuickPick(
    [
      { label: '$(files) Yes – declare generic file attachment support', value: true },
      { label: '$(circle-slash) No – reject unknown file attachments clearly', value: false },
    ],
    { ignoreFocusOut: true, placeHolder: 'Does this model support generic file attachments? (9/11)' }
  );
  if (!fileInputChoice) { return; }

  const multiplier = await vscode.window.showInputBox({
    title: `Add Model to "${providerLabel}" (10/11) – Cost Multiplier`,
    ignoreFocusOut: true,
    prompt: 'Request cost multiplier label shown in VS Code model UI',
    value: '0x',
    placeHolder: '0x, 1x, 0.5x, High',
    validateInput: v => v.trim() ? undefined : 'Multiplier cannot be empty',
  });
  if (!multiplier) { return; }

  const reasoningSupportChoice = await vscode.window.showQuickPick(
    [
      { label: '$(lightbulb) Yes – show Thinking Effort', value: true },
      { label: '$(circle-slash) No – hide Thinking Effort', value: false },
    ],
    { ignoreFocusOut: true, placeHolder: 'Does this model support configurable reasoning effort? (11/11)' }
  );
  if (!reasoningSupportChoice) { return; }

  let supportedReasoningLevels: ReasoningLevel[] | undefined;
  let defaultReasoningLevel: ReasoningLevel | undefined;
  if (reasoningSupportChoice.value) {
    const selectedLevels = await vscode.window.showQuickPick(
      REASONING_LEVEL_ITEMS,
      {
        canPickMany: true,
        ignoreFocusOut: true,
        placeHolder: 'Select reasoning effort levels this model supports',
      }
    );
    if (!selectedLevels || selectedLevels.length === 0) { return; }
    supportedReasoningLevels = selectedLevels.map(item => item.value);

    const defaultChoices = REASONING_LEVEL_ITEMS.filter(item => supportedReasoningLevels?.includes(item.value));
    const reasoningChoice = await vscode.window.showQuickPick(
      defaultChoices,
      { ignoreFocusOut: true, placeHolder: 'Default reasoning level when not specified by request' }
    );
    if (!reasoningChoice) { return; }
    defaultReasoningLevel = reasoningChoice.value;
  }

  const model: ModelConfig = {
    id: modelId.trim(),
    name: modelName.trim(),
    maxInputTokens: parseInt(maxInputStr, 10),
    maxOutputTokens,
    supportsToolCalling: toolChoice.value,
    supportsVision: visionChoice.value,
    supportsVideo: videoChoice.value,
    supportsFileInput: fileInputChoice.value,
    supportsEditTools,
    supportsReasoning: reasoningSupportChoice.value,
    multiplier: multiplier.trim(),
  };
  if (preferredEditTools) {
    model.preferredEditTools = preferredEditTools;
  }
  if (reasoningSupportChoice.value) {
    model.supportedReasoningLevels = supportedReasoningLevels;
    model.defaultReasoningLevel = defaultReasoningLevel;
  }

  try {
    await addModel(providerId, model);
    vscode.window.showInformationMessage(
      `✅ Model "${modelName}" added to "${providerLabel}". ` +
      `Reload the window or re-open Copilot Chat to see it in the model picker.`
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to add model: ${(err as Error).message}`);
  }
}

function validatePositiveIntegerInput(value: string): string | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? undefined : 'Must be a positive integer';
}
