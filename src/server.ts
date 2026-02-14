// Load environment variables FIRST (before any other imports)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { supportAgent } from './agent/agent.js';
import routes from './api/routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Serve static files from demo directory
app.use(express.static('demo'));

// API routes
app.use('/api', routes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize and start server
async function startServer() {
  try {
    console.log('🚀 Starting AI Customer Support Agent...\n');

    // Initialize agent
    console.log('Initializing agent...');
    await supportAgent.initialize();

    // Start server
    app.listen(PORT, () => {
      console.log('\n✅ Server ready!');
      console.log(`📡 API: http://localhost:${PORT}/api`);
      console.log(`🌐 Demo UI: http://localhost:${PORT}`);
      console.log(`💚 Health: http://localhost:${PORT}/api/health\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
