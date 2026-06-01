/**
 * 生成配置管理器 Webview 的 HTML 骨架。
 */

export interface ConfigManagerHtmlOptions {
  cspSource: string;
  nonce: string;
  /** 按引入顺序排列的样式表 URI */
  cssUris: readonly string[];
  /** 按加载顺序排列的脚本 URI（core 必须最后加载，其他模块向 window.CMB 注册） */
  scriptUris: readonly string[];
  logoUri: string;
}

export function renderConfigManagerHtml(options: ConfigManagerHtmlOptions): string {
  const { cspSource, nonce, cssUris, scriptUris, logoUri } = options;

  const styles = cssUris
    .map((uri) => `<link rel="stylesheet" href="${uri}">`)
    .join('\n  ');
  const scripts = scriptUris
    .map((uri) => `<script nonce="${nonce}" src="${uri}"></script>`)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource}; script-src 'nonce-${nonce}'; font-src ${cspSource};">
  <title>Copilot Model Bridge 配置管理器</title>
  ${styles}
</head>
<body>
  <div class="shell">
    ${renderTopbar(logoUri)}
    ${renderWorkspace()}
    ${renderFooter()}
  </div>
  ${renderProviderModal()}
  ${renderModelModal()}
  <div id="toast" class="toast" role="status"></div>
  ${scripts}
</body>
</html>`;
}

function renderTopbar(logoUri: string): string {
  return `<header class="topbar">
    <div class="topbar-title">
      <img class="topbar-logo" src="${logoUri}" alt="Copilot Model Bridge">
      <div class="topbar-text">
        <strong>Copilot Model Bridge</strong>
        <span>管理 OpenAI 兼容的 Provider，将模型暴露给 Copilot Chat</span>
      </div>
    </div>
    <span id="dirty-flag" class="dirty-flag" style="display:none">未保存的更改</span>
    <button id="btn-validate">验证</button>
    <button id="btn-save" class="primary">保存</button>
    <button id="btn-open-settings" class="ghost">打开 settings.json</button>
  </header>`;
}

function renderWorkspace(): string {
  return `<main class="workspace">
    <section class="pane providers" aria-label="Providers">
      <div class="pane-head">
        <div class="section-title">Provider 列表</div>
        <button id="btn-add-provider">+ 添加</button>
      </div>
      <div id="providers"></div>
      <div id="health" class="health"></div>
    </section>
    <section class="pane models" aria-label="Models">
      <div class="pane-head">
        <div class="section-title" id="models-title">模型</div>
        <button id="btn-add-model" disabled>+ 添加模型</button>
      </div>
      <div id="models"></div>
    </section>
    <section class="pane inspector" aria-label="Inspector">
      <div id="inspector-body"></div>
      <div class="subsection">
        <div class="block-title">验证结果</div>
        <ul id="issues" class="issues">
          <li class="suggestions-empty">尚未运行验证</li>
        </ul>
      </div>
    </section>
  </main>`;
}

function renderFooter(): string {
  return `<footer class="footer">
    <div class="footer-title">批量导入</div>
    <textarea id="json-input" placeholder='[{"id":"model-id","name":"Model Name","supportsToolCalling":true}]'></textarea>
    <button id="btn-import-json">导入 JSON</button>
  </footer>`;
}

function renderProviderModal(): string {
  return `<div id="provider-modal" class="modal-layer" aria-hidden="true">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title">
      <header class="dialog-head">
        <div class="dialog-mark">*</div>
        <div class="dialog-title">
          <h2 id="provider-modal-title">添加 Provider</h2>
          <p>填写基本信息创建 Provider，认证和模型可以稍后补充。</p>
        </div>
        <button id="btn-provider-close" class="dialog-close" aria-label="关闭">×</button>
      </header>
      <div class="dialog-body">
        <section class="dialog-section">
          <h3>快速配置</h3>
          <p>选择已适配的供应商模板自动填充表单。</p>
          <div class="form-grid">
            <div class="field wide">
              <label for="preset-select">供应商模板</label>
              <select id="preset-select"></select>
            </div>
          </div>
        </section>
        <section class="dialog-section">
          <h3>基本信息</h3>
          <p>创建 Provider 所需的必填字段。</p>
          <div class="form-grid">
            <div class="field">
              <label for="dialog-provider-name">显示名称 <span class="required-mark">*</span></label>
              <input id="dialog-provider-name">
            </div>
            <div class="field">
              <label for="dialog-provider-id">Provider ID <span class="required-mark">*</span></label>
              <input id="dialog-provider-id">
              <small>扩展内部使用的唯一标识符，不允许空格。</small>
            </div>
            <div class="field wide">
              <label for="dialog-base-url">Base URL <span class="required-mark">*</span></label>
              <input id="dialog-base-url">
              <small>OpenAI 兼容的 API 端点地址。</small>
            </div>
          </div>
        </section>
        <section class="dialog-section">
          <h3>认证</h3>
          <p>远程 Provider 必须填写 API Key；本地 Provider（如 Ollama）可留空。</p>
          <div class="form-grid">
            <div class="field wide">
              <label for="dialog-api-key">API Key</label>
              <input id="dialog-api-key" type="password">
              <small>留空表示无需认证。</small>
            </div>
          </div>
        </section>
        <section class="dialog-section">
          <h3>API 协议</h3>
          <p>选择 Provider 兼容的 API 协议，多数情况使用 Chat Completions。</p>
          <div class="form-grid">
            <div class="field wide">
              <label for="dialog-api-style">API Style</label>
              <select id="dialog-api-style">
                <option value="chat">Chat Completions（/chat/completions）</option>
                <option value="responses">Responses（/responses，仅 OpenAI 官方等支持）</option>
                <option value="anthropic">Anthropic Messages（/messages）</option>
              </select>
              <small>选错会导致请求 404 或 400。Anthropic 官方服务请选择 Anthropic Messages。</small>
            </div>
          </div>
        </section>
        <section class="dialog-section">
          <h3>高级（可选）</h3>
          <p>可一次性导入若干模型，仅需 id 和 name 字段。</p>
          <div class="form-grid">
            <div class="field wide">
              <label for="dialog-import">初始模型 JSON</label>
              <textarea id="dialog-import" placeholder='[{"id":"some/model","name":"Some Model"}]'></textarea>
            </div>
          </div>
        </section>
      </div>
      <footer class="dialog-actions">
        <button id="btn-provider-cancel">取消</button>
        <button id="btn-provider-confirm" class="primary">创建</button>
      </footer>
    </section>
  </div>`;
}

function renderModelModal(): string {
  return `<div id="model-modal" class="modal-layer" aria-hidden="true">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="model-modal-title">
      <header class="dialog-head">
        <div class="dialog-mark">*</div>
        <div class="dialog-title">
          <h2 id="model-modal-title">添加模型</h2>
          <p>添加一个新模型到当前 Provider。仅需填写模型 ID 和显示名称，其余使用默认值。</p>
        </div>
        <button id="btn-model-close" class="dialog-close" aria-label="关闭">×</button>
      </header>
      <div class="dialog-body">
        <section class="dialog-section">
          <h3>基本信息</h3>
          <p>支持从 Provider API 获取模型列表，也可直接手动输入。</p>
          <div class="form-grid">
            <div class="field wide">
              <label for="dialog-model-id">模型 ID <span class="required-mark">*</span></label>
              <div class="input-combo">
                <div class="combo-input-wrap">
                  <input id="dialog-model-id" autocomplete="off" placeholder="输入模型 ID 或从列表中选择">
                  <ul id="model-suggestions" class="model-suggestions"></ul>
                </div>
                <button id="btn-fetch-models" type="button">获取列表</button>
              </div>
            </div>
            <div class="field">
              <label for="dialog-model-name">显示名称 <span class="required-mark">*</span></label>
              <input id="dialog-model-name" placeholder="例如: GPT-4o">
            </div>
            <div class="field">
              <label for="dialog-model-family">模型家族</label>
              <input id="dialog-model-family" placeholder="留空则从 ID 自动推断">
            </div>
          </div>
        </section>
        <section class="dialog-section">
          <h3>Token 限制</h3>
          <p>设置模型可输入上限和输出上限。</p>
          <div class="form-grid">
            <div class="field">
              <label for="dialog-max-input">最大输入 Tokens</label>
              <input id="dialog-max-input" type="number" value="128000">
            </div>
            <div class="field">
              <label for="dialog-max-output">最大输出 Tokens</label>
              <input id="dialog-max-output" type="number" value="4096">
            </div>
          </div>
        </section>
        <section class="dialog-section">
          <h3>能力开关</h3>
          <p>勾选模型支持的功能，未勾选保持默认。</p>
          <div class="capability-grid">
            <div class="toggle on" data-dialog-toggle="supportsToolCalling"><span class="switch"></span><span>工具调用</span></div>
            <div class="toggle on" data-dialog-toggle="supportsEditTools"><span class="switch"></span><span>Agent 编辑工具</span></div>
            <div class="toggle" data-dialog-toggle="supportsVision"><span class="switch"></span><span>视觉输入</span></div>
            <div class="toggle" data-dialog-toggle="supportsVideo"><span class="switch"></span><span>视频输入</span></div>
            <div class="toggle" data-dialog-toggle="supportsFileInput"><span class="switch"></span><span>文件输入</span></div>
            <div class="toggle" data-dialog-toggle="supportsReasoning"><span class="switch"></span><span>推理力度</span></div>
          </div>
        </section>
      </div>
      <footer class="dialog-actions">
        <button id="btn-model-cancel">取消</button>
        <button id="btn-model-confirm" class="primary">添加模型</button>
      </footer>
    </section>
  </div>`;
}
