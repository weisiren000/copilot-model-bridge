(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};
  let selectedModelDefaults;
  const PROVIDER_PRESETS = {
    openai: {
      label: 'OpenAI 官方（Responses API）',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      idHint: 'openai',
      apiKeyHint: 'sk-...',
      apiStyle: 'responses',
    },
    'openai-compatible': {
      label: '通用 OpenAI 兼容（Chat Completions）',
      name: 'OpenAI Compatible',
      baseUrl: 'https://example.com/v1',
      idHint: 'openai-compatible',
      apiKeyHint: 'API key 或留空',
      apiStyle: 'chat',
    },
    deepseek: {
      label: 'DeepSeek（V3 / V4 / R1）',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      idHint: 'deepseek',
      apiKeyHint: 'sk-...',
    },
    xai: {
      label: 'xAI（Grok / Responses API）',
      name: 'xAI',
      baseUrl: 'https://api.x.ai/v1',
      idHint: 'xai',
      apiKeyHint: 'xai-...',
      apiStyle: 'responses',
    },
    anthropic: {
      label: 'Anthropic（Claude Messages API）',
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      idHint: 'anthropic',
      apiKeyHint: 'sk-ant-...',
      apiStyle: 'anthropic',
    },
  };

  CMB.dialogShared = {
    PROVIDER_PRESETS,
    populatePresetSelect,
    parseInitialModels,
    showModelSuggestions,
    createSuggestionItem,
    hideSuggestions,
    clearSelectedModelDefaults,
    getSelectedModelDefaults,
    resolveSuggestionTokenLimits,
  };

  function populatePresetSelect() {
    const select = CMB.el('preset-select');
    const options = [{ value: '', label: '-- 跳过，手动填写 --' }]
      .concat(Object.entries(PROVIDER_PRESETS).map(([key, preset]) => ({ value: key, label: preset.label })));
    select.innerHTML = options.map((option) => (
      `<option value="${CMB.escapeAttr(option.value)}">${CMB.escapeHtml(option.label)}</option>`
    )).join('');
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

  function showModelSuggestions(models, error) {
    const list = CMB.el('model-suggestions');
    const btn = CMB.el('btn-fetch-models');
    btn.classList.remove('loading');
    btn.textContent = '获取列表';
    list.innerHTML = '';
    if (error) {
      list.innerHTML = `<li class="suggestions-empty">获取失败：${CMB.escapeHtml(error)}</li>`;
      list.classList.add('visible');
      return;
    }
    if (!models || models.length === 0) {
      list.innerHTML = '<li class="suggestions-empty">未获取到模型，可手动输入</li>';
      list.classList.add('visible');
      return;
    }
    models.forEach((model) => list.appendChild(createSuggestionItem(model)));
    list.classList.add('visible');
  }

  function createSuggestionItem(model) {
    const suggestion = normalizeModelSuggestion(model);
    const li = document.createElement('li');
    li.textContent = suggestion.id;
    li.addEventListener('mousedown', (event) => {
      event.preventDefault();
      applyModelSuggestion(suggestion);
      hideSuggestions();
    });
    return li;
  }

  function normalizeModelSuggestion(model) {
    return typeof model === 'string'
      ? { id: model }
      : { id: model.id, defaults: model.defaults };
  }

  function applyModelSuggestion(suggestion) {
    const defaults = suggestion.defaults || {};
    const tokenLimits = resolveSuggestionTokenLimits(defaults);
    selectedModelDefaults = { ...defaults, id: suggestion.id };
    CMB.el('dialog-model-id').value = suggestion.id;
    CMB.el('dialog-model-name').value = defaults.name || suggestion.id.split('/').pop() || suggestion.id;
    CMB.el('dialog-model-family').value = defaults.family || '';
    CMB.el('dialog-context-window').value = String(tokenLimits.contextWindowTokens);
    CMB.el('dialog-max-output').value = String(tokenLimits.maxOutputTokens);
    CMB.el('dialog-available-input').value = String(tokenLimits.maxInputTokens);
    applyModelCapabilityDefaults(defaults);
  }

  function resolveSuggestionTokenLimits(defaults) {
    // Profiles may publish a total context window without an output ceiling.
    // Keep the dialog's editable default request cap instead of inventing one.
    const maxOutputTokens = defaults.maxOutputTokens || 4096;
    const contextWindowTokens = defaults.contextWindowTokens
      || CMB.calculateContextWindowTokens(defaults.maxInputTokens || 128000, maxOutputTokens);
    return {
      contextWindowTokens,
      maxOutputTokens,
      maxInputTokens: CMB.calculateMaxInputTokens(contextWindowTokens, maxOutputTokens),
    };
  }

  function applyModelCapabilityDefaults(defaults) {
    document.querySelectorAll('#model-modal [data-dialog-toggle]').forEach((node) => {
      const key = node.getAttribute('data-dialog-toggle');
      if (key && typeof defaults[key] === 'boolean') {
        node.classList.toggle('on', defaults[key]);
      }
    });
  }

  function clearSelectedModelDefaults() {
    selectedModelDefaults = undefined;
  }

  function getSelectedModelDefaults(modelId) {
    return selectedModelDefaults?.id === modelId ? { ...selectedModelDefaults } : undefined;
  }

  function hideSuggestions() {
    const list = CMB.el('model-suggestions', true);
    if (list) list.classList.remove('visible');
  }
})();
