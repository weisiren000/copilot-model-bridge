(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};
  const REASONING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
  const EDIT_TOOLS = ['find-replace', 'multi-find-replace', 'apply-patch', 'code-rewrite'];

  function renderReasoningSection(model) {
    if (!model.supportsReasoning) return '';
    const supported = model.supportedReasoningLevels && model.supportedReasoningLevels.length
      ? model.supportedReasoningLevels
      : ['medium'];
    const def = model.defaultReasoningLevel || supported[0] || 'medium';
    return `<div class="subsection">
      <div class="block-title">推理配置</div>
      <div class="form-grid">
        <div class="field">
          <label>默认推理级别</label>
          <select data-scope="model" data-key="defaultReasoningLevel">
            ${CMB.selectOptions(supported, def)}
          </select>
        </div>
        <div class="field wide">
          <label>支持的推理级别</label>
          <div class="chips" data-chips="reasoningLevels">
            ${REASONING_LEVELS.map((level) => `
              <span class="chip ${supported.includes(level) ? '' : 'muted'}" data-level="${CMB.escapeAttr(level)}">${CMB.escapeHtml(level)}</span>
            `).join('')}
          </div>
          <small>启用推理时必须包含默认级别。</small>
        </div>
      </div>
    </div>`;
  }

  function renderEditToolsSection(model) {
    if (!model.supportsToolCalling || !model.supportsEditTools) return '';
    const selected = model.preferredEditTools && model.preferredEditTools.length
      ? model.preferredEditTools
      : ['find-replace', 'multi-find-replace', 'apply-patch'];
    return `<div class="subsection">
      <div class="block-title">首选编辑工具</div>
      <div class="chips" data-chips="editTools">
        ${EDIT_TOOLS.map((tool) => `
          <span class="chip ${selected.includes(tool) ? '' : 'muted'}" data-tool="${CMB.escapeAttr(tool)}">${CMB.escapeHtml(tool)}</span>
        `).join('')}
      </div>
      <small>留空则使用默认列表（不含 code-rewrite）。</small>
    </div>`;
  }

  CMB.inspectorModelSections = {
    renderReasoningSection,
    renderEditToolsSection,
  };
})();
