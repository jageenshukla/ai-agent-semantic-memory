import { v4 as uuidv4 } from 'uuid';
import { vectorStore } from './vectorStore.js';
import { ollamaClient } from '../models/ollama.js';
import type {
  Memory,
  VectorMemory,
  MemoryInput,
  SearchOptions,
  SearchResult,
  Interaction,
  MemoryStats,
  MemoryType,
  MemoryCategory,
  ReRankOptions
} from '../types/index.js';

/**
 * MemoryManager - High-level memory orchestration
 *
 * Features:
 * - Interaction storage with automatic fact extraction
 * - Semantic search with re-ranking
 * - Memory categorization
 * - Importance scoring
 * - Duplicate detection and merging
 */
export class MemoryManager {
  private initialized = false;

  constructor() {
    console.log('[MemoryManager] Initialized');
  }

  /**
   * Initialize the memory manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await vectorStore.initialize();
    this.initialized = true;

    console.log('[MemoryManager] Ready');
  }

  /**
   * Store a complete interaction (user + assistant messages)
   * @param interaction - Interaction to store
   */
  async addInteraction(interaction: Interaction): Promise<void> {
    this.ensureInitialized();

    try {
      // 1. Store the full conversation turn
      const conversationMemory: MemoryInput = {
        userId: interaction.userId,
        content: `User: ${interaction.userMessage}\nAssistant: ${interaction.assistantMessage}`,
        type: 'conversation' as MemoryType,
        category: await this.categorizeMessage(interaction.userMessage),
        sessionId: interaction.sessionId,
        importance: 0.5,
        metadata: {
          userMessage: interaction.userMessage,
          assistantMessage: interaction.assistantMessage,
          ...interaction.metadata
        }
      };

      await this.addMemory(conversationMemory);

      // 2. Extract key facts from the conversation
      await this.extractAndStoreKeyFacts(interaction);

      console.log(`[MemoryManager] Stored interaction for user: ${interaction.userId}`);
    } catch (error) {
      console.error('[MemoryManager] Add interaction error:', error);
      throw error;
    }
  }

  /**
   * Add a single memory
   * @param memory - Memory to add
   * @returns Memory ID
   */
  async addMemory(memory: MemoryInput): Promise<string> {
    this.ensureInitialized();

    try {
      const id = uuidv4();

      // Generate embedding for the content
      const embedding = await ollamaClient.generateEmbedding(memory.content);

      // Calculate importance if not provided
      const importance = memory.importance !== undefined
        ? memory.importance
        : this.calculateImportance(memory as Memory);

      const vectorMemory: VectorMemory = {
        id,
        userId: memory.userId,
        content: memory.content,
        embedding,
        type: memory.type,
        category: memory.category,
        timestamp: Date.now(),
        sessionId: memory.sessionId,
        importance,
        metadata: memory.metadata
      };

      // Check for duplicates
      const duplicates = await this.findSimilarMemories(vectorMemory);

      if (duplicates.length > 0 && duplicates[0].relevance > 0.95) {
        console.log(`[MemoryManager] Duplicate memory detected, skipping: ${id}`);
        return duplicates[0].memory.id;
      }

      await vectorStore.addMemory(vectorMemory);

      return id;
    } catch (error) {
      console.error('[MemoryManager] Add memory error:', error);
      throw error;
    }
  }

  /**
   * Search for relevant memories
   * @param userId - User ID to search for
   * @param query - Search query
   * @param options - Search options
   * @returns Array of relevant memories
   */
  async searchRelevantMemories(
    userId: string,
    query: string,
    options?: SearchOptions
  ): Promise<Memory[]> {
    this.ensureInitialized();

    const limit = options?.limit || 5;
    const threshold = options?.threshold || 0.7;

    try {
      // Search vector store
      let results = await vectorStore.searchMemories(query, userId, limit * 2);

      // Filter by category if specified
      if (options?.category) {
        results = results.filter(r => r.memory.category === options.category);
      }

      // Filter by relevance threshold
      results = results.filter(r => r.relevance >= threshold);

      // Re-rank results
      const reRankedResults = this.reRankResults(results, {
        similarityWeight: 0.5,
        importanceWeight: 0.3,
        recencyWeight: 0.2
      });

      // Limit results
      const finalResults = reRankedResults.slice(0, limit);

      // Expand with related memories if requested
      if (options?.includeRelated && finalResults.length > 0) {
        // TODO: Implement related memory expansion
      }

      return finalResults.map(r => r.memory);
    } catch (error) {
      console.error('[MemoryManager] Search error:', error);
      return [];
    }
  }

  /**
   * Get recent memories for a user
   * @param userId - User ID
   * @param limit - Maximum number of memories
   * @returns Array of recent memories
   */
  async getRecentMemories(userId: string, limit: number = 10): Promise<Memory[]> {
    this.ensureInitialized();

    try {
      // Use a generic query to get all memories
      const results = await vectorStore.searchMemories('', userId, limit * 2);

      // Sort by timestamp (most recent first)
      const sorted = results
        .map(r => r.memory)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      return sorted;
    } catch (error) {
      console.error('[MemoryManager] Get recent memories error:', error);
      return [];
    }
  }

  /**
   * Get memories by category
   * @param userId - User ID
   * @param category - Memory category
   * @returns Array of memories in that category
   */
  async getMemoriesByCategory(userId: string, category: MemoryCategory): Promise<Memory[]> {
    this.ensureInitialized();

    return this.searchRelevantMemories(userId, '', {
      category,
      limit: 20,
      threshold: 0
    });
  }

  /**
   * Delete all memories for a user (GDPR compliance)
   * @param userId - User ID whose data to delete
   */
  async deleteUserData(userId: string): Promise<void> {
    this.ensureInitialized();

    await vectorStore.deleteUserMemories(userId);
    console.log(`[MemoryManager] Deleted all data for user: ${userId}`);
  }

  /**
   * Get memory statistics for a user
   * @param userId - User ID
   * @returns Memory statistics
   */
  async getMemoryStats(userId: string): Promise<MemoryStats> {
    this.ensureInitialized();

    try {
      // Get all memories for user
      const memories = await this.getRecentMemories(userId, 1000);

      // Count by type
      const memoryByType: Record<MemoryType, number> = {
        conversation: 0,
        extracted_fact: 0,
        preference: 0,
        sentiment: 0,
        event: 0
      };

      // Count by category
      const memoryByCategory: Record<MemoryCategory, number> = {
        bug_report: 0,
        feature_request: 0,
        question: 0,
        feedback: 0,
        technical: 0,
        general: 0
      };

      let totalImportance = 0;
      let oldestTimestamp = Date.now();
      let newestTimestamp = 0;

      memories.forEach(memory => {
        memoryByType[memory.type]++;
        memoryByCategory[memory.category]++;
        totalImportance += memory.importance;
        oldestTimestamp = Math.min(oldestTimestamp, memory.timestamp);
        newestTimestamp = Math.max(newestTimestamp, memory.timestamp);
      });

      return {
        totalMemories: memories.length,
        memoryByType,
        memoryByCategory,
        avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
        oldestMemory: oldestTimestamp,
        newestMemory: newestTimestamp
      };
    } catch (error) {
      console.error('[MemoryManager] Get stats error:', error);
      throw error;
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Ensure the manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MemoryManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Extract and store key facts from an interaction
   * @param interaction - Interaction to extract facts from
   */
  private async extractAndStoreKeyFacts(interaction: Interaction): Promise<void> {
    // Simple keyword-based extraction for now
    // TODO: Use LLM for more sophisticated extraction

    const userMessage = interaction.userMessage.toLowerCase();
    const facts: MemoryInput[] = [];

    // Extract explicit "remember" commands (HIGHEST PRIORITY)
    if (userMessage.includes('remember') || userMessage.includes('my name is') ||
        userMessage.includes('call me') || userMessage.includes('i am ')) {
      // Extract the specific thing to remember
      let rememberWhat = interaction.userMessage;

      // Try to extract just the key information
      if (userMessage.includes('my name is')) {
        const match = interaction.userMessage.match(/my name is ([a-zA-Z]+)/i);
        if (match) {
          rememberWhat = `Customer's name is ${match[1]}`;
        }
      } else if (userMessage.includes('call me')) {
        const match = interaction.userMessage.match(/call me ([a-zA-Z]+)/i);
        if (match) {
          rememberWhat = `Customer prefers to be called ${match[1]}`;
        }
      } else if (userMessage.includes('i am ')) {
        const match = interaction.userMessage.match(/i am ([a-zA-Z]+)/i);
        if (match && !['a', 'the', 'an', 'having', 'getting'].includes(match[1].toLowerCase())) {
          rememberWhat = `Customer is ${match[1]}`;
        }
      }

      facts.push({
        userId: interaction.userId,
        content: rememberWhat,
        type: 'preference' as MemoryType,
        category: 'general' as MemoryCategory,
        sessionId: interaction.sessionId,
        importance: 0.95  // VERY HIGH - explicit memory request
      });
    }

    // Extract bug reports
    if (userMessage.includes('broken') || userMessage.includes('not working') ||
        userMessage.includes('error') || userMessage.includes('bug')) {
      facts.push({
        userId: interaction.userId,
        content: `Customer reported: ${interaction.userMessage}`,
        type: 'event' as MemoryType,
        category: 'bug_report' as MemoryCategory,
        sessionId: interaction.sessionId,
        importance: 0.8
      });
    }

    // Extract feature requests
    if (userMessage.includes('want') || userMessage.includes('need') ||
        userMessage.includes('would like') || userMessage.includes('feature')) {
      facts.push({
        userId: interaction.userId,
        content: `Customer requested: ${interaction.userMessage}`,
        type: 'event' as MemoryType,
        category: 'feature_request' as MemoryCategory,
        sessionId: interaction.sessionId,
        importance: 0.7
      });
    }

    // Extract preferences
    if (userMessage.includes('prefer') || userMessage.includes('like to') ||
        userMessage.includes('developer') || userMessage.includes('technical')) {
      facts.push({
        userId: interaction.userId,
        content: `Customer preference: ${interaction.userMessage}`,
        type: 'preference' as MemoryType,
        category: 'general' as MemoryCategory,
        sessionId: interaction.sessionId,
        importance: 0.6
      });
    }

    // Extract company/organization info
    if (userMessage.includes('company') || userMessage.includes('organization') ||
        userMessage.includes('work for') || userMessage.includes('work at')) {
      facts.push({
        userId: interaction.userId,
        content: `Customer info: ${interaction.userMessage}`,
        type: 'preference' as MemoryType,
        category: 'general' as MemoryCategory,
        sessionId: interaction.sessionId,
        importance: 0.7
      });
    }

    // Store extracted facts
    for (const fact of facts) {
      await this.addMemory(fact);
    }
  }

  /**
   * Categorize a message
   * @param message - Message to categorize
   * @returns Category
   */
  private async categorizeMessage(message: string): Promise<MemoryCategory> {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('bug') || lowerMessage.includes('broken') ||
        lowerMessage.includes('error') || lowerMessage.includes('not working')) {
      return 'bug_report';
    }

    if (lowerMessage.includes('feature') || lowerMessage.includes('add') ||
        lowerMessage.includes('want') || lowerMessage.includes('need')) {
      return 'feature_request';
    }

    if (lowerMessage.includes('how') || lowerMessage.includes('what') ||
        lowerMessage.includes('why') || lowerMessage.includes('?')) {
      return 'question';
    }

    if (lowerMessage.includes('great') || lowerMessage.includes('love') ||
        lowerMessage.includes('hate') || lowerMessage.includes('terrible')) {
      return 'feedback';
    }

    if (lowerMessage.includes('api') || lowerMessage.includes('code') ||
        lowerMessage.includes('technical') || lowerMessage.includes('developer')) {
      return 'technical';
    }

    return 'general';
  }

  /**
   * Calculate importance score for a memory
   * @param memory - Memory to score
   * @returns Importance score (0-1)
   */
  private calculateImportance(memory: Memory): number {
    let score = 0.5; // Base score

    // Bug reports are important
    if (memory.category === 'bug_report') {
      score += 0.3;
    }

    // Feature requests are moderately important
    if (memory.category === 'feature_request') {
      score += 0.2;
    }

    // Preferences are important for personalization
    if (memory.type === 'preference') {
      score += 0.2;
    }

    // Events are important
    if (memory.type === 'event') {
      score += 0.1;
    }

    // Cap at 1.0
    return Math.min(score, 1.0);
  }

  /**
   * Find similar memories (for duplicate detection)
   * @param memory - Memory to find duplicates of
   * @returns Similar memories
   */
  private async findSimilarMemories(memory: VectorMemory): Promise<SearchResult[]> {
    try {
      return await vectorStore.searchByEmbedding(
        memory.embedding,
        { userId: memory.userId, type: memory.type },
        5
      );
    } catch (error) {
      console.error('[MemoryManager] Find similar error:', error);
      return [];
    }
  }

  /**
   * Re-rank search results by multiple factors
   * @param results - Search results to re-rank
   * @param options - Re-ranking options
   * @returns Re-ranked results
   */
  private reRankResults(results: SearchResult[], options: ReRankOptions): SearchResult[] {
    const now = Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;

    const similarityWeight = options.similarityWeight || 0.5;
    const importanceWeight = options.importanceWeight || 0.3;
    const recencyWeight = options.recencyWeight || 0.2;

    // Calculate composite scores
    const scored = results.map(result => {
      const memory = result.memory;

      // Similarity score (0-1)
      const similarityScore = result.relevance;

      // Importance score (0-1)
      const importanceScore = memory.importance;

      // Recency score (0-1, decays over one year)
      const ageInMs = now - memory.timestamp;
      const recencyScore = Math.max(0, 1 - (ageInMs / oneYear));

      // Composite score
      const compositeScore =
        (similarityScore * similarityWeight) +
        (importanceScore * importanceWeight) +
        (recencyScore * recencyWeight);

      return {
        ...result,
        compositeScore
      };
    });

    // Sort by composite score
    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    return scored;
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();
