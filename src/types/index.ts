// Core Types for AI Agent with Memory

// ========== Chat Types ==========
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  response: string;
  context: Memory[];
  memoriesUsed: number;
  timestamp: number;
  metadata: {
    responseTime: number;
    relevanceScore: number;
  };
}

// ========== Memory Types ==========
export enum MemoryType {
  CONVERSATION = 'conversation',        // Full conversation turn
  EXTRACTED_FACT = 'extracted_fact',    // Key information
  PREFERENCE = 'preference',            // User preferences
  SENTIMENT = 'sentiment',              // Emotional state
  EVENT = 'event'                       // Important actions
}

export enum MemoryCategory {
  BUG_REPORT = 'bug_report',
  FEATURE_REQUEST = 'feature_request',
  QUESTION = 'question',
  FEEDBACK = 'feedback',
  TECHNICAL = 'technical',
  GENERAL = 'general'
}

export interface Memory {
  id: string;
  userId: string;
  content: string;
  embedding?: number[];  // 768-dimensional vector
  type: MemoryType;
  category: MemoryCategory;
  timestamp: number;
  sessionId?: string;
  importance: number;  // 0-1 score
  relevance?: number;  // Similarity score when retrieved
  metadata?: Record<string, any>;
}

export interface VectorMemory extends Memory {
  embedding: number[];
}

export interface MemoryInput {
  userId: string;
  content: string;
  type: MemoryType;
  category: MemoryCategory;
  sessionId?: string;
  importance?: number;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  includeRelated?: boolean;
  category?: MemoryCategory;
}

export interface SearchResult {
  memory: Memory;
  distance: number;  // Cosine distance from ChromaDB
  relevance: number;  // 1 - distance
}

export interface MemoryStats {
  totalMemories: number;
  memoryByType: Record<MemoryType, number>;
  memoryByCategory: Record<MemoryCategory, number>;
  avgImportance: number;
  oldestMemory: number;
  newestMemory: number;
}

// ========== Interaction Types ==========
export interface Interaction {
  userId: string;
  userMessage: string;
  assistantMessage: string;
  sessionId: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// ========== Ollama Types ==========
export interface OllamaConfig {
  baseUrl?: string;
  chatModel?: string;
  embeddingModel?: string;
}

export interface ModelInfo {
  name: string;
  size: number;
  modified: string;
  format: string;
}

// ========== Agent Types ==========
export interface AgentConfig {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AgentStats {
  totalInteractions: number;
  avgResponseTime: number;
  avgMemoriesUsed: number;
  cacheHitRate: number;
}

// ========== API Types ==========
export interface ChatRequest {
  userId: string;
  message: string;
  sessionId?: string;
}

export interface ComparisonRequest {
  userId: string;
  query: string;
}

export interface ComparisonResponse {
  query: string;
  sqliteResults: any[];
  vectorResults: SearchResult[];
  comparison: {
    sqliteCount: number;
    vectorCount: number;
    winner: 'sqlite' | 'vector' | 'tie';
    avgRelevance: number;
  };
}

// ========== SQLite Types ==========
export interface Conversation {
  id: string;
  userId: string;
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  timestamp: number;
  category?: string;
  keywords?: string;  // Comma-separated
  createdAt: Date;
}

// ========== Utility Types ==========
export interface ReRankOptions {
  importanceWeight?: number;  // Default: 0.3
  recencyWeight?: number;     // Default: 0.2
  similarityWeight?: number;  // Default: 0.5
}

export interface Filters {
  userId?: string;
  category?: MemoryCategory;
  type?: MemoryType;
  timestampGte?: number;  // Greater than or equal
  timestampLte?: number;  // Less than or equal
}
