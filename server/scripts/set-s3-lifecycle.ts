/**
 * Sets an S3 lifecycle rule so ingested repo data auto-expires after N days
 * (default 7). Works against AWS S3 and MinIO. Run: npm run s3:lifecycle
 */
import { PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '../src/services/ingest/s3';
import { env } from '../src/config/env';

const DAYS = parseInt(process.env.LIFECYCLE_DAYS ?? '7', 10);

async function main() {
  await getS3Client().send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: env.s3Bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'expire-ingested-repos',
            Status: 'Enabled',
            Filter: { Prefix: 'repos/' },
            Expiration: { Days: DAYS },
          },
        ],
      },
    }),
  );
  console.log(`Lifecycle set: repos/* expire after ${DAYS} days on bucket "${env.s3Bucket}".`);
}
main().catch((e) => {
  console.error('Failed to set lifecycle:', e);
  process.exit(1);
});
