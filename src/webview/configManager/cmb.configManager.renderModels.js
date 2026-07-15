(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};

  CMB.renderModels = function renderModels() {
    const state = CMB.getState();
    const provider = CMB.currentProvider();
    CMB.el('models-title').textContent = provider ? `${provider.displayName} 的模型` : '模型';
    const container = CMB.el('models');
    if (!provider) {
      container.innerHTML = '<div class="empty-tip">先选择一个 Provider</div>';
      CMB.el('btn-add-model').disabled = true;
      return;
    }
    CMB.el('btn-add-model').disabled = false;
    if (provider.models.length === 0) {
      container.innerHTML = '<div class="empty-tip">这个 Provider 还没有模型，点击右上角“添加模型”</div>';
      return;
    }
    container.innerHTML = provider.models.map((model) => modelCardHtml(state, model)).join('');
    container.querySelectorAll('[data-model]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.getAttribute('data-model');
        if (id) {
          CMB.postMutate({ type: 'selectModel', providerId: provider.id, modelId: id });
        }
      });
    });
  };

  function modelCardHtml(state, model) {
    const active = model.id === state.selectedModelId ? ' active' : '';
    const contextWindowTokens = CMB.calculateContextWindowTokens(
      model.maxInputTokens,
      model.maxOutputTokens
    );
    return `<button class="model-card${active}" data-model="${CMB.escapeAttr(model.id)}">
      <span class="card-top">
        <span class="card-name">${CMB.escapeHtml(model.name)}</span>
        <span class="badges">${modelBadgesHtml(model)}</span>
      </span>
      <span class="card-meta">${CMB.escapeHtml(model.id)}</span>
      <span class="model-meta-row">${CMB.formatTokens(contextWindowTokens)} 上下文 / ${CMB.formatTokens(model.maxOutputTokens)} 输出</span>
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
    if (badges.length === 0) {
      badges.push({
        text: CMB.formatTokens(CMB.calculateContextWindowTokens(
          model.maxInputTokens,
          model.maxOutputTokens
        )),
        cls: '',
      });
    }
    return badges.map((badge) => `<span class="badge${badge.cls ? ` ${badge.cls}` : ''}">${CMB.escapeHtml(badge.text)}</span>`).join('');
  }

})();
