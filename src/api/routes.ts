import express, { Request, Response } from 'express';
import { supportAgent } from '../agent/agent.js';
import { memoryManager } from '../memory/memoryManager.js';

const router = express.Router();

/**
 * POST /api/chat - Chat with the agent
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { userId, message, sessionId } = req.body;

    // Validation
    if (!userId || !message) {
      return res.status(400).json({
        error: 'Missing required fields: userId and message'
      });
    }

    // Generate session ID if not provided
    const session = sessionId || `session_${Date.now()}`;

    // Chat with agent
    const response = await supportAgent.chat(userId, message, session);

    res.json(response);
  } catch (error) {
    console.error('[API] Chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/memories/:userId - Get memories for a user
 */
router.get('/memories/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const memories = await memoryManager.getRecentMemories(userId, limit);

    res.json({
      userId,
      memories,
      count: memories.length
    });
  } catch (error) {
    console.error('[API] Get memories error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stats/:userId - Get memory statistics
 */
router.get('/stats/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const stats = await memoryManager.getMemoryStats(userId);

    res.json(stats);
  } catch (error) {
    console.error('[API] Get stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/memories/:userId - Delete all memories for a user (GDPR)
 */
router.delete('/memories/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    await memoryManager.deleteUserData(userId);

    res.json({
      success: true,
      message: `Deleted all data for user: ${userId}`
    });
  } catch (error) {
    console.error('[API] Delete memories error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/agent-stats - Get agent statistics
 */
router.get('/agent-stats', (req: Request, res: Response) => {
  try {
    const stats = supportAgent.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[API] Agent stats error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/health - Health check
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const ollamaAvailable = await (await import('../models/ollama.js')).ollamaClient.isAvailable();

    res.json({
      status: 'ok',
      ollama: ollamaAvailable ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/sessions/:sessionId - Get session info
 */
router.get('/sessions/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = supportAgent.getSessionInfo(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found',
        sessionId
      });
    }

    res.json({
      sessionId,
      session
    });
  } catch (error) {
    console.error('[API] Get session error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/sessions/:sessionId - Clear a session
 */
router.delete('/sessions/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    supportAgent.clearSession(sessionId);

    res.json({
      success: true,
      message: `Session ${sessionId} cleared`
    });
  } catch (error) {
    console.error('[API] Clear session error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
