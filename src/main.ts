/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as core from '@actions/core';
import * as github from '@actions/github';
import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobClient,
  BlobServiceClient,
  ContainerClient,
} from '@azure/storage-blob';
import { withFile as withTemporaryFile } from 'tmp-promise';

import { getInputs } from './inputs';
import { CacheHitKindState, saveState } from './state';
import { CompressionMethod, extractTar } from './tar-utils';

async function getBestMatch(
  blobClient: BlobClient,
  containerClient: ContainerClient,
  key: string,
  restoreKeys: string[],
): Promise<[BlobClient, Exclude<CacheHitKindState, 'none'>] | [null, 'none']> {
  const folderPrefix = `${github.context.repo.owner}/${github.context.repo.repo}`;

  core.debug(`Will lookup for the file ${folderPrefix}/${key}.tar`);

  // const exactFile = bucket.file(`${folderPrefix}/${key}.tar`);
  // const exists = await blobClient.exists();
  const exactFileExists = await blobClient.exists().catch((err) => {
    core.error('Failed to check if an exact match exists');
    throw err;
  });

  // core.debug(`Exact file name: ${exactFile.name}.`);

  if (exactFileExists) {
    console.log(`🙌 Found exact match from cache for key '${key}'.`);
    return [blobClient, 'exact'];
  } else {
    console.log(`🔸 No exact match found for key '${key}'.`);
  }

  for (const key of restoreKeys) {
    const blobClient = containerClient.getBlobClient(`${folderPrefix}/${key}`);
    const exists = await blobClient.exists();
    if (exists) {
      return [blobClient, 'partial'];
    }
  }

  return [null, 'none'];
}

async function main() {
  const inputs = getInputs();

  const folderPrefix = `${github.context.repo.owner}/${github.context.repo.repo}`;
  const exactFileName = `${folderPrefix}/${inputs.key}.tar`;

  const credential = new DefaultAzureCredential();

  const blobServiceClient = new BlobServiceClient(
    `https://${inputs.storageAccount}.blob.core.windows.net`,
    credential,
  );
  const containerClient = blobServiceClient.getContainerClient(
    inputs.container,
  );
  const blobClient = containerClient.getBlobClient(exactFileName);

  const [bestMatch, bestMatchKind] = await core.group(
    '🔍 Searching the best cache archive available',
    () =>
      getBestMatch(blobClient, containerClient, inputs.key, inputs.restoreKeys),
  );

  core.debug(`Best match kind: ${bestMatchKind}.`);

  if (!bestMatch) {
    saveState({
      storageAccount: inputs.storageAccount,
      container: inputs.container,
      path: inputs.path,
      compressionMethod: inputs.compressionMethod,
      keyFileName: inputs.keyFileName,
      cacheHitKind: 'none',
      targetFileName: exactFileName,
    });
    core.setOutput('cache-hit', 'false');
    console.log('😢 No cache candidate found.');
    return;
  }

  core.debug(`Best match name: ${bestMatch.name}.`);

  const bestMatchMetadata = await bestMatch.getProperties().catch((err) => {
    core.error('Failed to read object metadatas');
    throw err;
  });

  core.debug(`Best match metadata: ${JSON.stringify(bestMatchMetadata)}.`);

  const compressionMethod = bestMatchMetadata?.metadata
    ?.cacheactioncompressionmethod as CompressionMethod;

  core.debug(`Best match compression method: ${compressionMethod}.`);

  if (!bestMatchMetadata || !compressionMethod) {
    saveState({
      storageAccount: inputs.storageAccount,
      container: inputs.container,
      path: inputs.path,
      compressionMethod: inputs.compressionMethod,
      keyFileName: inputs.keyFileName,
      cacheHitKind: 'none',
      targetFileName: exactFileName,
    });

    core.setOutput('cache-hit', 'false');
    console.log('😢 No cache candidate found (missing metadata).');
    return;
  }

  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();

  return withTemporaryFile(async (tmpFile) => {
    await core
      .group('🌐 Downloading cache archive from bucket', async () => {
        console.log(`🔹 Downloading file '${bestMatch.name}'...`);

        return blobClient.downloadToFile(tmpFile.path);
      })
      .catch((err) => {
        core.error('Failed to download the file');
        throw err;
      });

    await core
      .group('🗜️ Extracting cache archive', () =>
        extractTar(tmpFile.path, compressionMethod, workspace),
      )
      .catch((err) => {
        core.error('Failed to extract the archive');
        throw err;
      });

    saveState({
      path: inputs.path,
      storageAccount: inputs.storageAccount,
      container: inputs.container,
      compressionMethod: inputs.compressionMethod,
      keyFileName: inputs.keyFileName,
      cacheHitKind: bestMatchKind,
      targetFileName: exactFileName,
    });
    core.setOutput('cache-hit', bestMatchKind === 'exact');
    console.log('✅ Successfully restored cache.');
  });
}

void main().catch((err: Error) => {
  core.error(err);
  core.setFailed(err);
});
