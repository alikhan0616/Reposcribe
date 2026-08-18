/**
 * Standalone connectivity probe for the real external services.
 * Run: npx tsx scripts/check-apis.ts
 * Prints only booleans / shapes / short answers — never secrets.
 */
import { HumanMessage } from '@langchain/core/messages';
import { callHfFeatureExtraction } from '../src/services/embeddings/embedder';
import { getChatModel } from '../src/services/agent/llm';
import { env } from '../src/config/env';

async function checkHf(): Promise<void> {
  console.log(`\n[HF] model="${env.embeddingModel}" (expecting dim ${env.embeddingDim})`);
  try {
    const [vec] = await callHfFeatureExtraction(['hello world']);
    console.log(`[HF] OK — returned vector of length ${vec.length}`);
    if (vec.length !== env.embeddingDim) {
      console.log(
        `[HF] ⚠️  length ${vec.length} != EMBEDDING_DIM ${env.embeddingDim}; set EMBEDDING_DIM=${vec.length}`,
      );
    }
  } catch (e) {
    console.log(`[HF] FAILED — ${(e as Error).message}`);
  }
}

async function checkOpenRouter(): Promise<void> {
  console.log(`\n[OpenRouter] model="${env.llmModel}"`);
  try {
    const model = getChatModel();
    const res = await model.invoke([new HumanMessage('Reply with exactly: OK')]);
    const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    console.log(`[OpenRouter] OK — answer: ${text.slice(0, 80)}`);
  } catch (e) {
    console.log(`[OpenRouter] FAILED — ${(e as Error).message}`);
  }
}

async function main() {
  await checkHf();
  await checkOpenRouter();
  console.log('');
}
main();
