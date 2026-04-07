#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { S3Client, CreateBucketCommand, HeadBucketCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const DEFAULT_LIBRARY_ROOT = path.resolve(__dirname, '../../Материалы Видеоуроки/ProManas 2025-2026');
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.m4v']);

function parseArgs(argv) {
  const options = {};
  for (const rawArg of argv) {
    if (!rawArg.startsWith('--')) continue;
    const [key, ...rest] = rawArg.slice(2).split('=');
    options[key] = rest.join('=') || 'true';
  }
  return options;
}

function normalizeKey(input) {
  return String(input || '')
    .split(path.sep)
    .join('/')
    .replace(/^\/+/, '');
}

function walkFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.DS_Store') continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) continue;

      files.push(fullPath);
    }
  }

  return files;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const fractionDigits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unit]}`;
}

async function cloudflareApi({ accountId, token, pathSuffix, method = 'GET', body }) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}${pathSuffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );

  const rawText = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = { raw: rawText };
  }

  if (!response.ok || payload?.success === false) {
    const errorMessage =
      payload?.errors?.[0]?.message ||
      payload?.messages?.[0] ||
      `Cloudflare API failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload?.result ?? null;
}

async function ensureBucketAndManagedDomain({ accountId, token, bucket }) {
  const existingBuckets = await cloudflareApi({
    accountId,
    token,
    pathSuffix: '/r2/buckets',
  });

  const alreadyExists = (existingBuckets?.buckets || []).some((item) => item.name === bucket);
  if (!alreadyExists) {
    await cloudflareApi({
      accountId,
      token,
      pathSuffix: '/r2/buckets',
      method: 'POST',
      body: { name: bucket },
    });
    console.log(`Created R2 bucket: ${bucket}`);
  } else {
    console.log(`R2 bucket exists: ${bucket}`);
  }

  const managed = await cloudflareApi({
    accountId,
    token,
    pathSuffix: `/r2/buckets/${encodeURIComponent(bucket)}/domains/managed`,
  });

  if (!managed?.enabled) {
    await cloudflareApi({
      accountId,
      token,
      pathSuffix: `/r2/buckets/${encodeURIComponent(bucket)}/domains/managed`,
      method: 'PUT',
      body: { enabled: true },
    });
  }

  const managedAfter = await cloudflareApi({
    accountId,
    token,
    pathSuffix: `/r2/buckets/${encodeURIComponent(bucket)}/domains/managed`,
  });

  const managedDomain = managedAfter?.domain;
  if (!managedDomain) {
    throw new Error('Could not resolve managed r2.dev domain');
  }

  return `https://${managedDomain}`;
}

async function ensureBucketViaS3(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (_error) {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

async function listExistingObjectSizes(client, bucket) {
  const map = new Map();
  let continuationToken = undefined;

  while (true) {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of page.Contents || []) {
      map.set(object.Key, Number(object.Size || 0));
    }

    if (!page.IsTruncated) {
      break;
    }

    continuationToken = page.NextContinuationToken;
  }

  return map;
}

async function uploadOneFile({ client, bucket, filePath, objectKey }) {
  const stat = fs.statSync(filePath);

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: objectKey,
      Body: fs.createReadStream(filePath),
      ContentType: getContentType(filePath),
      ContentLength: stat.size,
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024,
    leavePartsOnError: false,
  });

  await upload.done();
  return stat.size;
}

async function runWithConcurrency(tasks, limit, worker) {
  let index = 0;
  let active = 0;
  let rejected = false;

  return new Promise((resolve, reject) => {
    const launchNext = () => {
      if (rejected) return;

      while (active < limit && index < tasks.length) {
        const current = tasks[index];
        index += 1;
        active += 1;

        worker(current)
          .then(() => {
            active -= 1;
            if (index >= tasks.length && active === 0) {
              resolve();
              return;
            }
            launchNext();
          })
          .catch((error) => {
            rejected = true;
            reject(error);
          });
      }
    };

    if (tasks.length === 0) {
      resolve();
      return;
    }

    launchNext();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const accountId = String(args['account-id'] || process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = String(args['api-token'] || process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accessKeyId = String(args['access-key-id'] || process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(args['secret-access-key'] || process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(args.bucket || process.env.R2_BUCKET || 'promanas-manas-videos').trim();
  const endpoint = String(
    args.endpoint ||
    process.env.R2_S3_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ''),
  ).trim();
  const libraryRoot = path.resolve(args['library-root'] || process.env.VIDEO_LIBRARY_ROOT || DEFAULT_LIBRARY_ROOT);
  const concurrency = Number(args.concurrency || process.env.R2_UPLOAD_CONCURRENCY || 4);

  if (!accountId || !apiToken) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY');
  }
  if (!endpoint) {
    throw new Error('Missing R2_S3_ENDPOINT');
  }
  if (!fs.existsSync(libraryRoot)) {
    throw new Error(`Library root not found: ${libraryRoot}`);
  }

  const publicBaseUrl = await ensureBucketAndManagedDomain({
    accountId,
    token: apiToken,
    bucket,
  });

  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  await ensureBucketViaS3(s3, bucket);

  const allFiles = walkFiles(libraryRoot);
  let totalBytes = 0;
  for (const filePath of allFiles) {
    totalBytes += fs.statSync(filePath).size;
  }

  const existingObjects = await listExistingObjectSizes(s3, bucket);
  const uploadQueue = [];
  let skippedBytes = 0;

  for (const filePath of allFiles) {
    const relativePath = normalizeKey(path.relative(libraryRoot, filePath));
    const size = fs.statSync(filePath).size;
    const remoteSize = existingObjects.get(relativePath);

    if (remoteSize === size) {
      skippedBytes += size;
      continue;
    }

    uploadQueue.push({
      filePath,
      objectKey: relativePath,
      size,
    });
  }

  console.log(`Bucket: ${bucket}`);
  console.log(`Public base URL: ${publicBaseUrl}`);
  console.log(`Source files: ${allFiles.length} (${formatBytes(totalBytes)})`);
  console.log(`Already uploaded: ${allFiles.length - uploadQueue.length} (${formatBytes(skippedBytes)})`);
  console.log(`Need upload: ${uploadQueue.length}`);

  let uploadedCount = 0;
  let uploadedBytes = 0;
  let lastLoggedAt = Date.now();

  await runWithConcurrency(uploadQueue, Math.max(1, concurrency), async (item) => {
    await uploadOneFile({
      client: s3,
      bucket,
      filePath: item.filePath,
      objectKey: item.objectKey,
    });

    uploadedCount += 1;
    uploadedBytes += item.size;
    const now = Date.now();
    if (now - lastLoggedAt > 1200 || uploadedCount === uploadQueue.length) {
      lastLoggedAt = now;
      const done = uploadedCount + (allFiles.length - uploadQueue.length);
      console.log(`Uploaded ${done}/${allFiles.length} files (${formatBytes(skippedBytes + uploadedBytes)} / ${formatBytes(totalBytes)})`);
    }
  });

  console.log('Upload completed.');
  console.log(`R2_PUBLIC_BASE_URL=${publicBaseUrl}`);
}

main().catch((error) => {
  console.error('Upload to R2 failed:', error);
  process.exitCode = 1;
});
