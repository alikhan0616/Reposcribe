import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralized, typed access to environment configuration.
 * Phase 1 only needs PORT and CLIENT_ORIGIN; the rest are declared here
 * (and in .env.example) so later phases can wire them in without re-plumbing.
 */
export const env = {
  port: parseInt(process.env.PORT ?? '5000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // Comma-separated list of allowed client origins for CORS.
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // The following are unused in Phase 1 but reserved for later phases.
  awsRegion: process.env.AWS_REGION ?? '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  s3Bucket: process.env.S3_BUCKET ?? 'reposcribe-repos',
  // Custom S3 endpoint for local dev against MinIO / LocalStack.
  s3Endpoint: process.env.S3_ENDPOINT ?? '',
  s3ForcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'false') === 'true',
  qdrantUrl: process.env.QDRANT_URL ?? 'http://localhost:6333',
  qdrantApiKey: process.env.QDRANT_API_KEY ?? '',
  qdrantCollection: process.env.QDRANT_COLLECTION ?? 'reposcribe_chunks',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  hfApiKey: process.env.HF_API_KEY ?? '',

  // ─── Embeddings (HF Inference API — hf-inference router) ───
  // jina-embeddings-v2-base-code is NOT served by the hf-inference provider;
  // bge-base-en-v1.5 is, and returns dim 768.
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'BAAI/bge-base-en-v1.5',
  embeddingDim: parseInt(process.env.EMBEDDING_DIM ?? '768', 10),
  embeddingBatchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE ?? '32', 10),
  // Base is joined as `${base}${model}/pipeline/feature-extraction`.
  hfEmbeddingBase:
    process.env.HF_EMBEDDING_BASE ?? 'https://router.huggingface.co/hf-inference/models/',

  // ─── Agent LLM (OpenRouter, OpenAI-compatible) ───
  llmProvider: process.env.LLM_PROVIDER ?? 'openrouter',
  llmModel: process.env.LLM_MODEL ?? 'poolside/laguna-m.1:free',
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  llmTemperature: parseFloat(process.env.LLM_TEMPERATURE ?? '0.1'),
  retrievalTopK: parseInt(process.env.RETRIEVAL_TOP_K ?? '8', 10),

  // ─── Web search tool (optional Tavily; falls back to DuckDuckGo) ───
  tavilyApiKey: process.env.TAVILY_API_KEY ?? '',

  githubToken: process.env.GITHUB_TOKEN ?? '',

  // ─── Auth (Clerk — optional; enforced only when a secret key is set) ───
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? '',
} as const;
