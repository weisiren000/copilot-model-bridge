(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};
  const TOOL_CHOICE_MODES = ['required', 'auto', 'none', 'omit'];
  const CATEGORY_OPTIONS = ['', 'Reasoning', 'Chat', 'Vision', 'Agent', 'Embedding', 'Audio'];

  function renderModelInspector(provider, model) {
    const h = CMB.escapeHtml;
    return `
    <div class="inspector-head">
      <div>
        <div class="section-title">已选模型</div>
        <h1>${h(model.name)}</h1>
        <p>${h(provider.displayName)} Provider · 编辑这些字段将更新 VS Code 配置。</p>
      </div>
      <button id="btn-duplicate-model">复制</button>
      <button class="danger" id="btn-delete-model">删除</button>
    </div>
    ${renderIdentitySection(model)}
    ${renderRoutingSection(model)}
    ${renderCapabilitySection(model)}
    ${CMB.inspectorModelSections.renderReasoningSection(model)}
    ${CMB.inspectorModelSections.renderEditToolsSection(model)}`;
  }

  function renderIdentitySection(model) {
    const e = CMB.escapeAttr;
    return `<div class="subsection">
      <div class="block-title">模型标识</div>
      <div class="form-grid">
        <div class="field wide">
          <label>模型 ID <span class="required-mark">*</span></label>
          <input data-scope="model" data-key="id" value="${e(model.id)}">
        </div>
        <div class="field">
          <label>显示名称 <span class="required-mark">*</span></label>
          <input data-scope="model" data-key="name" value="${e(model.name)}">
        </div>
        <div class="field">
          <label>模型家族</label>
          <input data-scope="model" data-key="family" value="${e(model.family || '')}" placeholder="留空自动推断">
        </div>
        <div class="field">
          <label>版本</label>
          <input data-scope="model" data-key="version" value="${e(model.version || '')}">
        </div>
        <div class="field">
          <label>状态图标</label>
          <input data-scope="model" data-key="statusIcon" value="${e(model.statusIcon || '')}" placeholder="如: sparkle">
        </div>
      </div>
    </div>`;
  }

  function renderRoutingSection(model) {
    const e = CMB.escapeAttr;
    return `<div class="subsection">
      <div class="block-title">路由与成本</div>
      <div class="form-grid">
        <div class="field">
          <label>最大输入 Tokens</label>
          <input type="number" data-scope="model" data-key="maxInputTokens" value="${model.maxInputTokens}">
        </div>
        <div class="field">
          <label>最大输出 Tokens</label>
          <input type="number" data-scope="model" data-key="maxOutputTokens" value="${model.maxOutputTokens}">
        </div>
        <div class="field">
          <label>工具选择模式</label>
          <select data-scope="model" data-key="toolChoiceMode">
            ${CMB.selectOptions(TOOL_CHOICE_MODES, model.toolChoiceMode || 'required')}
          </select>
        </div>
        <div class="field">
          <label>倍率标签</label>
          <input data-scope="model" data-key="multiplier" value="${e(model.multiplier || '0x')}">
        </div>
        <div class="field">
          <label>数值倍率</label>
          <input type="number" step="0.01" data-scope="model" data-key="multiplierNumeric" value="${model.multiplierNumeric ?? ''}">
        </div>
        <div class="field">
          <label>分类排序</label>
          <input type="number" data-scope="model" data-key="categoryOrder" value="${model.categoryOrder ?? ''}">
        </div>
        <div class="field wide">
          <label>分类标签</label>
          <select data-scope="model" data-key="categoryLabel">
            ${CMB.selectOptions(CATEGORY_OPTIONS, model.categoryLabel || '')}
          </select>
        </div>
      </div>
    </div>`;
  }

  function renderCapabilitySection(model) {
    const e = CMB.escapeAttr;
    const h = CMB.escapeHtml;
    const caps = [
      ['supportsToolCalling', '工具调用', model.supportsToolCalling !== false],
      ['supportsEditTools', 'Agent 编辑工具', model.supportsEditTools !== false && model.supportsToolCalling !== false],
      ['supportsVision', '视觉输入', !!model.supportsVision],
      ['supportsVideo', '视频输入', !!model.supportsVideo],
      ['supportsFileInput', '文件输入', !!model.supportsFileInput],
      ['supportsReasoning', '推理力度', !!model.supportsReasoning],
    ];
    return `<div class="subsection">
      <div class="block-title">能力开关</div>
      <div class="capability-grid">
        ${caps.map(([key, label, on]) => `
          <div class="toggle ${on ? 'on' : ''}" data-toggle="${e(key)}">
            <span class="switch"></span>
            <span>${h(label)}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  function bindModelInspectorInputs(provider, model) {
    bindModelTextInputs(provider, model);
    bindModelToggles(provider, model);
    bindReasoningChips(provider, model);
    bindEditToolChips(provider, model);

    const dup = CMB.el('btn-duplicate-model', true);
    if (dup) {
      dup.addEventListener('click', () => CMB.postMutate({
        type: 'duplicateModel',
        providerId: provider.id,
        modelId: model.id,
      }));
    }
    const del = CMB.el('btn-delete-model', true);
    if (del) {
      del.addEventListener('click', () => {
        CMB.postMutate({ type: 'deleteModel', providerId: provider.id, modelId: model.id });
      });
    }
  }

  function bindModelTextInputs(provider, model) {
    document.querySelectorAll('[data-scope="model"]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-key');
        if (!key) return;
        CMB.postMutate({
          type: 'updateModel',
          providerId: provider.id,
          modelId: model.id,
          patch: { [key]: CMB.parseInputValue(input) },
        });
      });
    });
  }

  function bindModelToggles(provider, model) {
    document.querySelectorAll('[data-toggle]').forEach((node) => {
      node.addEventListener('click', () => {
        const key = node.getAttribute('data-toggle');
        if (!key) return;
        const next = !node.classList.contains('on');
        CMB.postMutate({
          type: 'updateModel',
          providerId: provider.id,
          modelId: model.id,
          patch: { [key]: next },
        });
      });
    });
  }

  function bindReasoningChips(provider, model) {
    const wrap = document.querySelector('[data-chips="reasoningLevels"]');
    if (!wrap) return;
    wrap.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('muted');
        const levels = Array.from(wrap.querySelectorAll('.chip:not(.muted)'))
          .map((item) => item.getAttribute('data-level'))
          .filter(Boolean);
        CMB.postMutate({
          type: 'updateModel',
          providerId: provider.id,
          modelId: model.id,
          patch: { supportedReasoningLevels: levels },
        });
      });
    });
  }

  function bindEditToolChips(provider, model) {
    const wrap = document.querySelector('[data-chips="editTools"]');
    if (!wrap) return;
    wrap.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('muted');
        const tools = Array.from(wrap.querySelectorAll('.chip:not(.muted)'))
          .map((item) => item.getAttribute('data-tool'))
          .filter(Boolean);
        CMB.postMutate({
          type: 'updateModel',
          providerId: provider.id,
          modelId: model.id,
          patch: { preferredEditTools: tools },
        });
      });
    });
  }

  CMB.inspectorModel = {
    renderModelInspector,
    bindModelInspectorInputs,
  };
})();
