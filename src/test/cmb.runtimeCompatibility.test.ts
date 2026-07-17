import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProposedApiLaunchCommand,
  tryRegisterLanguageModelProvider,
} from '../compat/cmb.runtimeCompatibility';

test('returns undefined when VS Code rejects the proposed provider API', () => {
  const result = tryRegisterLanguageModelProvider(() => {
    throw new Error(
      "Extension 'weisiren.cmb-copilot-model-bridge' CANNOT use API proposal: chatProvider. "
      + 'You MUST start in extension development mode or use the --enable-proposed-api command line flag.'
    );
  });

  assert.equal(result, undefined);
});

test('does not hide unrelated provider registration failures', () => {
  assert.throws(
    () => tryRegisterLanguageModelProvider(() => {
      throw new Error('Chat model provider uses UNKNOWN vendor');
    }),
    /UNKNOWN vendor/
  );
});

test('returns the registered disposable when the proposed API is available', () => {
  const disposable = { dispose() {} };

  assert.equal(tryRegisterLanguageModelProvider(() => disposable), disposable);
});

test('builds the documented one-launch workaround command', () => {
  assert.equal(
    buildProposedApiLaunchCommand(),
    'code --enable-proposed-api weisiren.cmb-copilot-model-bridge'
  );
});
