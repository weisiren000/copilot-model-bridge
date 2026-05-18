/**
 * types.ts
 * 
 * Shared TypeScript types used across the extension.
 * These mirror the structure stored in VS Code settings under
 * "copilot-model-bridge.providers".
 */

/** Represents a single model entry within a provider */
export type ReasoningLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type EditToolName = 'find-replace' | 'multi-find-replace' | 'apply-patch' | 'code-rewrite';
export type ToolChoiceMode = 'auto' | 'required' | 'none' | 'omit';

export interface ModelCategoryConfig {
  label: string;
  order?: number;
}

export interface ModelConfig {
  /** The model ID string as the API expects it (e.g. "nvidia/llama-3.1-nemotron-ultra-253b-v1") */
  id: string;
  /** Human-readable display name shown in the Copilot model picker */
  name: string;
  /** Maximum number of tokens the model can accept as input context */
  maxInputTokens: number;
  /** Maximum number of tokens the model can output */
  maxOutputTokens: number;
  /** Whether the model supports tool/function calling */
  supportsToolCalling: boolean;
  /** Whether the model supports image/vision inputs */
  supportsVision?: boolean;
  /** Whether the model supports video attachments */
  supportsVideo?: boolean;
  /** Whether the model supports non-image file attachments */
  supportsFileInput?: boolean;
  /** Whether the model should hint preferred edit tools to Copilot Agent */
  supportsEditTools?: boolean;
  /** Preferred edit tools for file modifications in Agent mode */
  preferredEditTools?: EditToolName[];
  /** OpenAI-compatible tool_choice strategy for VS Code tool modes */
  toolChoiceMode?: ToolChoiceMode;
  /** Whether the model exposes configurable reasoning effort */
  supportsReasoning?: boolean;
  /** Reasoning effort values this model accepts */
  supportedReasoningLevels?: ReasoningLevel[];
  /** Default reasoning effort when request does not explicitly set one */
  defaultReasoningLevel?: ReasoningLevel;
  /** Human-readable request cost multiplier shown in VS Code model UI */
  multiplier?: string;
  /** Numeric request cost multiplier used by VS Code for cost comparisons */
  multiplierNumeric?: number;
  /** Opaque model family shown to VS Code selectors and management UI */
  family?: string;
  /** Opaque model version shown to VS Code selectors */
  version?: string;
  /** Optional category label used by newer VS Code model management surfaces */
  categoryLabel?: string;
  /** Optional category sort order used by newer VS Code model management surfaces */
  categoryOrder?: number;
  /** Optional safe VS Code ThemeIcon id for status display */
  statusIcon?: string;
}

/** Represents a fully configured OpenAI-compatible provider entry */
export interface ProviderConfig {
  /** Unique slug identifier, no spaces (e.g. "nvidia-nim") */
  id: string;
  /** Human-readable provider name (e.g. "NVIDIA NIM") */
  displayName: string;
  /** Base URL of the OpenAI-compatible API endpoint (e.g. https://integrate.api.nvidia.com/v1) */
  baseUrl: string;
  /** API key for authentication; empty string if not needed */
  apiKey: string;
  /** List of models registered for this provider */
  models: ModelConfig[];
}

/** The structure of one SSE data chunk from an OpenAI streaming API */
export interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
           name?: string;
           arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}
