// Demo UI JavaScript

const API_BASE = 'http://localhost:3000/api';
let sessionStartTime = Date.now();
let currentSessionId = `session_${Date.now()}`;
let currentUserId = 'customer_123'; // Track current user

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    currentUserId = document.getElementById('userId').value;
    updateStats();
    setInterval(updateSessionTime, 1000);
    setInterval(updateStats, 5000);
});

// Handle customer change
function handleCustomerChange() {
    const newUserId = document.getElementById('userId').value;

    // Only clear if actually changed (not initial load)
    if (newUserId !== currentUserId) {
        const previousUser = currentUserId;
        currentUserId = newUserId;

        // Clear chat interface
        document.getElementById('messages').innerHTML = '';

        // Create new session for new customer
        currentSessionId = `session_${Date.now()}`;
        sessionStartTime = Date.now();

        // Show customer switch message
        const messagesDiv = document.getElementById('messages');
        const switchDiv = document.createElement('div');
        switchDiv.className = 'message assistant';
        switchDiv.innerHTML = `
            <div class="message-avatar">🔄</div>
            <div class="message-content" style="background: #d1ecf1; color: #0c5460;">
                Switched to ${newUserId}. Chat cleared. Previous customer was ${previousUser}.
            </div>
        `;
        messagesDiv.appendChild(switchDiv);

        // Update stats for new customer
        updateStats();

        console.log(`Switched customer: ${previousUser} → ${newUserId}`);
    }
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message) return;

    const userId = document.getElementById('userId').value;
    const sendBtn = document.getElementById('sendBtn');

    // Disable input
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="loading"></span>';

    // Add user message to UI
    addMessage('user', message);
    input.value = '';

    try {
        // Send to API
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId,
                message,
                sessionId: currentSessionId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Add assistant message
        addMessage('assistant', data.response, {
            memoriesUsed: data.memoriesUsed,
            responseTime: data.metadata.responseTime,
            relevance: data.metadata.relevanceScore
        });

        // Update stats
        updateStats();

    } catch (error) {
        console.error('Chat error:', error);
        showError(`Failed to send message: ${error.message}`);
    } finally {
        // Re-enable input
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        input.focus();
    }
}

// Add message to UI
function addMessage(role, content, meta = {}) {
    const messagesDiv = document.getElementById('messages');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    // Add metadata for assistant messages
    if (role === 'assistant' && meta.memoriesUsed !== undefined) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-memories';
        metaDiv.textContent = `📊 Used ${meta.memoriesUsed} memories | ${meta.responseTime}ms | ${(meta.relevance * 100).toFixed(0)}% avg relevance`;
        contentDiv.appendChild(metaDiv);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);

    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Handle enter key
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Update stats
async function updateStats() {
    const userId = document.getElementById('userId').value;

    try {
        // Get memory stats
        const statsResponse = await fetch(`${API_BASE}/stats/${userId}`);
        const stats = await statsResponse.json();

        document.getElementById('memoryCount').textContent = `Memories: ${stats.totalMemories}`;

        // Get agent stats
        const agentResponse = await fetch(`${API_BASE}/agent-stats`);
        const agentStats = await agentResponse.json();

        const agentStatsDiv = document.getElementById('agentStats');
        agentStatsDiv.innerHTML = `
            <div class="stat-card">
                <div class="label">Total Interactions</div>
                <div class="value">${agentStats.totalInteractions}</div>
            </div>
            <div class="stat-card">
                <div class="label">Avg Response Time</div>
                <div class="value">${agentStats.avgResponseTime}ms</div>
            </div>
            <div class="stat-card">
                <div class="label">Avg Memories Used</div>
                <div class="value">${agentStats.avgMemoriesUsed}</div>
            </div>
            <div class="stat-card">
                <div class="label">Cache Hit Rate</div>
                <div class="value">${agentStats.cacheHitRate}</div>
            </div>
        `;

    } catch (error) {
        console.error('Stats error:', error);
    }
}

// Update session time
function updateSessionTime() {
    const minutes = Math.floor((Date.now() - sessionStartTime) / 60000);
    document.getElementById('sessionTime').textContent = `Session: ${minutes}m`;
}

// Clear all data for fresh start
async function clearAllData() {
    if (!confirm('🗑️ Fresh Start: This will delete all memories and clear the chat. Continue?')) {
        return;
    }

    const userId = document.getElementById('userId').value;

    try {
        // Clear memories from vector database
        const response = await fetch(`${API_BASE}/memories/${userId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            // Clear chat interface
            document.getElementById('messages').innerHTML = '';

            // Create new session
            currentSessionId = `session_${Date.now()}`;
            sessionStartTime = Date.now();

            // Update stats
            updateStats();

            // Show success message in chat
            const messagesDiv = document.getElementById('messages');
            const successDiv = document.createElement('div');
            successDiv.className = 'message assistant';
            successDiv.innerHTML = `
                <div class="message-avatar">✨</div>
                <div class="message-content" style="background: #d4edda; color: #155724;">
                    🎉 Fresh start! All memories cleared and new session created.
                </div>
            `;
            messagesDiv.appendChild(successDiv);
        }
    } catch (error) {
        console.error('Clear error:', error);
        showError(`Failed to clear data: ${error.message}`);
    }
}

// Keep old function for backwards compatibility (deprecated)
async function clearMemories() {
    await clearAllData();
}

// Show error
function showError(message) {
    const messagesDiv = document.getElementById('messages');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    messagesDiv.appendChild(errorDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}
