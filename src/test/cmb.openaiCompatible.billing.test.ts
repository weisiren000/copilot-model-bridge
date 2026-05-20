import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModelBillingMetadata,
} from '../provider/openaiCompatible/cmb.openaiCompatible.billing';

test('uses 0x default billing multiplier for BYOK models', () => {
  assert.deepEqual(buildModelBillingMetadata({}), {
    multiplier: '0x',
    multiplierNumeric: 0,
  });
});

test('derives numeric billing multiplier from x suffix labels', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: '1x' }), {
    multiplier: '1x',
    multiplierNumeric: 1,
  });

  assert.deepEqual(buildModelBillingMetadata({ multiplier: '0.5x' }), {
    multiplier: '0.5x',
    multiplierNumeric: 0.5,
  });
});

test('keeps non-numeric billing multiplier labels without numeric value', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: 'High' }), {
    multiplier: 'High',
  });
});

test('prefers explicit billing multiplier numeric value', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: '2x', multiplierNumeric: 3 }), {
    multiplier: '2x',
    multiplierNumeric: 3,
  });
});

test('ignores invalid billing multiplier numeric values', () => {
  assert.deepEqual(buildModelBillingMetadata({ multiplier: 'High', multiplierNumeric: -1 }), {
    multiplier: 'High',
  });

  assert.deepEqual(buildModelBillingMetadata({ multiplier: 'High', multiplierNumeric: Number.NaN }), {
    multiplier: 'High',
  });
});
