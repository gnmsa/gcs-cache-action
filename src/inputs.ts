import * as core from '@actions/core';

export interface Inputs {
  storageAccount: string;
  container: string;
  path: string;
  key: string;
  restoreKeys: string[];
  keyFileName?: string;
  compressionMethod?: string;
}

export function getInputs(): Inputs {
  const inputs = {
    storageAccount: core.getInput('storageAccount', { required: true }),
    container: core.getInput('container', { required: true }),
    path: core.getInput('path', { required: true }),
    key: core.getInput('key', { required: true }),
    keyFileName: core.getInput('key-file-name'),
    compressionMethod: core.getInput('compression-method'),
    restoreKeys: core
      .getInput('restore-keys')
      .split(',')
      .filter((path) => path),
  };

  core.debug(`Loaded inputs: ${JSON.stringify(inputs)}.`);

  return inputs;
}
