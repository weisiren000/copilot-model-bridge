(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};

  let pendingFetchToken = 0;

  function init() {
    bindStaticActions();
    bindMessageChannel();
    bindDialogs();
    CMB.vscode.postMessage({ type: 'ready' });
    render();
  }

  function bindDialogs() {
    if (CMB.dialogProvider) CMB.dialogProvider.bind();
    if (CMB.dialogModel) CMB.dialogModel.bind();
  }

  function bindMessageChannel() {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;
      handleIncomingMessage(msg);
    });
  }

  function handleIncomingMessage(msg) {
    if (msg.type === 'state') {
      CMB.setState({ ...CMB.getState(), ...msg.state, issues: CMB.getState().issues || [] });
      render();
    } else if (msg.type === 'validation') {
      CMB.getState().issues = msg.issues || [];
      renderIssues();
      renderHealth();
    } else if (msg.type === 'modelsList') {
      if (msg.token === pendingFetchToken && CMB.dialogShared) {
        CMB.dialogShared.showModelSuggestions(msg.models || [], msg.error);
      }
    } else if (msg.type === 'toast') {
      CMB.showToast(msg.message, msg.severity || 'info');
    }
  }

  function bindStaticActions() {
    CMB.el('btn-validate').addEventListener('click', () => postSimple('validate'));
    CMB.el('btn-save').addEventListener('click', () => postSimple('save'));
    CMB.el('btn-open-settings').addEventListener('click', () => postSimple('openSettings'));
    CMB.el('btn-add-provider').addEventListener('click', () => {
      if (CMB.dialogProvider) CMB.dialogProvider.open();
    });
    CMB.el('btn-add-model').addEventListener('click', () => {
      if (CMB.dialogModel) CMB.dialogModel.open();
    });
    CMB.el('btn-import-json').addEventListener('click', importJson);
  }

  function postMutate(message) {
    CMB.vscode.postMessage({ type: 'mutate', message, state: CMB.getState() });
  }

  function postSimple(type) {
    CMB.vscode.postMessage({ type, state: CMB.getState() });
  }

  function sendFetchModels(baseUrl, apiKey) {
    pendingFetchToken += 1;
    CMB.vscode.postMessage({
      type: 'fetchModels',
      token: pendingFetchToken,
      baseUrl,
      apiKey,
    });
  }

  function render() {
    CMB.renderProviders();
    CMB.renderModels();
    renderInspector();
    renderHealth();
    renderDirty();
  }

  function renderInspector() {
    const inspector = CMB.el('inspector-body');
    const provider = CMB.currentProvider();
    const model = CMB.currentModel();
    if (!provider) {
      inspector.innerHTML = '<div class="empty-tip">选择一个 Provider 来开始</div>';
      return;
    }
    if (!model) {
      inspector.innerHTML = CMB.inspectorProvider.renderProviderInspector(provider);
      CMB.inspectorProvider.bindProviderInspectorInputs(provider);
      return;
    }
    inspector.innerHTML = CMB.inspectorModel.renderModelInspector(provider, model);
    CMB.inspectorModel.bindModelInspectorInputs(provider, model);
  }

  function renderDirty() {
    const dirtyEl = CMB.el('dirty-flag');
    dirtyEl.style.display = CMB.getState().dirty ? 'inline-flex' : 'none';
  }

  function renderHealth() {
    const state = CMB.getState();
    const errors = (state.issues || []).filter((issue) => issue.severity === 'error').length;
    const warnings = (state.issues || []).filter((issue) => issue.severity === 'warning').length;
    const total = state.providers.reduce((sum, provider) => sum + provider.models.length, 0);
    const health = CMB.el('health');
    if (!state.providers.length) {
      health.className = 'health';
      health.innerHTML = '<strong>尚未配置 Provider</strong>点击右上角“添加”创建第一个 Provider。';
      return;
    }
    if (errors === 0 && warnings === 0) {
      health.className = 'health ok';
      health.innerHTML = `<strong>配置健康</strong>${state.providers.length} 个 Provider · ${total} 个模型`;
    } else {
      health.className = 'health';
      health.innerHTML = `<strong>${errors} 个错误 / ${warnings} 个警告</strong>请运行验证查看详情。`;
    }
  }

  function renderIssues() {
    const list = CMB.el('issues');
    const items = CMB.getState().issues || [];
    if (items.length === 0) {
      list.innerHTML = '<li class="suggestions-empty">无验证问题</li>';
      return;
    }
    list.innerHTML = items
      .map((issue) => `<li class="issue-${CMB.escapeAttr(issue.severity)}">${CMB.escapeHtml(issue.message)}</li>`)
      .join('');
  }

  function importJson() {
    const provider = CMB.currentProvider();
    if (!provider) {
      CMB.showToast('请先选择一个 Provider', 'error');
      return;
    }
    const text = CMB.el('json-input').value.trim();
    if (!text) {
      CMB.showToast('粘贴 JSON 后再点击导入', 'error');
      return;
    }
    let models;
    try {
      models = JSON.parse(text);
    } catch {
      CMB.showToast('JSON 解析失败', 'error');
      return;
    }
    if (!Array.isArray(models)) {
      CMB.showToast('JSON 必须是数组', 'error');
      return;
    }
    postMutate({ type: 'importModels', providerId: provider.id, models });
  }

  CMB.postMutate = postMutate;
  CMB.postSimple = postSimple;
  CMB.sendFetchModels = sendFetchModels;

  document.addEventListener('DOMContentLoaded', init);
})();
