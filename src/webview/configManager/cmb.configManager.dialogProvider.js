(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};

  CMB.dialogProvider = {
    bind: bindProviderDialog,
    open: openProviderDialog,
  };

  function bindProviderDialog() {
    const modal = CMB.el('provider-modal');
    CMB.el('btn-provider-cancel').addEventListener('click', () => CMB.closeModal(modal));
    CMB.el('btn-provider-close').addEventListener('click', () => CMB.closeModal(modal));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) CMB.closeModal(modal);
    });
    CMB.el('btn-provider-confirm').addEventListener('click', submitProviderDialog);
    CMB.el('preset-select').addEventListener('change', applyProviderPreset);
    CMB.dialogShared.populatePresetSelect();
  }

  function applyProviderPreset() {
    const preset = CMB.dialogShared.PROVIDER_PRESETS[CMB.el('preset-select').value];
    if (!preset) return;
    CMB.el('dialog-provider-name').value = preset.name;
    CMB.el('dialog-provider-id').value = CMB.uniqueProviderId(preset.idHint);
    CMB.el('dialog-base-url').value = preset.baseUrl;
    CMB.el('dialog-api-key').value = '';
    CMB.el('dialog-api-key').placeholder = preset.apiKeyHint;
    CMB.el('dialog-api-style').value = preset.apiStyle || 'chat';
  }

  function openProviderDialog() {
    CMB.el('dialog-provider-name').value = '';
    CMB.el('dialog-provider-id').value = '';
    CMB.el('dialog-base-url').value = '';
    CMB.el('dialog-api-key').value = '';
    CMB.el('dialog-import').value = '';
    CMB.el('preset-select').value = '';
    CMB.el('dialog-api-style').value = 'chat';
    CMB.openModal(CMB.el('provider-modal'));
  }

  function submitProviderDialog() {
    const fields = readProviderForm();
    const error = validateProviderForm(fields);
    if (error) {
      CMB.showToast(error, 'error');
      return;
    }
    const initialModels = CMB.dialogShared.parseInitialModels(fields.importJsonStr);
    if (initialModels === null) {
      CMB.showToast('初始模型 JSON 必须为数组', 'error');
      return;
    }
    CMB.postMutate({
      type: 'createProvider',
      provider: {
        id: fields.id,
        displayName: fields.displayName,
        baseUrl: fields.baseUrl,
        apiKey: fields.apiKey,
        apiStyle: fields.apiStyle,
        models: [],
      },
      initialModels,
    });
    CMB.closeModal(CMB.el('provider-modal'));
  }

  function readProviderForm() {
    return {
      displayName: CMB.el('dialog-provider-name').value.trim(),
      id: CMB.el('dialog-provider-id').value.trim(),
      baseUrl: CMB.el('dialog-base-url').value.trim(),
      apiKey: CMB.el('dialog-api-key').value,
      apiStyle: CMB.el('dialog-api-style').value || 'chat',
      importJsonStr: CMB.el('dialog-import').value.trim(),
    };
  }

  function validateProviderForm(fields) {
    if (!fields.displayName || !fields.id || !fields.baseUrl) {
      return '请填写显示名称、Provider ID、Base URL';
    }
    if (/\s/.test(fields.id)) {
      return 'Provider ID 不允许包含空格';
    }
    if (CMB.getState().providers.some((provider) => provider.id === fields.id)) {
      return `Provider "${fields.id}" 已存在`;
    }
    if (!CMB.isValidUrl(fields.baseUrl)) {
      return 'Base URL 不是合法的 URL';
    }
    return undefined;
  }
})();
