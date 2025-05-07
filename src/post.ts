import * as core from '@actions/core';
import * as glob from '@actions/glob';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, Metadata } from '@azure/storage-blob';
import * as path from 'path';
import { withFile as withTemporaryFile } from 'tmp-promise';

import { getState } from './state';
import { createTar } from './tar-utils';

async function main() {
  const state = getState();

  if (state.cacheHitKind === 'exact') {
    console.log(
      '🌀 Skipping uploading cache as the cache was hit by exact match.',
    );
    return;
  }
  const credential = new DefaultAzureCredential();
  const blobServiceClient = new BlobServiceClient(
    `https://${state.storageAccount}.blob.core.windows.net`,
    credential,
  );
  const containerClient = blobServiceClient.getContainerClient(state.container);

  const targetFileName = state.targetFileName;
  // const [targetFileExists] = await bucket
  //   .file(targetFileName)
  //   .exists()
  //   .catch((err) => {
  //     core.error('Failed to check if the file already exists');
  //     throw err;
  //   });

  core.debug(`Target file name: ${targetFileName}.`);

  // if (targetFileExists) {
  //   console.log(
  //     '🌀 Skipping uploading cache as it already exists (probably due to another job).',
  //   );
  //   return;
  // }

  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const globber = await glob.create(state.path, {
    implicitDescendants: false,
  });

  const paths = await globber
    .glob()
    .then((files) => files.map((file) => path.relative(workspace, file)));

  core.debug(`Paths: ${JSON.stringify(paths)}.`);

  return withTemporaryFile(async (tmpFile) => {
    const compressionMethod = await core
      .group('🗜️ Creating cache archive', () =>
        createTar(tmpFile.path, paths, workspace),
      )
      .catch((err) => {
        core.error('Failed to create the archive');
        throw err;
      });

    const customMetadata: Metadata = {
      docType: 'text',
      CacheActionCompressionMethod: compressionMethod,
    };

    core.debug(`Metadata: ${JSON.stringify(customMetadata)}.`);

    await core
      .group('🌐 Uploading cache archive to bucket', async () => {
        console.log(`🔹 Uploading file '${targetFileName}'...`);

        const blockBlobClient =
          containerClient.getBlockBlobClient(targetFileName);
        await blockBlobClient.uploadFile(tmpFile.path);
        await blockBlobClient.setMetadata(customMetadata);
      })
      .catch((err) => {
        core.error('Failed to upload the file');
        throw err;
      });

    console.log('✅ Successfully saved cache.');
  });
}

void main().catch((err: Error) => {
  core.error(err);
  core.setFailed(err);
});
