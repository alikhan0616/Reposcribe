import { ChatOpenAI, ChatOpenAIFields } from '@langchain/openai';
import { env } from '../../config/env';

/**
 * Returns the chat model the agent uses for routing + synthesis.
 *
 * Backed by OpenRouter via its OpenAI-compatible API — swap models by changing
 * `LLM_MODEL` (e.g. `qwen/qwen-2.5-72b-instruct:free`). Never hardcode a model.
 */
export function getChatModel(overrides: Partial<ChatOpenAIFields> = {}): ChatOpenAI {
  return new ChatOpenAI({
    model: env.llmModel,
    // ChatOpenAI reads OPENAI_API_KEY if this is empty; give it the OpenRouter key.
    apiKey: env.openrouterApiKey || 'missing-openrouter-key',
    temperature: env.llmTemperature,
    configuration: {
      baseURL: env.openrouterBaseUrl,
      defaultHeaders: {
        // OpenRouter attribution headers (optional but recommended).
        'HTTP-Referer': 'https://github.com/reposcribe',
        'X-Title': 'RepoScribe',
      },
    },
    ...overrides,
  });
}
