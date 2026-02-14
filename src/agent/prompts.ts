import type { Memory } from '../types/index.js';

/**
 * System prompt for the customer support agent
 */
export const SYSTEM_PROMPT = `You are a helpful AI assistant with memory of previous conversations.

HOW TO USE CONTEXT:
- The CONTEXT FROM MEMORY section shows previous conversations
- Example: If context shows "User: My name is Alice", then the user's name is Alice
- Extract facts from what the user actually said in those conversations
- NEVER make up information not present in the context

RULES:
- Answer based on information found in the context
- If context doesn't contain the answer, say "I don't have that information"
- Be natural and conversational
- Don't roleplay or create fictional scenarios`;

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 * @param text - Text to estimate tokens for
 * @returns Approximate token count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build context from memories with token limit management
 * Prioritizes important memories and stays within context window
 * @param memories - Array of memories
 * @param maxTokens - Maximum tokens to use for context (default: 2000)
 * @returns Formatted context string
 */
export function buildContext(memories: Memory[], maxTokens: number = 2000): string {
  if (memories.length === 0) {
    return 'No previous context available for this customer.';
  }

  // Sort memories by importance * recency
  const now = Date.now();
  const sortedMemories = memories
    .map(m => {
      const ageInDays = (now - m.timestamp) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 1 - (ageInDays / 365)); // Decays over 1 year
      const compositeScore = (m.importance * 0.7) + (recencyScore * 0.3);
      return { memory: m, score: compositeScore };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.memory);

  // Group by category
  const bugReports = sortedMemories.filter(m => m.category === 'bug_report');
  const featureRequests = sortedMemories.filter(m => m.category === 'feature_request');
  const preferences = sortedMemories.filter(m => m.type === 'preference' || m.type === 'extracted_fact');
  const sentiment = sortedMemories.filter(m => m.type === 'sentiment');
  const recent = sortedMemories.filter(m => m.type === 'conversation').slice(0, 3);

  const sections: string[] = [];
  let currentTokens = 0;

  // Helper to add section with token limit
  const addSection = (title: string, items: Memory[], maxItems: number, charLimit: number) => {
    if (items.length === 0) return;

    const sectionStart = `\n${title}`;
    currentTokens += estimateTokens(sectionStart);

    if (currentTokens >= maxTokens) return;

    sections.push(sectionStart);

    for (let i = 0; i < Math.min(items.length, maxItems); i++) {
      const item = items[i];
      const daysAgo = Math.floor((now - item.timestamp) / 1000 / 60 / 60 / 24);
      const timeStr = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
      const content = item.content.length > charLimit ? item.content.substring(0, charLimit) + '...' : item.content;
      const line = `${i + 1}. [${timeStr}] ${content}`;

      const lineTokens = estimateTokens(line);
      if (currentTokens + lineTokens > maxTokens) {
        sections.push(`... (${items.length - i} more items truncated due to context limit)`);
        return;
      }

      sections.push(line);
      currentTokens += lineTokens;
    }
  };

  // Add sections in priority order
  addSection('CUSTOMER PROFILE:', preferences, 10, 150);
  addSection('KNOWN ISSUES:', bugReports, 5, 120);
  addSection('FEATURE REQUESTS:', featureRequests, 5, 120);
  addSection('SENTIMENT HISTORY:', sentiment, 3, 100);
  addSection('RECENT INTERACTIONS:', recent, 3, 200);

  const result = sections.join('\n');
  const finalTokens = estimateTokens(result);

  console.log(`[Context] Built context: ${finalTokens}/${maxTokens} tokens, ${memories.length} memories`);

  return result;
}

/**
 * Build the complete prompt with context
 */
export function buildPrompt(context: string, userMessage: string): string {
  return `${SYSTEM_PROMPT}

CONTEXT FROM MEMORY:
${context}

CURRENT CONVERSATION:
User: ${userMessage}
Assistant:`;
}
