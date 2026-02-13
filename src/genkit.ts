/**
 * Genkit Configuration
 *
 * Simplified Genkit integration for session and flow management
 * NOTE: Using Genkit primarily for its flow/session abstractions,
 * actual LLM calls go through our existing Ollama client
 */

import { defineFlow } from '@genkit-ai/flow';

// Re-export flow definition for use in agent
export { defineFlow };

// Simple model reference (not actually using Genkit's model system)
export const chatModel = {
  name: 'ollama/llama3.2',
  type: 'chat'
};

// Minimal ai object for compatibility
export const ai = {
  defineFlow,
  model: (name: string) => chatModel,
  generate: async ({ prompt }: { prompt: string; model?: any; config?: any }) => {
    // This is a placeholder - actual generation happens in agent.ts
    // through ollamaClient.chat()
    throw new Error('Use ollamaClient.chat() directly instead of ai.generate()');
  }
};
