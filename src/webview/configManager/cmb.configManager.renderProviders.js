(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};

  CMB.renderProviders = function renderProviders() {
    const state = CMB.getState();
    const container = CMB.el('providers');
    if (state.providers.length === 0) {
      container.innerHTML = '<div class="empty-tip">暂无 Provider</div>';
      return;
    }
    container.innerHTML = state.providers.map(providerCardHtml).join('');
    container.querySelectorAll('[data-provider]').forEach((node) => {
      node.addEventListener('click', () => {
        const id = node.getAttribute('data-provider');
        if (id) {
          CMB.postMutate({ type: 'selectProvider', providerId: id });
        }
      });
    });
  };

  function providerCardHtml(provider) {
    const state = CMB.getState();
    const active = provider.id === state.selectedProviderId ? ' active' : '';
    const count = provider.models.length;
    return `<button class="provider-card${active}" data-provider="${CMB.escapeAttr(provider.id)}">
      <span class="card-top">
        <span class="card-name">${CMB.escapeHtml(provider.displayName)}</span>
        <span class="badge ${count > 0 ? 'success' : ''}">${count}</span>
      </span>
      <span class="card-meta">${CMB.escapeHtml(CMB.stripProtocol(provider.baseUrl))}</span>
    </button>`;
  }
})();
