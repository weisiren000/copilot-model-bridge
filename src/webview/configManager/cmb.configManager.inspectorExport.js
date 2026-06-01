(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};

  function renderProviderInspector(provider) {
    const e = CMB.escapeAttr;
    const h = CMB.escapeHtml;
    const apiStyle = ['responses', 'anthropic'].includes(provider.apiStyle) ? provider.apiStyle : 'chat';
    return `
    <div class="inspector-head">
      <div>
        <div class="section-title">Provider 信息</div>
        <h1>${h(provider.displayName)}</h1>
        <p>编辑 Provider 基础信息。下方加号按钮可向该 Provider 添加模型。</p>
      </div>
      <button class="danger" id="btn-delete-provider">删除 Provider</button>
    </div>
    <div class="subsection">
      <div class="block-title">基本信息</div>
      <div class="form-grid">
        <div class="field">
          <label>Provider ID</label>
          <input data-scope="provider" data-key="id" value="${e(provider.id)}">
          <small>扩展内部唯一标识，不允许空格。</small>
        </div>
        <div class="field">
          <label>显示名称</label>
          <input data-scope="provider" data-key="displayName" value="${e(provider.displayName)}">
        </div>
        <div class="field wide">
          <label>Base URL</label>
          <input data-scope="provider" data-key="baseUrl" value="${e(provider.baseUrl)}">
        </div>
        <div class="field wide">
          <label>API Key</label>
          <input type="password" data-scope="provider" data-key="apiKey" value="${e(provider.apiKey)}" placeholder="留空表示无需认证">
        </div>
        <div class="field wide">
          <label>API Style</label>
          <select data-scope="provider" data-key="apiStyle">
            <option value="chat" ${apiStyle === 'chat' ? 'selected' : ''}>Chat Completions（/chat/completions）</option>
            <option value="responses" ${apiStyle === 'responses' ? 'selected' : ''}>Responses（/responses）</option>
            <option value="anthropic" ${apiStyle === 'anthropic' ? 'selected' : ''}>Anthropic Messages（/messages）</option>
          </select>
          <small>仅在 Provider 明确支持对应协议时切换，否则保持 Chat。</small>
        </div>
      </div>
    </div>`;
  }

  function bindProviderInspectorInputs(provider) {
    document.querySelectorAll('[data-scope="provider"]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-key');
        if (!key) return;
        CMB.postMutate({
          type: 'updateProvider',
          providerId: provider.id,
          patch: { [key]: input.value },
        });
      });
    });
    const delBtn = CMB.el('btn-delete-provider', true);
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        CMB.postMutate({ type: 'deleteProvider', providerId: provider.id });
      });
    }
  }

  CMB.inspectorProvider = {
    renderProviderInspector,
    bindProviderInspectorInputs,
  };
})();
