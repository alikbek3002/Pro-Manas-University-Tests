/**
 * videoUploader.js
 * Handles multipart uploads to Cloudflare R2 for video files.
 * Uses @aws-sdk/lib-storage for efficient streaming uploads.
 */

const { S3Client, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const DEFAULT_R2_BUCKET = 'promanas-manas-videos';

let cachedClient = null;
let cachedFingerprint = '';

function resolveR2Endpoint() {
  const endpointFromEnv = String(process.env.R2_S3_ENDPOINT || '').trim();
  if (endpointFromEnv) return endpointFromEnv;

  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!accountId) return '';

  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getR2Config() {
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.R2_BUCKET || DEFAULT_R2_BUCKET).trim();
  const endpoint = resolveR2Endpoint();

  return { accessKeyId, secretAccessKey, bucket, endpoint };
}

function isR2Configured() {
  const { accessKeyId, secretAccessKey, bucket, endpoint } = getR2Config();
  return Boolean(accessKeyId && secretAccessKey && bucket && endpoint);
}

function getR2Client() {
  const config = getR2Config();
  if (!isR2Configured()) {
    throw new Error('R2 is not configured. Check R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_S3_ENDPOINT.');
  }

  const fingerprint = JSON.stringify(config);
  if (cachedClient && cachedFingerprint === fingerprint) {
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
  cachedFingerprint = fingerprint;

  return { client: cachedClient, config };
}

/**
 * Upload a video to R2.
 * @param {Buffer|import('stream').Readable} fileBody - Video data as Buffer or Readable stream
 * @param {string} objectKey - The R2 object key (path in bucket)
 * @param {string} contentType - MIME type of the video
 * @returns {Promise<{ objectKey: string, publicUrl: string }>}
 */
async function uploadVideoToR2(fileBody, objectKey, contentType) {
  const { client, config } = getR2Client();

  const upload = new Upload({
    client,
    params: {
      Bucket: config.bucket,
      Key: objectKey,
      Body: fileBody,
      ContentType: contentType || 'video/mp4',
    },
    queueSize: 4,
    partSize: 10 * 1024 * 1024, // 10 MB parts
    leavePartsOnError: false,
  });

  await upload.done();

  const publicBaseUrl = String(process.env.VIDEO_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const encodedKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const publicUrl = publicBaseUrl ? `${publicBaseUrl}/${encodedKey}` : null;

  return { objectKey, publicUrl };
}

/**
 * Delete a video object from R2.
 * @param {string} objectKey - The R2 object key to delete
 */
async function deleteVideoFromR2(objectKey) {
  const { client, config } = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    }),
  );
}

/**
 * Check if an object exists in R2.
 * @param {string} objectKey - The R2 object key
 * @returns {Promise<boolean>}
 */
async function objectExistsInR2(objectKey) {
  const { client, config } = getR2Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
      }),
    );
    return true;
  } catch (error) {
    if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

module.exports = {
  isR2Configured,
  uploadVideoToR2,
  deleteVideoFromR2,
  objectExistsInR2,
};
