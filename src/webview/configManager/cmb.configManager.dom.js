(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};
  let toastTimer = null;

  CMB.el = function el(id, optional) {
    const node = document.getElementById(id);
    if (!node && !optional) {
      console.warn('[configManager] missing element:', id);
    }
    return node;
  };
  CMB.escapeHtml = function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  };
  CMB.escapeAttr = function escapeAttr(value) {
    return CMB.escapeHtml(value);
  };
  CMB.selectOptions = function selectOptions(values, current) {
    return values.map((value) => (
      `<option value="${CMB.escapeAttr(value)}" ${value === current ? 'selected' : ''}>${CMB.escapeHtml(value || '(无)')}</option>`
    )).join('');
  };
  CMB.parseInputValue = function parseInputValue(input) {
    if (input.type === 'number') {
      if (input.value === '') return undefined;
      return Number(input.value);
    }
    return input.value;
  };
  CMB.formatTokens = function formatTokens(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    if (value >= 1000000) return `${formatCompactNumber(value / 1000000)}M`;
    if (value >= 1000) return `${formatCompactNumber(value / 1000)}K`;
    return String(value);
  };
  function formatCompactNumber(value) {
    const floored = Math.floor(value * 10) / 10;
    return Number.isInteger(floored) ? String(floored) : floored.toFixed(1);
  }
  CMB.stripProtocol = function stripProtocol(url) {
    return (url || '').replace(/^https?:\/\//, '');
  };
  CMB.isValidUrl = function isValidUrl(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };
  CMB.openModal = function openModal(modal) {
    if (!modal) return;
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
  };
  CMB.closeModal = function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
  };
  CMB.showToast = function showToast(message, severity) {
    const toast = CMB.el('toast');
    toast.className = `toast visible ${severity || 'info'}`;
    toast.textContent = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  };
})();
