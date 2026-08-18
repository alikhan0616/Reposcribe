import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';
import type { RepoManifest } from '../../types';

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      region: env.awsRegion || 'us-east-1',
      ...(env.s3Endpoint
        ? { endpoint: env.s3Endpoint, forcePathStyle: env.s3ForcePathStyle }
        : {}),
      ...(env.awsAccessKeyId && env.awsSecretAccessKey
        ? {
            credentials: {
              accessKeyId: env.awsAccessKeyId,
              secretAccessKey: env.awsSecretAccessKey,
            },
          }
        : {}),
    });
  }
  return client;
}

export function rawKey(repoId: string, filepath: string): string {
  return `repos/${repoId}/raw/${filepath}`;
}

export function manifestKey(repoId: string): string {
  return `repos/${repoId}/manifest.json`;
}

/** Uploads a source file's text to `repos/{repoId}/raw/{filepath}`. */
export async function uploadRawFile(
  repoId: string,
  filepath: string,
  content: string,
): Promise<string> {
  const key = rawKey(repoId, filepath);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: content,
      ContentType: 'text/plain; charset=utf-8',
    }),
  );
  return key;
}

/** Writes the repo manifest JSON. */
export async function uploadManifest(manifest: RepoManifest): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: manifestKey(manifest.repoId),
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }),
  );
}

/** Fetches and parses the repo manifest (`repos/{repoId}/manifest.json`). */
export async function getManifest(repoId: string): Promise<RepoManifest> {
  const obj = await getS3Client().send(
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: manifestKey(repoId) }),
  );
  const body = await obj.Body!.transformToString();
  return JSON.parse(body) as RepoManifest;
}

/** Fetches a raw source file's text from `repos/{repoId}/raw/{filepath}`. */
export async function getRawFile(repoId: string, filepath: string): Promise<string> {
  const obj = await getS3Client().send(
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: rawKey(repoId, filepath) }),
  );
  return obj.Body!.transformToString();
}

/** Presigned GET URL for the frontend to fetch a raw file directly. */
export async function presignRawFile(
  repoId: string,
  filepath: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: rawKey(repoId, filepath) }),
    { expiresIn },
  );
}

/** Deletes every object under a repo's prefix (raw files + manifest). */
export async function deleteRepoFiles(repoId: string): Promise<void> {
  const s3 = getS3Client();
  const prefix = `repos/${repoId}/`;
  let token: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.s3Bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: env.s3Bucket,
          Delete: { Objects: objects },
        }),
      );
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}
