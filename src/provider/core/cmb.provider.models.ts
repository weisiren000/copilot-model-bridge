import * as vscode from 'vscode';
import { getProviders } from '../config/cmb.provider.settings';
import {
  buildModelCapabilities,
  buildModelReasoningConfigurationSchema,
} from '../openaiCompatible';
import { buildModelMetadata } from '../model/cmb.provider.modelMetadata';

const ID_SEP = '::';

export function buildModelList(): vscode.LanguageModelChatInformation[] {
  const result: vscode.LanguageModelChatInformation[] = [];
  for (const provider of getProviders()) {
    for (const model of provider.models) {
      const modelMetadata = buildModelMetadata({
        compoundId: `${provider.id}${ID_SEP}${model.id}`,
        provider,
        model,
      });
      const metadata = {
        id: modelMetadata.id,
        name: modelMetadata.name,
        family: modelMetadata.family,
        version: modelMetadata.version,
        maxInputTokens: modelMetadata.maxInputTokens,
        maxOutputTokens: modelMetadata.maxOutputTokens,
        detail: modelMetadata.detail,
        tooltip: modelMetadata.tooltip,
        capabilities: buildModelCapabilities(model),
        isUserSelectable: true,
      } as vscode.LanguageModelChatInformation & {
        configurationSchema?: Record<string, unknown>;
        isUserSelectable: true;
      };
      const configurationSchema = buildModelReasoningConfigurationSchema(model);
      if (configurationSchema) {
        metadata.configurationSchema = configurationSchema;
      }
      result.push(metadata);
    }
  }
  return result;
}
