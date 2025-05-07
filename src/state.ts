import * as core from '@actions/core';

export type CacheHitKindState = 'exact' | 'partial' | 'none';

export interface State {
  path: string;
  storageAccount: string;
  container: string;
  cacheHitKind: CacheHitKindState;
  targetFileName: string;
  keyFileName?: string;
  compressionMethod?: string;
}

export function saveState(state: State): void {
  core.debug(`Saving state: ${JSON.stringify(state)}.`);

  core.saveState('storageAccount', state.storageAccount);
  core.saveState('container', state.container);
  core.saveState('path', state.path);
  core.saveState('cache-hit-kind', state.cacheHitKind);
  core.saveState('target-file-name', state.targetFileName);
  core.saveState('key-file-name', state.keyFileName);
  core.saveState('compression-method', state.compressionMethod);
}

export function getState(): State {
  const state = {
    path: core.getState('path'),
    storageAccount: core.getState('storageAccount'),
    container: core.getState('container'),
    cacheHitKind: core.getState('cache-hit-kind') as CacheHitKindState,
    targetFileName: core.getState('target-file-name'),
    keyFileName: core.getState('key-file-name'),
    compressionMethod: core.getState('compression-method'),
  };

  core.debug(`Loaded state: ${JSON.stringify(state)}.`);

  return state;
}
