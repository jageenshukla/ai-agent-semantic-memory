import type { Memory } from '../types/index.js';

/**
 * System prompt for the customer support agent
 */
export const SYSTEM_PROMPT = `You are a professional customer support agent for a software company.
You have access to previous conversations and customer context through your memory system.

CAPABILITIES:
- Remember previous conversations, even from weeks ago
- Understand customer preferences and adapt your communication style
- Track multiple issues for the same customer
- Provide updates on previously reported issues

GUIDELINES:
- Reference relevant past interactions naturally (don't just list memories)
- Be concise but informative (2-4 sentences typically)
- If you remember the customer is technical, use appropriate terminology
- If customer previously expressed frustration, be extra empathetic
- Proactively provide updates when you have relevant information

IMPORTANT:
- Do NOT make up information
- If you don't have an update, be honest about it
- Always be helpful and professional`;

/**
 * Build context from memories
 */
export function buildContext(memories: Memory[]): string {
  if (memories.length === 0) {
    return 'No previous context available for this customer.';
  }

  // Group by category
  const bugReports = memories.filter(m => m.category === 'bug_report');
  const featureRequests = memories.filter(m => m.category === 'feature_request');
  const preferences = memories.filter(m => m.type === 'preference');
  const recent = memories.filter(m => m.type === 'conversation').slice(0, 3);

  const sections: string[] = [];

  // Bug reports
  if (bugReports.length > 0) {
    sections.push('KNOWN ISSUES:');
    bugReports.forEach((bug, i) => {
      const daysAgo = Math.floor((Date.now() - bug.timestamp) / 1000 / 60 / 60 / 24);
      sections.push(`${i + 1}. [${daysAgo} days ago] ${bug.content.substring(0, 100)}`);
    });
  }

  // Feature requests
  if (featureRequests.length > 0) {
    sections.push('\nFEATURE REQUESTS:');
    featureRequests.forEach((req, i) => {
      sections.push(`${i + 1}. ${req.content.substring(0, 100)}`);
    });
  }

  // Preferences
  if (preferences.length > 0) {
    sections.push('\nCUSTOMER PREFERENCES:');
    preferences.forEach((pref, i) => {
      sections.push(`${i + 1}. ${pref.content.substring(0, 100)}`);
    });
  }

  // Recent conversations
  if (recent.length > 0) {
    sections.push('\nRECENT INTERACTIONS:');
    recent.forEach((conv, i) => {
      const daysAgo = Math.floor((Date.now() - conv.timestamp) / 1000 / 60 / 60 / 24);
      sections.push(`${i + 1}. [${daysAgo} days ago] ${conv.content.substring(0, 150)}`);
    });
  }

  return sections.join('\n');
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
