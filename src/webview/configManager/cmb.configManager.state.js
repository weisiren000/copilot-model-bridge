(function () {
  'use strict';

  const CMB = window.CMB = window.CMB || {};
  const vscode = acquireVsCodeApi();
  const initialState = vscode.getState() || {
    providers: [],
    selectedProviderId: undefined,
    selectedModelId: undefined,
    dirty: false,
    issues: [],
  };

  let state = initialState;

  CMB.vscode = vscode;
  CMB.getState = function getState() {
    return state;
  };
  CMB.setState = function setState(nextState) {
    state = nextState;
    vscode.setState(state);
    return state;
  };
  CMB.currentProvider = function currentProvider() {
    return state.providers.find((provider) => provider.id === state.selectedProviderId)
      || state.providers[0];
  };
  CMB.currentModel = function currentModel() {
    const provider = CMB.currentProvider();
    if (!provider) return undefined;
    return provider.models.find((model) => model.id === state.selectedModelId);
  };
  CMB.uniqueProviderId = function uniqueProviderId(base) {
    const existing = new Set(state.providers.map((provider) => provider.id));
    if (!existing.has(base)) return base;

    let index = 2;
    while (existing.has(`${base}-${index}`)) {
      index++;
    }
    return `${base}-${index}`;
  };
})();
