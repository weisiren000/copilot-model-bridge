import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../../package.json';
import { PRODUCT_NAME, USER_AGENT, VERSION } from '../provider/cmb.branding';

test('exposes product name and version from package.json', () => {
  assert.equal(PRODUCT_NAME, 'Copilot Model Bridge');
  assert.equal(VERSION, pkg.version);
  assert.equal(USER_AGENT, `${PRODUCT_NAME}/${VERSION}`);
});

test('User-Agent follows RFC 7231 product/version format', () => {
  // RFC 7231: User-Agent = <product> / <version>
  // 拆分后再分别校验两端，避免在 product 中包含空格时被反噬。
  const lastSlash = USER_AGENT.lastIndexOf('/');
  assert.notEqual(lastSlash, -1, 'User-Agent must contain "/" separator');
  assert.notEqual(lastSlash, 0, 'User-Agent must have a product segment before "/"');

  const product = USER_AGENT.slice(0, lastSlash);
  const version = USER_AGENT.slice(lastSlash + 1);

  assert.equal(product, PRODUCT_NAME);
  // 版本号段不应包含空白，且只能由数字、点、字母数字标识符组成
  assert.match(version, /^[\w.-]+$/);
  // 与 VERSION 保持一致
  assert.equal(version, VERSION);
});
