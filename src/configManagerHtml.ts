export interface ConfigManagerHtmlOptions {
  cspSource: string;
  nonce: string;
}

export function renderConfigManagerHtml(options: ConfigManagerHtmlOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${options.cspSource}; style-src 'nonce-${options.nonce}'; script-src 'nonce-${options.nonce}';">
  <title>Copilot Model Bridge Config</title>
  <style nonce="${options.nonce}">
    :root {
      color-scheme: light dark;
      --panel-border: var(--vscode-panel-border);
      --muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --danger: var(--vscode-errorForeground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    button, input, select, textarea {
      font: inherit;
    }
    button {
      border: 0;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      padding: 6px 10px;
      cursor: pointer;
    }
    button.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.danger {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }
    input, select, textarea {
      width: 100%;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      padding: 6px 8px;
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    .shell {
      display: grid;
      grid-template-rows: auto 1fr auto;
      min-height: 100vh;
    }
    .topbar, .footer {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--panel-border);
    }
    .footer {
      border-top: 1px solid var(--panel-border);
      border-bottom: 0;
    }
    .title {
      font-weight: 600;
      margin-right: auto;
    }
    .dirty {
      color: var(--vscode-notificationsWarningIcon-foreground);
    }
    .workspace {
      display: grid;
      grid-template-columns: minmax(180px, 22%) minmax(220px, 26%) 1fr;
      min-height: 0;
    }
    .column {
      min-width: 0;
      padding: 12px;
      border-right: 1px solid var(--panel-border);
      overflow: auto;
    }
    .column:last-child { border-right: 0; }
    h2 {
      margin: 0 0 10px;
      font-size: 13px;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: 0;
    }
    .item {
      width: 100%;
      text-align: left;
      margin-bottom: 6px;
      color: var(--vscode-list-foreground);
      background: transparent;
      border: 1px solid transparent;
    }
    .item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .muted {
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
    }
    .full {
      grid-column: 1 / -1;
    }
    label {
      display: grid;
      gap: 4px;
    }
    .checks {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px 12px;
    }
    .checks label {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .checks input {
      width: auto;
    }
    .issues {
      padding: 8px 12px;
      border-top: 1px solid var(--panel-border);
      color: var(--muted);
      max-height: 120px;
      overflow: auto;
    }
    .issue-error { color: var(--danger); }
    .empty {
      color: var(--muted);
      border: 1px dashed var(--panel-border);
      padding: 18px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="title">Copilot Model Bridge Config</div>
      <span id="dirty" class="dirty"></span>
      <button id="validate">Validate</button>
      <button id="save">Save</button>
      <button id="settings" class="secondary">Open Settings JSON</button>
    </header>
    <main class="workspace">
      <section class="column">
        <h2>Providers</h2>
        <div id="providers"></div>
        <button id="addProvider" class="secondary">Add Provider</button>
        <button id="deleteProvider" class="danger">Delete Provider</button>
      </section>
      <section class="column">
        <h2>Models</h2>
        <div id="models"></div>
        <button id="addModel" class="secondary">Add Model</button>
        <button id="duplicateModel" class="secondary">Duplicate</button>
        <button id="deleteModel" class="danger">Delete</button>
      </section>
      <section class="column">
        <h2>Provider</h2>
        <div id="providerForm"></div>
        <h2>Model</h2>
        <div id="modelForm"></div>
      </section>
    </main>
    <footer class="footer">
      <button id="importJson" class="secondary">Import JSON</button>
      <textarea id="jsonInput" placeholder='[{"id":"model-id","name":"Model Name"}]'></textarea>
    </footer>
    <div id="issues" class="issues"></div>
  </div>
  <script nonce="${options.nonce}">
    const vscode = acquireVsCodeApi();
    let state = vscode.getState() || { providers: [], dirty: false };
    const $ = (id) => document.getElementById(id);

    window.addEventListener('message', event => {
      if (event.data.type === 'state') {
        state = event.data.state;
        vscode.setState(state);
        render();
      }
      if (event.data.type === 'validation') {
        renderIssues(event.data.issues || []);
      }
    });

    $('validate').addEventListener('click', () => post('validate'));
    $('save').addEventListener('click', () => post('save'));
    $('settings').addEventListener('click', () => post('openSettings'));
    $('addProvider').addEventListener('click', () => mutate({ type: 'addProvider' }));
    $('deleteProvider').addEventListener('click', () => selectedProvider() && mutate({ type: 'deleteProvider', providerId: selectedProvider().id }));
    $('addModel').addEventListener('click', () => selectedProvider() && mutate({ type: 'addModel', providerId: selectedProvider().id }));
    $('duplicateModel').addEventListener('click', () => selectedModel() && mutate({ type: 'duplicateModel', providerId: selectedProvider().id, modelId: selectedModel().id }));
    $('deleteModel').addEventListener('click', () => selectedModel() && mutate({ type: 'deleteModel', providerId: selectedProvider().id, modelId: selectedModel().id }));
    $('importJson').addEventListener('click', () => importModels());

    function post(type) {
      vscode.postMessage({ type, state });
    }
    function mutate(message) {
      vscode.postMessage({ type: 'mutate', message, state });
    }
    function selectedProvider() {
      return state.providers.find(provider => provider.id === state.selectedProviderId) || state.providers[0];
    }
    function selectedModel() {
      const provider = selectedProvider();
      return provider?.models.find(model => model.id === state.selectedModelId) || provider?.models[0];
    }
    function render() {
      renderProviders();
      renderModels();
      renderProviderForm();
      renderModelForm();
      $('dirty').textContent = state.dirty ? 'Unsaved changes' : '';
    }
    function renderProviders() {
      $('providers').innerHTML = state.providers.map(provider => '<button class="item ' + (provider.id === state.selectedProviderId ? 'active' : '') + '" data-provider="' + escapeHtml(provider.id) + '">' + escapeHtml(provider.displayName) + '<div class="muted">' + escapeHtml(provider.baseUrl) + '</div></button>').join('') || '<div class="empty">No providers</div>';
      document.querySelectorAll('[data-provider]').forEach(button => button.addEventListener('click', () => mutate({ type: 'selectProvider', providerId: button.dataset.provider })));
    }
    function renderModels() {
      const provider = selectedProvider();
      $('models').innerHTML = provider?.models.map(model => '<button class="item ' + (model.id === state.selectedModelId ? 'active' : '') + '" data-model="' + escapeHtml(model.id) + '">' + escapeHtml(model.name) + '<div class="muted">' + escapeHtml(model.id) + '</div></button>').join('') || '<div class="empty">No models</div>';
      document.querySelectorAll('[data-model]').forEach(button => button.addEventListener('click', () => mutate({ type: 'selectModel', providerId: selectedProvider().id, modelId: button.dataset.model })));
    }
    function renderProviderForm() {
      const provider = selectedProvider();
      $('providerForm').innerHTML = provider ? formFields('provider', provider, ['id', 'displayName', 'baseUrl', 'apiKey']) : '<div class="empty">Select a provider</div>';
      bindInputs('provider', provider, value => mutate({ type: 'updateProvider', providerId: provider.id, patch: value }));
    }
    function renderModelForm() {
      const model = selectedModel();
      if (!model) {
        $('modelForm').innerHTML = '<div class="empty">Select or add a model</div>';
        return;
      }
      const textFields = ['id','name','maxInputTokens','maxOutputTokens','preferredEditTools','toolChoiceMode','supportedReasoningLevels','defaultReasoningLevel','multiplier','multiplierNumeric','family','version','categoryLabel','categoryOrder','statusIcon'];
      $('modelForm').innerHTML = formFields('model', model, textFields) + checkboxFields(model);
      bindInputs('model', model, value => mutate({ type: 'updateModel', providerId: selectedProvider().id, modelId: model.id, patch: value }));
    }
    function formFields(scope, value, keys) {
      return '<div class="grid">' + keys.map(key => '<label><span>' + key + '</span><input data-scope="' + scope + '" data-key="' + key + '" value="' + escapeHtml(formatValue(value[key])) + '"></label>').join('') + '</div>';
    }
    function checkboxFields(model) {
      const keys = ['supportsToolCalling','supportsVision','supportsVideo','supportsFileInput','supportsEditTools','supportsReasoning'];
      return '<div class="checks full">' + keys.map(key => '<label><input type="checkbox" data-scope="model" data-key="' + key + '" ' + (model[key] ? 'checked' : '') + '> ' + key + '</label>').join('') + '</div>';
    }
    function bindInputs(scope, source, callback) {
      document.querySelectorAll('[data-scope="' + scope + '"]').forEach(input => {
        input.addEventListener('change', () => callback({ [input.dataset.key]: parseInput(input) }));
      });
    }
    function parseInput(input) {
      if (input.type === 'checkbox') return input.checked;
      if (['maxInputTokens','maxOutputTokens','multiplierNumeric','categoryOrder'].includes(input.dataset.key)) return input.value === '' ? undefined : Number(input.value);
      if (['preferredEditTools','supportedReasoningLevels'].includes(input.dataset.key)) return input.value.split(',').map(value => value.trim()).filter(Boolean);
      return input.value;
    }
    function importModels() {
      try {
        const models = JSON.parse($('jsonInput').value);
        if (!Array.isArray(models)) throw new Error('not array');
        mutate({ type: 'importModels', providerId: selectedProvider().id, models });
      } catch {
        renderIssues([{ severity: 'error', message: 'Import JSON must be an array of model objects.' }]);
      }
    }
    function renderIssues(issues) {
      $('issues').innerHTML = issues.length ? issues.map(issue => '<div class="issue-' + issue.severity + '">' + escapeHtml(issue.message) + '</div>').join('') : 'No validation issues.';
    }
    function formatValue(value) {
      return Array.isArray(value) ? value.join(', ') : (value ?? '');
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }
    render();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
