/**
 * provider.ts
 *
 * Implements the VS Code LanguageModelChatProvider interface.
 */

import * as vscode from 'vscode';
import { getProviders } from '../config/cmb.provider.settings';
import { estimateChatMessageTokens, estimateStringTokens } from '../openaiCompatible';
import { toTokenEstimateParts } from '../openaiCompatible/cmb.openaiCompatible.messages';
import { buildModelList } from './cmb.provider.models';
import { resolveProvider } from './cmb.provider.routing';
import { sendChatRequest } from './cmb.provider.request';

export class OpenAICompatChatProvider implements vscode.LanguageModelChatProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  refreshModels(): void {
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const providers = getProviders();
    if (options.silent) {
      return buildModelList();
    }
    if (providers.length === 0) {
      vscode.window.showInformationMessage(
        'No OpenAI-compatible providers configured. Use "OpenAI-Compat: Add New Provider" to get started.',
        'Manage Providers'
      ).then(choice => {
        if (choice === 'Manage Providers') {
          vscode.commands.executeCommand('copilot-model-bridge.manage');
        }
      });
    }
    return buildModelList();
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const { provider, modelId } = resolveProvider(model.id);
    if (!provider) {
      throw new Error(
        `Provider not found for model "${model.id}". ` +
        `Please check your copilot-model-bridge.providers settings.`
      );
    }

    const selectedModel = provider.models.find(candidate => candidate.id === modelId);
    if (!selectedModel) {
      throw new Error(`Model "${modelId}" not found in provider "${provider.displayName}".`);
    }

    await sendChatRequest(provider, selectedModel, model, messages, options, progress, token);
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    if (typeof text === 'string') {
      return estimateStringTokens(text);
    }
    return estimateChatMessageTokens(toTokenEstimateParts(text.content));
  }
}
