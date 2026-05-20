import * as vscode from 'vscode';
import { getProviders } from '../config/cmb.provider.settings';
import {
  buildModelBillingMetadata,
  buildModelCapabilities,
  buildModelReasoningConfigurationSchema,
} from '../openaiCompatible';
import { buildModelMetadata } from '../model/cmb.provider.modelMetadata';

const ID_SEP = '::';

export function buildModelList(): vscode.LanguageModelChatInformation[] {
  const result: vscode.LanguageModelChatInformation[] = [];
  for (const provider of getProviders()) {
    for (const model of provider.models) {
      const billingMetadata = buildModelBillingMetadata(model);
      const metadata = {
        ...buildModelMetadata({
          compoundId: `${provider.id}${ID_SEP}${model.id}`,
          provider,
          model,
        }),
        multiplier: billingMetadata.multiplier,
        capabilities: buildModelCapabilities(model),
        isUserSelectable: true,
      } as vscode.LanguageModelChatInformation & {
        isUserSelectable: true;
        configurationSchema?: Record<string, unknown>;
        multiplier?: string;
        multiplierNumeric?: number;
      };

      if (billingMetadata.multiplierNumeric !== undefined) {
        metadata.multiplierNumeric = billingMetadata.multiplierNumeric;
      }

      const configurationSchema = buildModelReasoningConfigurationSchema(model);
      if (configurationSchema) {
        metadata.configurationSchema = configurationSchema;
      }

      result.push(metadata);
    }
  }
  return result;
}
