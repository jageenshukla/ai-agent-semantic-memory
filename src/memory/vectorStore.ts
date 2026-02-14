import { ChromaClient, Collection } from 'chromadb';
import { v4 as uuidv4 } from 'uuid';
import { ollamaClient } from '../models/ollama.js';
import type { VectorMemory, Memory, SearchResult, Filters } from '../types/index.js';

/**
 * VectorStore - ChromaDB integration for semantic memory storage
 *
 * Features:
 * - Vector storage with ChromaDB
 * - Semantic search with cosine similarity
 * - User-scoped memory isolation
 * - Batch operations for efficiency
 * - Metadata filtering
 */
export class VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private readonly collectionName = 'customer_support_memories';

  private initialized = false;

  constructor() {
    // Initialize ChromaDB client
    // ChromaDB runs in-memory by default, persists to ./chroma_data/
    this.client = new ChromaClient();

    console.log('[VectorStore] Initialized');
  }

  /**
   * Initialize the vector store (create/load collection)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[VectorStore] Already initialized');
      return;
    }

    try {
      // Create or get existing collection
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: {
          'hnsw:space': 'cosine',           // Cosine similarity metric
          'hnsw:construction_ef': 200,      // Build quality (higher = better quality)
          'hnsw:search_ef': 50,             // Search quality
          'hnsw:M': 16                      // Connections per node
        }
      });

      this.initialized = true;
      const count = await this.collection.count();

      console.log('[VectorStore] Collection ready');
      console.log(`  Name: ${this.collectionName}`);
      console.log(`  Existing memories: ${count}`);
    } catch (error) {
      console.error('[VectorStore] Initialization failed:', error);
      throw new Error(`Failed to initialize vector store: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a single memory to the vector store
   * @param memory - Memory object with embedding
   */
  async addMemory(memory: VectorMemory): Promise<void> {
    this.ensureInitialized();

    try {
      await this.collection!.add({
        ids: [memory.id],
        embeddings: [memory.embedding],
        documents: [memory.content],
        metadatas: [{
          userId: memory.userId,
          type: memory.type,
          category: memory.category,
          timestamp: memory.timestamp,
          sessionId: memory.sessionId || '',
          importance: memory.importance,
          ...memory.metadata
        }]
      });

      console.log(`[VectorStore] Added memory: ${memory.id} (${memory.category})`);
    } catch (error) {
      console.error('[VectorStore] Add memory error:', error);
      throw new Error(`Failed to add memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add multiple memories in batch
   * @param memories - Array of memory objects with embeddings
   */
  async addMemories(memories: VectorMemory[]): Promise<void> {
    this.ensureInitialized();

    if (memories.length === 0) {
      return;
    }

    try {
      await this.collection!.add({
        ids: memories.map(m => m.id),
        embeddings: memories.map(m => m.embedding),
        documents: memories.map(m => m.content),
        metadatas: memories.map(m => ({
          userId: m.userId,
          type: m.type,
          category: m.category,
          timestamp: m.timestamp,
          sessionId: m.sessionId || '',
          importance: m.importance,
          ...m.metadata
        }))
      });

      console.log(`[VectorStore] Added ${memories.length} memories in batch`);
    } catch (error) {
      console.error('[VectorStore] Batch add error:', error);
      throw new Error(`Failed to add memories in batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for memories using a text query
   * @param query - Search query string
   * @param userId - User ID to filter by
   * @param limit - Maximum number of results
   * @returns Array of search results with relevance scores
   */
  async searchMemories(
    query: string,
    userId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    this.ensureInitialized();

    try {
      // Generate embedding for query
      const queryEmbedding = await ollamaClient.generateEmbedding(query);

      // Search with user filter
      const results = await this.collection!.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        where: { userId }
      });

      // Format results
      return this.formatSearchResults(results);
    } catch (error) {
      console.error('[VectorStore] Search error:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search using a pre-computed embedding
   * @param embedding - Query embedding vector
   * @param filters - Metadata filters
   * @param limit - Maximum number of results
   * @returns Array of search results
   */
  async searchByEmbedding(
    embedding: number[],
    filters: Filters,
    limit: number = 5
  ): Promise<SearchResult[]> {
    this.ensureInitialized();

    try {
      // Build where clause from filters
      const where: any = {};

      if (filters.userId) where.userId = filters.userId;
      if (filters.category) where.category = filters.category;
      if (filters.type) where.type = filters.type;

      // ChromaDB doesn't support range queries directly in where clause
      // We'll filter by timestamp after retrieving results

      // Only add where clause if we have filters
      const queryOptions: any = {
        queryEmbeddings: [embedding],
        nResults: limit * 2  // Get more, filter after
      };

      if (Object.keys(where).length > 0) {
        queryOptions.where = where;
      }

      const results = await this.collection!.query(queryOptions);

      let searchResults = this.formatSearchResults(results);

      // Filter by timestamp range if specified
      if (filters.timestampGte || filters.timestampLte) {
        searchResults = searchResults.filter(result => {
          const timestamp = result.memory.timestamp;

          if (filters.timestampGte && timestamp < filters.timestampGte) {
            return false;
          }

          if (filters.timestampLte && timestamp > filters.timestampLte) {
            return false;
          }

          return true;
        });
      }

      return searchResults.slice(0, limit);
    } catch (error) {
      console.error('[VectorStore] Search by embedding error:', error);
      throw new Error(`Search by embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a specific memory by ID
   * @param memoryId - Memory ID to delete
   */
  async deleteMemory(memoryId: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.collection!.delete({
        ids: [memoryId]
      });

      console.log(`[VectorStore] Deleted memory: ${memoryId}`);
    } catch (error) {
      console.error('[VectorStore] Delete memory error:', error);
      throw new Error(`Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete all memories for a specific user
   * @param userId - User ID whose memories to delete
   */
  async deleteUserMemories(userId: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.collection!.delete({
        where: { userId }
      });

      console.log(`[VectorStore] Deleted all memories for user: ${userId}`);
    } catch (error) {
      console.error('[VectorStore] Delete user memories error:', error);
      throw new Error(`Failed to delete user memories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a memory by ID
   * @param memoryId - Memory ID
   * @returns Memory object or null if not found
   */
  async getMemoryById(memoryId: string): Promise<VectorMemory | null> {
    this.ensureInitialized();

    try {
      const results = await this.collection!.get({
        ids: [memoryId],
        include: ['embeddings', 'documents', 'metadatas']
      });

      if (results.ids.length === 0) {
        return null;
      }

      return {
        id: results.ids[0],
        userId: (results.metadatas?.[0] as any)?.userId || '',
        content: results.documents?.[0] || '',
        embedding: results.embeddings?.[0] || [],
        type: (results.metadatas?.[0] as any)?.type || 'conversation',
        category: (results.metadatas?.[0] as any)?.category || 'general',
        timestamp: (results.metadatas?.[0] as any)?.timestamp || Date.now(),
        sessionId: (results.metadatas?.[0] as any)?.sessionId,
        importance: (results.metadatas?.[0] as any)?.importance || 0.5,
        metadata: results.metadatas?.[0] as any
      };
    } catch (error) {
      console.error('[VectorStore] Get memory error:', error);
      return null;
    }
  }

  /**
   * Get all memories for a specific user
   * @param userId - User ID to get memories for
   * @returns Array of memories for that user
   */
  async getUserMemories(userId: string): Promise<Memory[]> {
    this.ensureInitialized();

    try {
      const results = await this.collection!.get({
        where: { userId },
        include: ['documents', 'metadatas']
      });

      const memories: Memory[] = [];

      for (let i = 0; i < results.ids.length; i++) {
        const metadata = results.metadatas?.[i] as any;

        memories.push({
          id: results.ids[i],
          userId: metadata?.userId || '',
          content: results.documents?.[i] || '',
          type: metadata?.type || 'conversation',
          category: metadata?.category || 'general',
          timestamp: metadata?.timestamp || Date.now(),
          sessionId: metadata?.sessionId,
          importance: metadata?.importance || 0.5,
          metadata
        });
      }

      return memories;
    } catch (error) {
      console.error('[VectorStore] Get user memories error:', error);
      return [];
    }
  }

  /**
   * Get count of memories (optionally filtered by user)
   * @param userId - Optional user ID to filter by
   * @returns Count of memories
   */
  async getMemoryCount(userId?: string): Promise<number> {
    this.ensureInitialized();

    try {
      if (userId) {
        const results = await this.collection!.get({
          where: { userId }
        });
        return results.ids.length;
      } else {
        return await this.collection!.count();
      }
    } catch (error) {
      console.error('[VectorStore] Count error:', error);
      return 0;
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Ensure the vector store is initialized
   * @throws Error if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.collection) {
      throw new Error('VectorStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Format ChromaDB query results into SearchResult objects
   * @param results - Raw results from ChromaDB
   * @returns Formatted search results
   */
  private formatSearchResults(results: any): SearchResult[] {
    const searchResults: SearchResult[] = [];

    if (!results.ids || results.ids[0].length === 0) {
      return searchResults;
    }

    const ids = results.ids[0];
    const documents = results.documents[0];
    const metadatas = results.metadatas[0];
    const distances = results.distances[0];

    for (let i = 0; i < ids.length; i++) {
      const metadata = metadatas[i];
      const distance = distances[i];
      const relevance = 1 - distance;  // Convert distance to relevance score

      const memory: Memory = {
        id: ids[i],
        userId: metadata.userId || '',
        content: documents[i],
        type: metadata.type || 'conversation',
        category: metadata.category || 'general',
        timestamp: metadata.timestamp || Date.now(),
        sessionId: metadata.sessionId || undefined,
        importance: metadata.importance || 0.5,
        relevance,
        metadata
      };

      searchResults.push({
        memory,
        distance,
        relevance
      });
    }

    return searchResults;
  }
}

// Export singleton instance
export const vectorStore = new VectorStore();
