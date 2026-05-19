/**
 * configManager.core.js
 *
 * 配置管理器 Webview 的核心入口：
 *   - 与扩展进程的消息通道
 *   - 全局 state 与渲染调度
 *   - Provider/Model 列表卡片渲染
 *   - Toast、JSON 导入、Health、Issues、Dirty 标志
 *
 * Inspector 与弹窗逻辑分别放在 configManager.inspector.js
 * 与 configManager.dialogs.js 中，通过 window.CMB 命名空间共享。
 */

(function () {
  'use strict';

  /* eslint-disable no-undef */
  const vscode = acquireVsCodeApi();
  /* eslint-enable no-undef */

  /** 待获取模型列表请求 id，用于匹配响应 */
  let pendingFetchToken = 0;
  /** Toast 自动隐藏定时器 */
  let toastTimer = null;

  /** 全局 state，与扩展端 reducer 一一对应 */
  let state = vscode.getState() || {
    providers: [],
    selectedProviderId: undefined,
    selectedModelId: undefined,
    dirty: false,
    issues: [],
  };

  // ===== 暴露给其他脚本的 API =====
  const CMB = {
    get state() { return state; },
    postMutate,
    postSimple,
    sendFetchModels,
    showToast,
    el,
    escapeHtml,
    escapeAttr,
    parseInputValue,
    selectOptions,
    formatTokens,
    openModal,
    closeModal,
    isValidUrl,
    currentProvider,
    currentModel,
    uniqueProviderId,
  };
  window.CMB = CMB;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindStaticActions();
    bindMessageChannel();
    if (window.CMB.dialogs && window.CMB.dialogs.bind) {
      window.CMB.dialogs.bind();
    }
    vscode.postMessage({ type: 'ready' });
    render();
  }

  // ===== 消息通道 =====

  function bindMessageChannel() {
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || typeof msg.type !== 'string') return;
      handleIncomingMessage(msg);
    });
  }

  function handleIncomingMessage(msg) {
    if (msg.type === 'state') {
      state = { ...state, ...msg.state, issues: state.issues || [] };
      vscode.setState(state);
      render();
    } else if (msg.type === 'validation') {
      state.issues = msg.issues || [];
      renderIssues();
      renderHealth();
    } else if (msg.type === 'modelsList') {
      if (msg.token === pendingFetchToken && window.CMB.dialogs) {
        window.CMB.dialogs.showModelSuggestions(msg.models || [], msg.error);
      }
    } else if (msg.type === 'toast') {
      showToast(msg.message, msg.severity || 'info');
    }
  }

  function postMutate(message) {
    vscode.postMessage({ type: 'mutate', message, state });
  }

  function postSimple(type) {
    vscode.postMessage({ type, state });
  }

  function sendFetchModels(baseUrl, apiKey) {
    pendingFetchToken += 1;
    vscode.postMessage({
      type: 'fetchModels',
      token: pendingFetchToken,
      baseUrl,
      apiKey,
    });
  }

  // ===== 顶部 / 底部按钮 =====

  function bindStaticActions() {
    el('btn-validate').addEventListener('click', () => postSimple('validate'));
    el('btn-save').addEventListener('click', () => postSimple('save'));
    el('btn-open-settings').addEventListener('click', () => postSimple('openSettings'));
    el('btn-add-provider').addEventListener('click', () => {
      if (window.CMB.dialogs) window.CMB.dialogs.openProviderDialog();
    });
    el('btn-add-model').addEventListener('click', () => {
      if (window.CMB.dialogs) window.CMB.dialogs.openModelDialog();
    });
    el('btn-import-json').addEventListener('click', importJson);
  }

  // ===== 渲染调度 =====

  function render() {
    renderProviders();
    renderModels();
    if (window.CMB.inspector) {
      window.CMB.inspector.render();
    }
    renderHealth();
    renderDirty();
  }

  function renderDirty() {
    const dirtyEl = el('dirty-flag');
    dirtyEl.style.display = state.dirty ? 'inline-flex' : 'none';
  }

  function renderHealth() {
    const errors = (state.issues || []).filter((i) => i.severity === 'error').length;
    const warnings = (state.issues || []).filter((i) => i.severity === 'warning').length;
    const total = state.providers.reduce((sum, p) => sum + p.models.length, 0);
    const health = el('health');
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
    const list = el('issues');
    const items = state.issues || [];
    if (items.length === 0) {
      list.innerHTML = '<li class="suggestions-empty">无验证问题</li>';
      return;
    }
    list.innerHTML = items
      .map((issue) => `<li class="issue-${escapeAttr(issue.severity)}">${escapeHtml(issue.message)}</li>`)
      .join('');
  }

  // ===== Provider / Model 列表 =====

  function renderProviders() {
    const container = el('providers');
    if (state.providers.length === 0) {
      container.innerHTML = '<div class="empty-tip">暂无 Provider</div>';
      return;
    }
    container.innerHTML = state.providers.map(providerCardHtml).join('');
    container.querySelectorAll('[data-provider]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.getAttribute('data-provider');
        if (id) postMutate({ type: 'selectProvider', providerId: id });
      });
    });
  }

  function providerCardHtml(provider) {
    const active = provider.id === state.selectedProviderId ? ' active' : '';
    const count = provider.models.length;
    return `<button class="provider-card${active}" data-provider="${escapeAttr(provider.id)}">
      <span class="card-top">
        <span class="card-name">${escapeHtml(provider.displayName)}</span>
        <span class="badge ${count > 0 ? 'success' : ''}">${count}</span>
      </span>
      <span class="card-meta">${escapeHtml(stripProtocol(provider.baseUrl))}</span>
    </button>`;
  }

  function renderModels() {
    const provider = currentProvider();
    el('models-title').textContent = provider ? `${provider.displayName} 的模型` : '模型';
    const container = el('models');
    if (!provider) {
      container.innerHTML = '<div class="empty-tip">先选择一个 Provider</div>';
      el('btn-add-model').disabled = true;
      return;
    }
    el('btn-add-model').disabled = false;
    if (provider.models.length === 0) {
      container.innerHTML = '<div class="empty-tip">这个 Provider 还没有模型，点击右上角“添加模型”</div>';
      return;
    }
    container.innerHTML = provider.models.map(modelCardHtml).join('');
    container.querySelectorAll('[data-model]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.getAttribute('data-model');
        if (id) postMutate({ type: 'selectModel', providerId: provider.id, modelId: id });
      });
    });
  }

  function modelCardHtml(model) {
    const active = model.id === state.selectedModelId ? ' active' : '';
    return `<button class="model-card${active}" data-model="${escapeAttr(model.id)}">
      <span class="card-top">
        <span class="card-name">${escapeHtml(model.name)}</span>
        <span class="badges">${modelBadgesHtml(model)}</span>
      </span>
      <span class="card-meta">${escapeHtml(model.id)}</span>
      <span class="model-meta-row">${formatTokens(model.maxInputTokens)} 输入 / ${formatTokens(model.maxOutputTokens)} 输出</span>
    </button>`;
  }

  function modelBadgesHtml(model) {
    const badges = [];
    if (model.supportsToolCalling && model.supportsEditTools) {
      badges.push({ text: 'Agent', cls: 'agent' });
    } else if (model.supportsToolCalling) {
      badges.push({ text: '工具', cls: 'tool' });
    }
    if (model.supportsVision) badges.push({ text: '视觉', cls: 'success' });
    if (model.supportsReasoning) badges.push({ text: '推理', cls: 'reasoning' });
    if (badges.length === 0) badges.push({ text: formatTokens(model.maxInputTokens), cls: '' });
    return badges.map((b) => `<span class="badge${b.cls ? ' ' + b.cls : ''}">${escapeHtml(b.text)}</span>`).join('');
  }

  // ===== JSON 导入 =====

  function importJson() {
    const provider = currentProvider();
    if (!provider) {
      showToast('请先选择一个 Provider', 'error');
      return;
    }
    const text = el('json-input').value.trim();
    if (!text) {
      showToast('粘贴 JSON 后再点击导入', 'error');
      return;
    }
    let models;
    try {
      models = JSON.parse(text);
    } catch {
      showToast('JSON 解析失败', 'error');
      return;
    }
    if (!Array.isArray(models)) {
      showToast('JSON 必须是数组', 'error');
      return;
    }
    postMutate({ type: 'importModels', providerId: provider.id, models });
  }

  // ===== Toast =====

  function showToast(message, severity) {
    const toast = el('toast');
    toast.className = `toast visible ${severity || 'info'}`;
    toast.textContent = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  }

  // ===== 公共工具 =====

  function el(id, optional) {
    const node = document.getElementById(id);
    if (!node && !optional) console.warn('[configManager] missing element:', id);
    return node;
  }

  function currentProvider() {
    return state.providers.find((p) => p.id === state.selectedProviderId)
      || state.providers[0];
  }

  function currentModel() {
    const provider = currentProvider();
    if (!provider) return undefined;
    return provider.models.find((m) => m.id === state.selectedModelId);
  }

  function uniqueProviderId(base) {
    const existing = new Set(state.providers.map((p) => p.id));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }

  function selectOptions(values, current) {
    return values
      .map((v) => `<option value="${escapeAttr(v)}" ${v === current ? 'selected' : ''}>${escapeHtml(v || '(无)')}</option>`)
      .join('');
  }

  function parseInputValue(input) {
    if (input.type === 'number') {
      if (input.value === '') return undefined;
      return Number(input.value);
    }
    return input.value;
  }

  function formatTokens(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return '-';
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  }

  function stripProtocol(url) {
    return (url || '').replace(/^https?:\/\//, '');
  }

  function isValidUrl(value) {
    try { new URL(value); return true; }
    catch { return false; }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
  }
})();
