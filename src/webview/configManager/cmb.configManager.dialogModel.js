(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};

  CMB.dialogModel = {
    bind: bindModelDialog,
    open: openModelDialog,
  };

  function bindModelDialog() {
    const modal = CMB.el('model-modal');
    CMB.el('btn-model-cancel').addEventListener('click', () => CMB.closeModal(modal));
    CMB.el('btn-model-close').addEventListener('click', () => CMB.closeModal(modal));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) CMB.closeModal(modal);
    });
    CMB.el('btn-model-confirm').addEventListener('click', submitModelDialog);
    CMB.el('btn-fetch-models').addEventListener('click', fetchModelList);
    document.addEventListener('click', handleSuggestionsOutsideClick);
    bindModelDialogToggles();
  }

  function handleSuggestionsOutsideClick(event) {
    const list = CMB.el('model-suggestions', true);
    if (!list) return;
    const wrap = list.parentElement;
    if (wrap && !wrap.contains(event.target)) {
      CMB.dialogShared.hideSuggestions();
    }
  }

  function bindModelDialogToggles() {
    document.querySelectorAll('#model-modal [data-dialog-toggle]').forEach((node) => {
      node.addEventListener('click', () => node.classList.toggle('on'));
    });
  }

  function openModelDialog() {
    if (!CMB.currentProvider()) {
      CMB.showToast('请先选择一个 Provider', 'error');
      return;
    }
    CMB.el('dialog-model-id').value = '';
    CMB.el('dialog-model-name').value = '';
    CMB.el('dialog-model-family').value = '';
    CMB.el('dialog-max-input').value = '128000';
    CMB.el('dialog-max-output').value = '4096';
    const defaults = { supportsToolCalling: true, supportsEditTools: true };
    document.querySelectorAll('#model-modal [data-dialog-toggle]').forEach((node) => {
      const key = node.getAttribute('data-dialog-toggle');
      node.classList.toggle('on', !!defaults[key]);
    });
    CMB.dialogShared.hideSuggestions();
    CMB.openModal(CMB.el('model-modal'));
  }

  function submitModelDialog() {
    const provider = CMB.currentProvider();
    if (!provider) return;
    const fields = readModelForm();
    if (!fields.id || !fields.name) {
      CMB.showToast('请填写模型 ID 和显示名称', 'error');
      return;
    }
    if (provider.models.some((model) => model.id === fields.id)) {
      CMB.showToast(`模型 "${fields.id}" 已存在`, 'error');
      return;
    }
    const caps = readDialogToggles();
    CMB.postMutate({
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
    CMB.closeModal(CMB.el('model-modal'));
  }

  function readModelForm() {
    return {
      id: CMB.el('dialog-model-id').value.trim(),
      name: CMB.el('dialog-model-name').value.trim(),
      family: CMB.el('dialog-model-family').value.trim(),
      maxInput: parseInt(CMB.el('dialog-max-input').value, 10) || 128000,
      maxOutput: parseInt(CMB.el('dialog-max-output').value, 10) || 4096,
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
    const provider = CMB.currentProvider();
    if (!provider) {
      CMB.showToast('请先选择一个 Provider', 'error');
      return;
    }
    const btn = CMB.el('btn-fetch-models');
    btn.classList.add('loading');
    btn.textContent = '获取中...';
    CMB.sendFetchModels(provider.baseUrl, provider.apiKey);
  }
})();
