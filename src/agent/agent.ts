import { memoryManager } from '../memory/memoryManager.js';
import { ollamaClient } from '../models/ollama.js';
import { buildContext, buildPrompt } from './prompts.js';
import { ai, chatModel } from '../genkit.js';
import { z } from 'zod';
import type { ChatResponse, Memory } from '../types/index.js';

/**
 * SupportAgent - Genkit-powered AI agent with session management
 *
 * Features:
 * - Genkit flows for structured agent interactions
 * - Session state management
 * - Context-aware responses with memory
 * - Performance tracking
 */

// ========== Schemas ==========

const ChatInputSchema = z.object({
  userId: z.string(),
  message: z.string(),
  sessionId: z.string()
});

const ChatOutputSchema = z.object({
  response: z.string(),
  context: z.array(z.any()),
  memoriesUsed: z.number(),
  timestamp: z.number(),
  metadata: z.object({
    responseTime: z.number(),
    relevanceScore: z.number()
  })
});

// ========== Session State ==========

interface SessionState {
  userId: string;
  messageCount: number;
  lastInteractionTime: number;
  recentMemories: Memory[];
}

const sessions = new Map<string, SessionState>();

// ========== Genkit Flow ==========

/**
 * Main chat flow using Genkit
 */
export const chatFlow = ai.defineFlow(
  {
    name: 'supportAgentChat',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async (input) => {
    const { userId, message, sessionId } = input;
    const startTime = Date.now();

    // Get or create session state
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        userId,
        messageCount: 0,
        lastInteractionTime: Date.now(),
        recentMemories: []
      };
      sessions.set(sessionId, session);
      console.log(`[ChatFlow] New session created: ${sessionId}`);
    }

    try {
      // 1. Retrieve relevant memories
      const memories = await memoryManager.searchRelevantMemories(userId, message, {
        limit: 5,
        threshold: 0.5
      });

      console.log(`[ChatFlow] Found ${memories.length} relevant memories for session ${sessionId}`);

      // 2. Build context from memories + session state
      const context = buildContext(memories);
      const sessionContext = buildSessionContext(session);
      const fullContext = `${context}\n\n${sessionContext}`;

      // 3. Generate response using Ollama
      const prompt = buildPrompt(fullContext, message);

      const chatMessages = [
        {
          role: 'user' as const,
          content: prompt
        }
      ];

      const response = await ollamaClient.chat(chatMessages);

      // 4. Store this interaction
      await memoryManager.addInteraction({
        userId,
        userMessage: message,
        assistantMessage: response,
        sessionId,
        timestamp: Date.now()
      });

      // 5. Update session state
      session.messageCount++;
      session.lastInteractionTime = Date.now();
      session.recentMemories = memories.slice(0, 3); // Keep last 3 memories

      // 6. Calculate metrics
      const responseTime = Date.now() - startTime;
      const avgRelevance = memories.length > 0
        ? memories.reduce((sum, m) => sum + (m.relevance || 0), 0) / memories.length
        : 0;

      console.log(`[ChatFlow] Response generated in ${responseTime}ms`);

      return {
        response,
        context: memories,
        memoriesUsed: memories.length,
        timestamp: Date.now(),
        metadata: {
          responseTime,
          relevanceScore: avgRelevance
        }
      };
    } catch (error) {
      console.error('[ChatFlow] Error:', error);
      throw error;
    }
  }
);

// ========== Helper Functions ==========

function buildSessionContext(session: SessionState): string {
  if (session.messageCount === 0) {
    return 'SESSION INFO: First interaction in this session';
  }

  const timeSinceLastMessage = Date.now() - session.lastInteractionTime;
  const minutesAgo = Math.floor(timeSinceLastMessage / 60000);

  return `SESSION INFO:
- This is message #${session.messageCount + 1} in this session
- Last interaction: ${minutesAgo > 0 ? `${minutesAgo} minutes ago` : 'just now'}
- Recent context from this session available`;
}

// ========== Session Management ==========

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
  console.log(`[ChatFlow] Session cleared: ${sessionId}`);
}

export function getAllSessions(): Map<string, SessionState> {
  return sessions;
}

// ========== SupportAgent Class (Wrapper) ==========

export class SupportAgent {
  private initialized = false;

  // Performance tracking
  private stats = {
    totalInteractions: 0,
    totalResponseTime: 0,
    totalMemoriesUsed: 0
  };

  constructor() {
    console.log('[SupportAgent] Initialized with Genkit');
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await memoryManager.initialize();
    this.initialized = true;

    console.log('[SupportAgent] Ready with Genkit flows');
  }

  /**
   * Chat with the agent using Genkit-managed sessions
   */
  async chat(userId: string, message: string, sessionId: string): Promise<ChatResponse> {
    this.ensureInitialized();

    try {
      // Call the flow handler directly (Genkit flow registration is for tooling/dev server)
      const result = await this.executeChatFlow({
        userId,
        message,
        sessionId
      });

      // Update stats
      this.stats.totalInteractions++;
      this.stats.totalResponseTime += result.metadata.responseTime;
      this.stats.totalMemoriesUsed += result.memoriesUsed;

      return result;
    } catch (error) {
      console.error('[SupportAgent] Chat error:', error);
      throw error;
    }
  }

  /**
   * Execute the chat flow logic
   */
  private async executeChatFlow(input: { userId: string; message: string; sessionId: string }): Promise<ChatResponse> {
    const { userId, message, sessionId } = input;
    const startTime = Date.now();

    // Get or create session state
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        userId,
        messageCount: 0,
        lastInteractionTime: Date.now(),
        recentMemories: []
      };
      sessions.set(sessionId, session);
      console.log(`[ChatFlow] New session created: ${sessionId}`);
    }

    // 1. Retrieve relevant memories
    const memories = await memoryManager.searchRelevantMemories(userId, message, {
      limit: 5,
      threshold: 0.5
    });

    console.log(`[ChatFlow] Found ${memories.length} relevant memories for session ${sessionId}`);

    // 2. Build context from memories + session state
    const context = buildContext(memories);
    const sessionContext = buildSessionContext(session);
    const fullContext = `${context}\n\n${sessionContext}`;

    // 3. Generate response using Ollama
    const prompt = buildPrompt(fullContext, message);

    const chatMessages = [
      {
        role: 'user' as const,
        content: prompt
      }
    ];

    const response = await ollamaClient.chat(chatMessages);

    // 4. Store this interaction
    await memoryManager.addInteraction({
      userId,
      userMessage: message,
      assistantMessage: response,
      sessionId,
      timestamp: Date.now()
    });

    // 5. Update session state
    session.messageCount++;
    session.lastInteractionTime = Date.now();
    session.recentMemories = memories.slice(0, 3); // Keep last 3 memories

    // 6. Calculate metrics
    const responseTime = Date.now() - startTime;
    const avgRelevance = memories.length > 0
      ? memories.reduce((sum, m) => sum + (m.relevance || 0), 0) / memories.length
      : 0;

    console.log(`[ChatFlow] Response generated in ${responseTime}ms`);

    return {
      response,
      context: memories,
      memoriesUsed: memories.length,
      timestamp: Date.now(),
      metadata: {
        responseTime,
        relevanceScore: avgRelevance
      }
    };
  }

  /**
   * Get agent statistics
   */
  getStats() {
    const avgResponseTime = this.stats.totalInteractions > 0
      ? this.stats.totalResponseTime / this.stats.totalInteractions
      : 0;

    const avgMemoriesUsed = this.stats.totalInteractions > 0
      ? this.stats.totalMemoriesUsed / this.stats.totalInteractions
      : 0;

    const cacheStats = ollamaClient.getCacheStats();

    return {
      totalInteractions: this.stats.totalInteractions,
      avgResponseTime: Math.round(avgResponseTime),
      avgMemoriesUsed: avgMemoriesUsed.toFixed(1),
      cacheHitRate: cacheStats.hitRate,
      activeSessions: sessions.size
    };
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId: string) {
    return getSession(sessionId);
  }

  /**
   * Clear a session
   */
  clearSession(sessionId: string): void {
    clearSession(sessionId);
  }

  // ========== Private Methods ==========

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SupportAgent not initialized. Call initialize() first.');
    }
  }
}

// Export singleton instance
export const supportAgent = new SupportAgent();
