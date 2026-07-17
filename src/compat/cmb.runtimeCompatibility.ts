const EXTENSION_ID = 'weisiren.cmb-copilot-model-bridge';

export interface DisposableLike {
  dispose(): void;
}

export function tryRegisterLanguageModelProvider<T extends DisposableLike>(
  register: () => T
): T | undefined {
  try {
    return register();
  } catch (error) {
    if (isProposedApiAccessError(error)) {
      return undefined;
    }
    throw error;
  }
}

export function buildProposedApiLaunchCommand(binary = 'code'): string {
  return `${binary} --enable-proposed-api ${EXTENSION_ID}`;
}

function isProposedApiAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot use (?:these )?api proposals?/i.test(message)
    && /(?:chatProvider|--enable-proposed-api)/i.test(message);
}
