import { tool, StructuredToolInterface } from '@langchain/core/tools';
import type { ZodTypeAny } from 'zod';

export interface ToolConfig {
  name: string;
  description: string;
  schema: ZodTypeAny;
}

/**
 * Thin wrapper over LangChain's `tool()` that returns a plainly-typed
 * `StructuredToolInterface`. The `any` casts halt the TS2589 "excessively deep"
 * inference LangChain + zod trigger; runtime behavior is unchanged.
 */
export function defineTool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (input: any) => Promise<string>,
  config: ToolConfig,
): StructuredToolInterface {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tool as any)(fn, config) as unknown as StructuredToolInterface;
}
