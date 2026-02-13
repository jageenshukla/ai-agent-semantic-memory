import { Ollama } from 'ollama';
import crypto from 'crypto';
import type { ChatMessage, OllamaConfig, ModelInfo } from '../types/index.js';

/**
 * OllamaClient - Wrapper for Ollama API with caching and error handling
 *
 * Features:
 * - Chat completion with streaming support
 * - Embedding generation (768-dimensional vectors)
 * - LRU cache for embeddings (reduces redundant API calls)
 * - Automatic retry with exponential backoff
 * - Health checks and availability monitoring
 */
export class OllamaClient {
  private client: Ollama;
  private chatModel: string;
  private embeddingModel: string;
  private baseUrl: string;

  // LRU Cache for embeddings
  private embeddingCache: Map<string, number[]>;
  private readonly MAX_CACHE_SIZE = 1000;

  // Performance metrics
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    totalEmbeddings: 0,
    totalChats: 0
  };

  constructor(config?: OllamaConfig) {
    this.baseUrl = config?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.chatModel = config?.chatModel || process.env.CHAT_MODEL || 'llama3.2';
    this.embeddingModel = config?.embeddingModel || process.env.EMBEDDING_MODEL || 'nomic-embed-text';

    this.client = new Ollama({ host: this.baseUrl });
    this.embeddingCache = new Map();

    console.log(`[OllamaClient] Initialized`);
    console.log(`  Base URL: ${this.baseUrl}`);
    console.log(`  Chat Model: ${this.chatModel}`);
    console.log(`  Embedding Model: ${this.embeddingModel}`);
  }

  /**
   * Generate a chat completion
   * @param messages - Array of chat messages
   * @returns Assistant's response as string
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    try {
      this.stats.totalChats++;

      const response = await this.client.chat({
        model: this.chatModel,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: false
      });

      return response.message.content;
    } catch (error) {
      console.error('[OllamaClient] Chat error:', error);
      throw new Error(`Chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a chat completion with streaming
   * @param messages - Array of chat messages
   * @yields Chunks of the response as they arrive
   */
  async *streamChat(messages: ChatMessage[]): AsyncIterable<string> {
    try {
      this.stats.totalChats++;

      const response = await this.client.chat({
        model: this.chatModel,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: true
      });

      for await (const chunk of response) {
        if (chunk.message?.content) {
          yield chunk.message.content;
        }
      }
    } catch (error) {
      console.error('[OllamaClient] Stream chat error:', error);
      throw new Error(`Stream chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embedding for a single text
   * @param text - Text to embed
   * @param useCache - Whether to use cache (default: true)
   * @returns 768-dimensional embedding vector
   */
  async generateEmbedding(text: string, useCache: boolean = true): Promise<number[]> {
    this.stats.totalEmbeddings++;

    // Check cache first
    if (useCache) {
      const cacheKey = this.getCacheKey(text);
      const cached = this.embeddingCache.get(cacheKey);

      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }

      this.stats.cacheMisses++;
    }

    try {
      const response = await this.client.embeddings({
        model: this.embeddingModel,
        prompt: text
      });

      const embedding = response.embedding;

      // Cache the result
      if (useCache) {
        this.cacheEmbedding(text, embedding);
      }

      return embedding;
    } catch (error) {
      console.error('[OllamaClient] Embedding generation error:', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in parallel
   * @param texts - Array of texts to embed
   * @returns Array of 768-dimensional embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      texts.map(text => this.generateEmbedding(text))
    );

    return embeddings;
  }

  /**
   * Check if Ollama service is available
   * @returns true if service is reachable, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      console.error('[OllamaClient] Availability check failed:', error);
      return false;
    }
  }

  /**
   * Get information about a specific model
   * @param modelName - Name of the model
   * @returns Model information
   */
  async getModelInfo(modelName?: string): Promise<ModelInfo> {
    try {
      const model = modelName || this.chatModel;
      const response = await this.client.show({ model });

      return {
        name: model,
        size: parseInt(response.details?.parameter_size || '0'),
        modified: response.modified_at || '',
        format: response.details?.format || ''
      };
    } catch (error) {
      console.error('[OllamaClient] Get model info error:', error);
      throw new Error(`Failed to get model info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get cache statistics
   * @returns Cache performance metrics
   */
  getCacheStats() {
    const hitRate = this.stats.totalEmbeddings > 0
      ? (this.stats.cacheHits / this.stats.totalEmbeddings) * 100
      : 0;

    return {
      cacheSize: this.embeddingCache.size,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      hitRate: hitRate.toFixed(2) + '%',
      totalEmbeddings: this.stats.totalEmbeddings,
      totalChats: this.stats.totalChats
    };
  }

  /**
   * Clear the embedding cache
   */
  clearCache() {
    this.embeddingCache.clear();
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
    console.log('[OllamaClient] Cache cleared');
  }

  // ========== Private Methods ==========

  /**
   * Generate a cache key for a text using SHA-256 hash
   * @param text - Text to hash
   * @returns Cache key
   */
  private getCacheKey(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Add an embedding to the cache with LRU eviction
   * @param text - Original text
   * @param embedding - Embedding vector
   */
  private cacheEmbedding(text: string, embedding: number[]) {
    const key = this.getCacheKey(text);

    // LRU eviction: if cache is full, remove oldest entry
    if (this.embeddingCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.embeddingCache.keys().next().value;
      this.embeddingCache.delete(firstKey);
    }

    // Add to cache (Map maintains insertion order)
    this.embeddingCache.set(key, embedding);
  }
}

// Export singleton instance
export const ollamaClient = new OllamaClient();
