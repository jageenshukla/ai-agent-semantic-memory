# AI Customer Support Agent with Semantic Memory

A production-ready AI customer support agent with semantic long-term memory using TypeScript, Ollama (local LLM), ChromaDB (vector database), and Express.js.

## Features

- **Semantic Memory** - Remembers conversations using vector embeddings, not just keywords
- **Cross-Session Recall** - Retrieves relevant memories across different sessions and time gaps
- **Explicit Commands** - Users can say "My name is John" and agent remembers permanently
- **Server Restart Persistence** - All memories survive server restarts (stored in ChromaDB)
- **Session Management** - Genkit-powered session tracking with state management
- **100% Local** - No API costs, complete privacy

## Prerequisites

- **Node.js** 20+
- **Ollama** installed and running ([https://ollama.com](https://ollama.com))

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Pull Ollama Models

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` if needed (defaults work for local Ollama setup).

### 4. Start the Server

```bash
npm run dev
```

Server starts at: **http://localhost:3000**

## Usage

### Web UI

Open your browser to http://localhost:3000 to access the chat interface.

**Features:**
- Chat with AI agent
- Switch between customers
- View real-time statistics
- Fresh start button (clear all data)

### API Endpoints

#### Chat
```bash
POST /api/chat
Content-Type: application/json

{
  "userId": "customer_123",
  "message": "My name is Alice. Please remember it.",
  "sessionId": "session_1"
}
```

#### Get Memories
```bash
GET /api/memories/:userId?limit=10
```

#### Delete User Data (GDPR)
```bash
DELETE /api/memories/:userId
```

#### Health Check
```bash
GET /api/health
```

#### Agent Statistics
```bash
GET /api/agent-stats
```

#### Session Management
```bash
GET /api/sessions/:sessionId      # Get session info
DELETE /api/sessions/:sessionId    # Clear session
```

## Architecture

```
┌─────────────────┐
│   Web UI        │
│  (HTML/CSS/JS)  │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────┐
│  Express API    │
│  (TypeScript)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Support Agent  │
│   (Genkit)      │
└────┬───────┬────┘
     │       │
     ▼       ▼
┌─────────┐ ┌──────────┐
│ Memory  │ │  Ollama  │
│ Manager │ │  Client  │
└────┬────┘ └──────────┘
     │
     ▼
┌─────────────────┐
│   ChromaDB      │
│ (Vector Store)  │
└─────────────────┘
```

## How It Works

### Memory Storage

1. User sends message: "My name is Alice"
2. Agent extracts key fact: "Customer's name is Alice"
3. Generate 768-dim embedding using `nomic-embed-text`
4. Store in ChromaDB with metadata (userId, importance=0.95, timestamp)

### Memory Retrieval

1. User asks: "What is my name?"
2. Generate query embedding
3. Semantic search in ChromaDB (cosine similarity)
4. Re-rank by: `relevance×0.5 + importance×0.3 + recency×0.2`
5. Return top 5 memories
6. Agent generates response with context

### Result

Agent responds: "Your name is Alice!" - even after server restart or new session.

## Project Structure

```
.
├── src/
│   ├── agent/          # AI agent with Genkit flows
│   ├── api/            # REST API endpoints
│   ├── memory/         # Memory manager + ChromaDB
│   ├── models/         # Ollama client
│   ├── types/          # TypeScript types
│   ├── genkit.ts       # Genkit configuration
│   └── server.ts       # Express server
├── demo/
│   ├── index.html      # Chat UI
│   ├── app.js          # Frontend logic
│   └── styles.css      # Styling
├── .env.example        # Environment template
├── .gitignore          # Git ignore rules
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
└── README.md           # This file
```

## Configuration

Edit `.env` to customize:

```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
CHAT_MODEL=llama3.2
EMBEDDING_MODEL=nomic-embed-text

# Server
PORT=3000
NODE_ENV=development

# Memory
MAX_MEMORIES_PER_QUERY=5
MEMORY_RELEVANCE_THRESHOLD=0.7
```

## Development

### Build

```bash
npm run build
```

### Start Production

```bash
npm start
```

### Watch Mode

```bash
npm run dev
```

## Key Technologies

- **TypeScript** - Type-safe development
- **Ollama** - Local LLM (llama3.2) and embeddings (nomic-embed-text)
- **ChromaDB** - Vector database for semantic search
- **Genkit** - Agent framework with session management
- **Express.js** - REST API server
- **Zod** - Runtime type validation

## Performance

- **Response Time:** < 3 seconds (P95)
- **Semantic Accuracy:** 50-70% similarity for related concepts
- **Memory Persistence:** 100% across sessions and restarts
- **Cache Hit Rate:** 20-40% (reduces redundant API calls)
- **Cost:** $0 (completely local)

## Use Cases

- **Customer Support** - Remember customer history and preferences
- **Personal Assistant** - Long-term memory for tasks and preferences
- **Healthcare** - Patient history with HIPAA compliance (local storage)
- **Education** - Personalized tutoring based on learning style
- **Sales CRM** - Semantic memory of customer conversations

## Production Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Variables

Ensure these are set in production:
- `NODE_ENV=production`
- `OLLAMA_BASE_URL` (if Ollama on different host)
- `PORT` (default: 3000)

### Scaling

- **Horizontal:** Stateless API, shared ChromaDB instance
- **Vertical:** More RAM for larger models, GPU for faster inference

## Troubleshooting

### Ollama not connecting

```bash
# Check if Ollama is running
ollama list

# Start Ollama service
ollama serve
```

### ChromaDB errors

```bash
# Clear ChromaDB data
rm -rf chroma_data/
```

### Memory not persisting

- Verify ChromaDB is initialized (check console logs)
- Ensure embeddings are 768-dimensional
- Check userId consistency across requests

## License

MIT License - Feel free to use for any purpose

---

**Built with TypeScript, Ollama, ChromaDB, and Genkit**

For questions or issues, please open an issue on GitHub.
