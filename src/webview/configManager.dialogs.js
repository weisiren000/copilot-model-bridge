/**
 * configManager.dialogs.js
 *
 * 配置管理器 Webview 的弹窗模块：
 *   - 添加 Provider 弹窗（含预设模板下拉）
 *   - 添加 Model 弹窗（含从 Provider API 获取模型列表 + 建议下拉）
 *   - 模型 ID 建议下拉的展示与隐藏
 *
 * 通过 window.CMB.dialogs 暴露给 core.js。
 */

(function () {
  'use strict';

  const PROVIDER_PRESETS = {
    'openai-compatible': {
      label: 'OpenAI 兼容（标准 Chat Completions）',
      name: 'OpenAI Compatible',
      baseUrl: 'https://api.openai.com/v1',
      idHint: 'openai',
      apiKeyHint: 'sk-...',
    },
    'deepseek': {
      label: 'DeepSeek（V3 / V4 / R1）',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      idHint: 'deepseek',
      apiKeyHint: 'sk-...',
    },
  };

  function bind() {
    bindProviderDialog();
    bindModelDialog();
  }

  // ===== Provider 弹窗 =====

  function bindProviderDialog() {
    const cmb = window.CMB;
    const modal = cmb.el('provider-modal');
    cmb.el('btn-provider-cancel').addEventListener('click', () => cmb.closeModal(modal));
    cmb.el('btn-provider-close').addEventListener('click', () => cmb.closeModal(modal));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cmb.closeModal(modal);
    });
    cmb.el('btn-provider-confirm').addEventListener('click', submitProviderDialog);
    cmb.el('preset-select').addEventListener('change', applyProviderPreset);
    populatePresetSelect();
  }

  function populatePresetSelect() {
    const cmb = window.CMB;
    const select = cmb.el('preset-select');
    const opts = [{ value: '', label: '-- 跳过，手动填写 --' }]
      .concat(Object.entries(PROVIDER_PRESETS).map(([k, v]) => ({ value: k, label: v.label })));
    select.innerHTML = opts.map((o) =>
      `<option value="${cmb.escapeAttr(o.value)}">${cmb.escapeHtml(o.label)}</option>`
    ).join('');
  }

  function applyProviderPreset() {
    const cmb = window.CMB;
    const key = cmb.el('preset-select').value;
    const preset = PROVIDER_PRESETS[key];
    if (!preset) return;
    cmb.el('dialog-provider-name').value = preset.name;
    cmb.el('dialog-provider-id').value = cmb.uniqueProviderId(preset.idHint);
    cmb.el('dialog-base-url').value = preset.baseUrl;
    cmb.el('dialog-api-key').value = '';
    cmb.el('dialog-api-key').placeholder = preset.apiKeyHint;
  }

  function openProviderDialog() {
    const cmb = window.CMB;
    cmb.el('dialog-provider-name').value = '';
    cmb.el('dialog-provider-id').value = '';
    cmb.el('dialog-base-url').value = '';
    cmb.el('dialog-api-key').value = '';
    cmb.el('dialog-import').value = '';
    cmb.el('preset-select').value = '';
    cmb.openModal(cmb.el('provider-modal'));
  }

  function submitProviderDialog() {
    const cmb = window.CMB;
    const fields = readProviderForm();
    const error = validateProviderForm(fields);
    if (error) {
      cmb.showToast(error, 'error');
      return;
    }
    const initialModels = parseInitialModels(fields.importJsonStr);
    if (initialModels === null) {
      cmb.showToast('初始模型 JSON 必须为数组', 'error');
      return;
    }
    cmb.postMutate({
      type: 'createProvider',
      provider: {
        id: fields.id,
        displayName: fields.displayName,
        baseUrl: fields.baseUrl,
        apiKey: fields.apiKey,
        models: [],
      },
      initialModels,
    });
    cmb.closeModal(cmb.el('provider-modal'));
  }

  function readProviderForm() {
    const cmb = window.CMB;
    return {
      displayName: cmb.el('dialog-provider-name').value.trim(),
      id: cmb.el('dialog-provider-id').value.trim(),
      baseUrl: cmb.el('dialog-base-url').value.trim(),
      apiKey: cmb.el('dialog-api-key').value,
      importJsonStr: cmb.el('dialog-import').value.trim(),
    };
  }

  function validateProviderForm(fields) {
    const cmb = window.CMB;
    if (!fields.displayName || !fields.id || !fields.baseUrl) {
      return '请填写显示名称、Provider ID、Base URL';
    }
    if (/\s/.test(fields.id)) {
      return 'Provider ID 不允许包含空格';
    }
    if (cmb.state.providers.some((p) => p.id === fields.id)) {
      return `Provider "${fields.id}" 已存在`;
    }
    if (!cmb.isValidUrl(fields.baseUrl)) {
      return 'Base URL 不是合法的 URL';
    }
    return undefined;
  }

  function parseInitialModels(jsonStr) {
    if (!jsonStr) return undefined;
    try {
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  // ===== Model 弹窗 =====

  function bindModelDialog() {
    const cmb = window.CMB;
    const modal = cmb.el('model-modal');
    cmb.el('btn-model-cancel').addEventListener('click', () => cmb.closeModal(modal));
    cmb.el('btn-model-close').addEventListener('click', () => cmb.closeModal(modal));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cmb.closeModal(modal);
    });
    cmb.el('btn-model-confirm').addEventListener('click', submitModelDialog);
    cmb.el('btn-fetch-models').addEventListener('click', fetchModelList);
    document.addEventListener('click', handleSuggestionsOutsideClick);
    bindModelDialogToggles();
  }

  function handleSuggestionsOutsideClick(e) {
    const cmb = window.CMB;
    const list = cmb.el('model-suggestions', true);
    if (!list) return;
    const wrap = list.parentElement;
    if (wrap && !wrap.contains(e.target)) hideSuggestions();
  }

  function bindModelDialogToggles() {
    document.querySelectorAll('#model-modal [data-dialog-toggle]').forEach((node) => {
      node.addEventListener('click', () => node.classList.toggle('on'));
    });
  }

  function openModelDialog() {
    const cmb = window.CMB;
    if (!cmb.currentProvider()) {
      cmb.showToast('请先选择一个 Provider', 'error');
      return;
    }
    cmb.el('dialog-model-id').value = '';
    cmb.el('dialog-model-name').value = '';
    cmb.el('dialog-model-family').value = '';
    cmb.el('dialog-max-input').value = '128000';
    cmb.el('dialog-max-output').value = '4096';
    const defaults = { supportsToolCalling: true, supportsEditTools: true };
    document.querySelectorAll('#model-modal [data-dialog-toggle]').forEach((node) => {
      const key = node.getAttribute('data-dialog-toggle');
      node.classList.toggle('on', !!defaults[key]);
    });
    hideSuggestions();
    cmb.openModal(cmb.el('model-modal'));
  }

  function submitModelDialog() {
    const cmb = window.CMB;
    const provider = cmb.currentProvider();
    if (!provider) return;
    const fields = readModelForm();
    if (!fields.id || !fields.name) {
      cmb.showToast('请填写模型 ID 和显示名称', 'error');
      return;
    }
    if (provider.models.some((m) => m.id === fields.id)) {
      cmb.showToast(`模型 "${fields.id}" 已存在`, 'error');
      return;
    }
    const caps = readDialogToggles();
    cmb.postMutate({
      type: 'createModel',
      providerId: provider.id,
      model: {
        id: fields.id,
        name: fields.name,
        family: fields.family || undefined,
        maxInputTokens: fields.maxInput,
        maxOutputTokens: fields.maxOutput,
        ...caps,
      },
    });
    cmb.closeModal(cmb.el('model-modal'));
  }

  function readModelForm() {
    const cmb = window.CMB;
    return {
      id: cmb.el('dialog-model-id').value.trim(),
      name: cmb.el('dialog-model-name').value.trim(),
      family: cmb.el('dialog-model-family').value.trim(),
      maxInput: parseInt(cmb.el('dialog-max-input').value, 10) || 128000,
      maxOutput: parseInt(cmb.el('dialog-max-output').value, 10) || 4096,
    };
  }

  function readDialogToggles() {
    const result = {};
    document.querySelectorAll('#model-modal [data-dialog-toggle]').forEach((node) => {
      const key = node.getAttribute('data-dialog-toggle');
      if (key) result[key] = node.classList.contains('on');
    });
    return result;
  }

  function fetchModelList() {
    const cmb = window.CMB;
    const provider = cmb.currentProvider();
    if (!provider) {
      cmb.showToast('请先选择一个 Provider', 'error');
      return;
    }
    const btn = cmb.el('btn-fetch-models');
    btn.classList.add('loading');
    btn.textContent = '获取中...';
    cmb.sendFetchModels(provider.baseUrl, provider.apiKey);
  }

  function showModelSuggestions(models, error) {
    const cmb = window.CMB;
    const list = cmb.el('model-suggestions');
    const btn = cmb.el('btn-fetch-models');
    btn.classList.remove('loading');
    btn.textContent = '获取列表';
    list.innerHTML = '';
    if (error) {
      list.innerHTML = `<li class="suggestions-empty">获取失败：${cmb.escapeHtml(error)}</li>`;
      list.classList.add('visible');
      return;
    }
    if (!models || models.length === 0) {
      list.innerHTML = '<li class="suggestions-empty">未获取到模型，可手动输入</li>';
      list.classList.add('visible');
      return;
    }
    models.forEach((id) => list.appendChild(createSuggestionItem(id)));
    list.classList.add('visible');
  }

  function createSuggestionItem(id) {
    const cmb = window.CMB;
    const li = document.createElement('li');
    li.textContent = id;
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      cmb.el('dialog-model-id').value = id;
      const nameInput = cmb.el('dialog-model-name');
      if (!nameInput.value.trim()) {
        nameInput.value = id.split('/').pop() || id;
      }
      hideSuggestions();
    });
    return li;
  }

  function hideSuggestions() {
    const cmb = window.CMB;
    const list = cmb.el('model-suggestions', true);
    if (list) list.classList.remove('visible');
  }

  window.CMB = window.CMB || {};
  window.CMB.dialogs = {
    bind,
    openProviderDialog,
    openModelDialog,
    showModelSuggestions,
  };
})();
