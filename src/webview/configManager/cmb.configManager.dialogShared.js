(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};
  const PROVIDER_PRESETS = {
    'openai-compatible': {
      label: 'OpenAI 兼容（标准 Chat Completions）',
      name: 'OpenAI Compatible',
      baseUrl: 'https://api.openai.com/v1',
      idHint: 'openai',
      apiKeyHint: 'sk-...',
    },
    deepseek: {
      label: 'DeepSeek（V3 / V4 / R1）',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      idHint: 'deepseek',
      apiKeyHint: 'sk-...',
    },
  };

  CMB.dialogShared = {
    PROVIDER_PRESETS,
    populatePresetSelect,
    parseInitialModels,
    showModelSuggestions,
    createSuggestionItem,
    hideSuggestions,
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
    models.forEach((id) => list.appendChild(createSuggestionItem(id)));
    list.classList.add('visible');
  }

  function createSuggestionItem(id) {
    const li = document.createElement('li');
    li.textContent = id;
    li.addEventListener('mousedown', (event) => {
      event.preventDefault();
      CMB.el('dialog-model-id').value = id;
      const nameInput = CMB.el('dialog-model-name');
      if (!nameInput.value.trim()) {
        nameInput.value = id.split('/').pop() || id;
      }
      hideSuggestions();
    });
    return li;
  }

  function hideSuggestions() {
    const list = CMB.el('model-suggestions', true);
    if (list) list.classList.remove('visible');
  }
})();
