/**
 * branding.ts
 *
 * 共享的品牌标识信息。所有对外请求（HTTP User-Agent、OpenRouter 归属
 * 头等）都从这里读取，避免在多处以硬编码字符串方式重复维护。
 *
 * - `PRODUCT_NAME`：产品展示名（同步保留向后兼容的字符串 "Copilot Model Bridge"）。
 * - `USER_AGENT`：标准 HTTP User-Agent，按 RFC 7231 形式 `<product>/<version>` 输出。
 *
 * 版本号直接从 package.json 读取（tsconfig 已开启 resolveJsonModule，
 * 编译时会被静态内联），无需运行时读取磁盘。
 */

import pkg from '../../package.json';

export const PRODUCT_NAME: string = 'Copilot Model Bridge';

export const VERSION: string = pkg.version;

/**
 * 标准 User-Agent：`Copilot Model Bridge/1.1.1`
 *
 * 之所以把版本写进 UA，是为了在远端服务日志里能直接看到是哪一版的桥接
 * 在调用，方便排查客户端兼容性问题。
 */
export const USER_AGENT: string = `${PRODUCT_NAME}/${VERSION}`;
