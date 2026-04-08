const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const DEFAULT_R2_BUCKET = 'promanas-manas-videos';
const DEFAULT_PRESIGNED_TTL_SECONDS = 1800;
const MIN_PRESIGNED_TTL_SECONDS = 60;
const MAX_PRESIGNED_TTL_SECONDS = 60 * 60 * 24; // 24h

let cachedClient = null;
let cachedClientFingerprint = '';

function resolveR2Endpoint() {
  const endpointFromEnv = String(process.env.R2_S3_ENDPOINT || '').trim();
  if (endpointFromEnv) {
    return endpointFromEnv;
  }

  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!accountId) {
    return '';
  }

  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getR2Config() {
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.R2_BUCKET || DEFAULT_R2_BUCKET).trim();
  const endpoint = resolveR2Endpoint();

  return {
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
  };
}

function isPresignedEnabled() {
  const { accessKeyId, secretAccessKey, bucket, endpoint } = getR2Config();
  return Boolean(accessKeyId && secretAccessKey && bucket && endpoint);
}

function normalizeObjectKey(objectKey) {
  const raw = String(objectKey || '').trim();
  if (!raw) return '';

  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');

  if (!normalized) return '';

  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '..')) {
    return '';
  }

  return segments.join('/');
}

function normalizeExpiresIn(expiresInSeconds) {
  const value = Number(expiresInSeconds);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_PRESIGNED_TTL_SECONDS;
  }

  return Math.min(
    MAX_PRESIGNED_TTL_SECONDS,
    Math.max(MIN_PRESIGNED_TTL_SECONDS, Math.floor(value)),
  );
}

function getPresignerClient() {
  const config = getR2Config();
  if (!isPresignedEnabled()) {
    throw new Error('R2 presigned URLs are not configured');
  }

  const nextFingerprint = JSON.stringify({
    endpoint: config.endpoint,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });

  if (cachedClient && cachedClientFingerprint === nextFingerprint) {
    return { client: cachedClient, config };
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cachedClientFingerprint = nextFingerprint;

  return { client: cachedClient, config };
}

async function getPresignedVideoUrl(objectKey, expiresInSeconds = DEFAULT_PRESIGNED_TTL_SECONDS) {
  const normalizedKey = normalizeObjectKey(objectKey);
  if (!normalizedKey) {
    throw new Error('Invalid video object key for presigned URL');
  }

  const { client, config } = getPresignerClient();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: normalizedKey,
  });

  return getSignedUrl(client, command, {
    expiresIn: normalizeExpiresIn(expiresInSeconds),
  });
}

module.exports = {
  getPresignedVideoUrl,
  isPresignedEnabled,
};
