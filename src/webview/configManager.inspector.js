/**
 * configManager.inspector.js
 *
 * 配置管理器 Webview 的 Inspector 渲染：
 *   - Provider 选中时展示 Provider 表单
 *   - Model 选中时展示模型详情：标识、路由与成本、能力开关、推理、首选编辑工具
 *   - 字段变更通过 CMB.postMutate 与扩展进程同步
 *
 * 通过 window.CMB.inspector.render 暴露给 core.js 调用。
 */

(function () {
  'use strict';

  const REASONING_LEVELS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
  const EDIT_TOOLS = ['find-replace', 'multi-find-replace', 'apply-patch', 'code-rewrite'];
  const TOOL_CHOICE_MODES = ['required', 'auto', 'none', 'omit'];
  const CATEGORY_OPTIONS = ['', 'Reasoning', 'Chat', 'Vision', 'Agent', 'Embedding', 'Audio'];

  function ensureCmb() {
    if (!window.CMB) {
      console.warn('[configManager] CMB namespace missing');
      return false;
    }
    return true;
  }

  function render() {
    if (!ensureCmb()) return;
    const cmb = window.CMB;
    const inspector = cmb.el('inspector-body');
    const provider = cmb.currentProvider();
    const model = cmb.currentModel();
    if (!provider) {
      inspector.innerHTML = '<div class="empty-tip">选择一个 Provider 来开始</div>';
      return;
    }
    if (!model) {
      inspector.innerHTML = renderProviderInspector(provider);
      bindProviderInspectorInputs(provider);
      return;
    }
    inspector.innerHTML = renderModelInspector(provider, model);
    bindModelInspectorInputs(provider, model);
  }

  function renderProviderInspector(provider) {
    const e = window.CMB.escapeAttr;
    const h = window.CMB.escapeHtml;
    return `
    <div class="inspector-head">
      <div>
        <div class="section-title">Provider 信息</div>
        <h1>${h(provider.displayName)}</h1>
        <p>编辑 Provider 基础信息。下方加号按钮可向该 Provider 添加模型。</p>
      </div>
      <button class="danger" id="btn-delete-provider">删除 Provider</button>
    </div>
    <div class="subsection">
      <div class="block-title">基本信息</div>
      <div class="form-grid">
        <div class="field">
          <label>Provider ID</label>
          <input data-scope="provider" data-key="id" value="${e(provider.id)}">
          <small>扩展内部唯一标识，不允许空格。</small>
        </div>
        <div class="field">
          <label>显示名称</label>
          <input data-scope="provider" data-key="displayName" value="${e(provider.displayName)}">
        </div>
        <div class="field wide">
          <label>Base URL</label>
          <input data-scope="provider" data-key="baseUrl" value="${e(provider.baseUrl)}">
        </div>
        <div class="field wide">
          <label>API Key</label>
          <input type="password" data-scope="provider" data-key="apiKey" value="${e(provider.apiKey)}" placeholder="留空表示无需认证">
        </div>
      </div>
    </div>`;
  }

  function bindProviderInspectorInputs(provider) {
    const cmb = window.CMB;
    document.querySelectorAll('[data-scope="provider"]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-key');
        if (!key) return;
        cmb.postMutate({
          type: 'updateProvider',
          providerId: provider.id,
          patch: { [key]: input.value },
        });
      });
    });
    const delBtn = cmb.el('btn-delete-provider', true);
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        cmb.postMutate({ type: 'deleteProvider', providerId: provider.id });
      });
    }
  }

  function renderModelInspector(provider, model) {
    const h = window.CMB.escapeHtml;
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
    ${renderReasoningSection(model)}
    ${renderEditToolsSection(model)}`;
  }

  function renderIdentitySection(model) {
    const e = window.CMB.escapeAttr;
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
    const cmb = window.CMB;
    const e = cmb.escapeAttr;
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
            ${cmb.selectOptions(TOOL_CHOICE_MODES, model.toolChoiceMode || 'required')}
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
            ${cmb.selectOptions(CATEGORY_OPTIONS, model.categoryLabel || '')}
          </select>
        </div>
      </div>
    </div>`;
  }

  function renderCapabilitySection(model) {
    const e = window.CMB.escapeAttr;
    const h = window.CMB.escapeHtml;
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

  function renderReasoningSection(model) {
    if (!model.supportsReasoning) return '';
    const cmb = window.CMB;
    const e = cmb.escapeAttr;
    const h = cmb.escapeHtml;
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
            ${cmb.selectOptions(supported, def)}
          </select>
        </div>
        <div class="field wide">
          <label>支持的推理级别</label>
          <div class="chips" data-chips="reasoningLevels">
            ${REASONING_LEVELS.map((lv) => `
              <span class="chip ${supported.includes(lv) ? '' : 'muted'}" data-level="${e(lv)}">${h(lv)}</span>
            `).join('')}
          </div>
          <small>启用推理时必须包含默认级别。</small>
        </div>
      </div>
    </div>`;
  }

  function renderEditToolsSection(model) {
    if (!model.supportsToolCalling || !model.supportsEditTools) return '';
    const e = window.CMB.escapeAttr;
    const h = window.CMB.escapeHtml;
    const selected = model.preferredEditTools && model.preferredEditTools.length
      ? model.preferredEditTools
      : ['find-replace', 'multi-find-replace', 'apply-patch'];
    return `<div class="subsection">
      <div class="block-title">首选编辑工具</div>
      <div class="chips" data-chips="editTools">
        ${EDIT_TOOLS.map((t) => `
          <span class="chip ${selected.includes(t) ? '' : 'muted'}" data-tool="${e(t)}">${h(t)}</span>
        `).join('')}
      </div>
      <small>留空则使用默认列表（不含 code-rewrite）。</small>
    </div>`;
  }

  function bindModelInspectorInputs(provider, model) {
    const cmb = window.CMB;
    bindModelTextInputs(provider, model);
    bindModelToggles(provider, model);
    bindReasoningChips(provider, model);
    bindEditToolChips(provider, model);

    const dup = cmb.el('btn-duplicate-model', true);
    if (dup) dup.addEventListener('click', () => cmb.postMutate({
      type: 'duplicateModel', providerId: provider.id, modelId: model.id,
    }));
    const del = cmb.el('btn-delete-model', true);
    if (del) del.addEventListener('click', () => {
      cmb.postMutate({ type: 'deleteModel', providerId: provider.id, modelId: model.id });
    });
  }

  function bindModelTextInputs(provider, model) {
    const cmb = window.CMB;
    document.querySelectorAll('[data-scope="model"]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-key');
        if (!key) return;
        cmb.postMutate({
          type: 'updateModel',
          providerId: provider.id,
          modelId: model.id,
          patch: { [key]: cmb.parseInputValue(input) },
        });
      });
    });
  }

  function bindModelToggles(provider, model) {
    const cmb = window.CMB;
    document.querySelectorAll('[data-toggle]').forEach((node) => {
      node.addEventListener('click', () => {
        const key = node.getAttribute('data-toggle');
        if (!key) return;
        const next = !node.classList.contains('on');
        cmb.postMutate({
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
          .map((c) => c.getAttribute('data-level'))
          .filter(Boolean);
        window.CMB.postMutate({
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
          .map((c) => c.getAttribute('data-tool'))
          .filter(Boolean);
        window.CMB.postMutate({
          type: 'updateModel',
          providerId: provider.id,
          modelId: model.id,
          patch: { preferredEditTools: tools },
        });
      });
    });
  }

  window.CMB = window.CMB || {};
  window.CMB.inspector = { render };
})();
