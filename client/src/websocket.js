// WebSocket handler - manages socket.io events
import { io } from 'socket.io-client';

class WebSocketHandler {
  constructor() {
    this.socket = null;
    this.userId = null;
    this.userColor = null;
    this.userName = null;
    this.connected = false;
    this.nameModalInitialized = false;

    // Throttle cursor updates to avoid spamming the server
    this.lastCursorSend = 0;
    this.cursorThrottle = 50;
  }

  // Connect to WebSocket server
  connect() {
    try {
      // Connect directly to backend on port 3002
      this.socket = io('http://localhost:3002', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      });
    } catch (e) {
      console.error('Failed to connect:', e);
      return;
    }

    this.setupEventListeners();
  }

  // Setup all socket event handlers
  setupEventListeners() {
    // Connection successful
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
    });

    // Server handshake - tells us who we are and current canvas state
    this.socket.on('init', (data) => {
      console.log('Received user data');
      this.userId = data.userId;
      this.userColor = data.userColor;

      // Ask for name once, persist it, and send to server
      this.ensureUserName();

      // Update UI with user info
      this.updateUserInfo();

      // Load existing strokes if any
      if (data.strokes && data.strokes.length > 0) {
        window.drawingApp.canvas.redrawFromHistory(data.strokes);
      }

      // Update users list
      if (data.users) {
        this.updateUsersList(data.users);
      }
    });

    // New user joined
    this.socket.on('user-joined', (data) => {
      console.log('User joined:', data.name || 'Anonymous');
      // Note: users-list-update event will fire separately to update the full list
    });

    // When user list is updated
    this.socket.on('users-list-update', (data) => {
      console.log('Received users-list-update:', JSON.stringify(data.users));
      this.updateUsersList(data.users);
    });

    // User left
    this.socket.on('user-left', (data) => {
      if (window.drawingApp && window.drawingApp.canvas) {
        window.drawingApp.canvas.removeRemoteCursor(data.userId);
      }
    });

    // Remote user started drawing
    this.socket.on('remote-draw-start', (data) => {
      if (window.drawingApp && window.drawingApp.canvas) {
        window.drawingApp.canvas.startRemoteStroke(data.userId, {
          x: data.x,
          y: data.y,
          color: data.color,
          width: data.width,
          tool: data.tool
        });
      }
    });

    // Receive drawing from another user
    this.socket.on('remote-draw', (data) => {
      if (window.drawingApp && window.drawingApp.canvas) {
        window.drawingApp.canvas.drawRemoteStroke(data.userId, {
          x: data.x,
          y: data.y,
          color: data.color,
          width: data.width,
          tool: data.tool
        });
      }
    });

    // Remote user ended their stroke
    this.socket.on('remote-draw-end', (data) => {
      if (window.drawingApp && window.drawingApp.canvas) {
        window.drawingApp.canvas.endRemoteStroke(data.userId);
      }
    });

    // Receive cursor position from another user
    this.socket.on('remote-cursor', (data) => {
      if (window.drawingApp && window.drawingApp.canvas) {
        window.drawingApp.canvas.updateRemoteCursor(data.userId, data.x, data.y, data.color);
      }
    });

    // Undo/clear - redraw everything from history
    this.socket.on('canvas-update', (data) => {
      if (data.action === 'undo' || data.action === 'clear') {
        window.drawingApp.canvas.redrawFromHistory(data.strokes);

        if (window.drawingApp.canvas.remoteDrawingState) {
          window.drawingApp.canvas.remoteDrawingState.clear();
        }
      }
    });

    // Disconnection
    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connected = false;
      this.updateUserInfo();
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });
  }

  // Send drawing start event
  sendDrawStart(data) {
    if (this.connected) {
      this.socket.emit('draw-start', data);
    }
  }

  // send draw segments to server (clients already draw locally)
  sendDrawMove(data) {
    if (this.connected) {
      this.socket.emit('draw-move', data);
    }
  }

  // Send drawing end event
  sendDrawEnd() {
    if (this.connected) {
      this.socket.emit('draw-end');
    }
  }

  // throttle cursor updates so we don’t flood the server
  sendCursorMove(coords) {
    if (!this.connected) return;

    const now = Date.now();
    if (now - this.lastCursorSend > this.cursorThrottle) {
      this.socket.emit('cursor-move', coords);
      this.lastCursorSend = now;
    }
  }

  // Send undo request
  sendUndo() {
    if (this.connected) {
      this.socket.emit('undo');
      console.log('Undo requested');
    }
  }

  // Send clear canvas request
  sendClear() {
    if (this.connected) {
      const confirmed = confirm('Clear the entire canvas? This affects all users.');
      if (confirmed) {
        this.socket.emit('clear-canvas');
        console.log('Canvas cleared');
      }
    }
  }

  // Update user info display in UI
  updateUserInfo() {
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl) {
      if (this.connected) {
        const label = this.userName || (this.userId ? this.userId.substring(0, 12) : 'Connected');
        userInfoEl.textContent = `You: ${label}`;
        userInfoEl.style.background = this.userColor || '#e3f2fd';
      } else {
        userInfoEl.textContent = 'Disconnected';
        userInfoEl.style.background = '#ffebee';
      }
    }
  }

  // Get user name (stored in sessionStorage per tab)
  ensureUserName() {
    const storageKey = 'drawingApp.userName';
    let savedName = sessionStorage.getItem(storageKey);

    let normalizedSaved = '';
    if (savedName) {
      normalizedSaved = savedName.trim();
    }

    // If we have a saved name, use it and send to server
    if (normalizedSaved && normalizedSaved.toLowerCase() !== 'anonymous') {
      this.userName = normalizedSaved.substring(0, 32);
      console.log('Using saved name:', this.userName);
      this.broadcastName();
      return;
    }

    const modal = document.getElementById('name-modal');
    const input = document.getElementById('name-input');
    const submit = document.getElementById('name-submit');
    const errorEl = document.getElementById('name-error');

    if (!modal || !input || !submit) {
      const fallback = prompt('Enter your name (shown to everyone):', '') || 'Anonymous';
      this.userName = fallback.trim().substring(0, 32) || 'Anonymous';
      sessionStorage.setItem(storageKey, this.userName);
      console.log('Set name via fallback:', this.userName);
      this.broadcastName();
      this.updateUserInfo();
      return;
    }

    if (!this.nameModalInitialized) {
      const submitName = () => {
        const raw = input.value.trim();
        if (!raw) {
          if (errorEl) errorEl.textContent = 'Please enter a name.';
          input.focus();
          return;
        }

        this.userName = raw.substring(0, 32);
        sessionStorage.setItem(storageKey, this.userName);
        modal.classList.remove('show');
        if (errorEl) errorEl.textContent = '';

        console.log('Set name via modal:', this.userName);
        this.broadcastName();
        this.updateUserInfo();
      };

      submit.addEventListener('click', submitName);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          submitName();
        }
      });

      this.nameModalInitialized = true;
    }

    if (errorEl) errorEl.textContent = '';
    input.value = '';
    modal.classList.add('show');
    input.focus();
  }

  // Broadcast name to server when ready
  broadcastName() {
    if (!this.userName) {
      console.log('No user name set, skipping broadcast');
      return;
    }
    
    console.log('broadcastName called. socket exists:', !!this.socket, 'connected:', this.connected);
    
    // Try to send immediately
    if (this.socket && this.connected) {
      console.log('Broadcasting name immediately:', this.userName);
      this.socket.emit('set-name', { name: this.userName });
      return;
    }
    
    // If not connected, wait and retry
    console.log('Socket not ready. Retrying in 500ms');
    let retries = 0;
    const retry = setInterval(() => {
      retries++;
      console.log('Retry', retries, 'socket exists:', !!this.socket, 'connected:', this.connected);
      
      if (this.socket && this.connected) {
        console.log('Broadcasting name after retry:', this.userName);
        this.socket.emit('set-name', { name: this.userName });
        clearInterval(retry);
      } else if (retries > 10) {
        console.log('Failed to broadcast name after 10 retries');
        clearInterval(retry);
      }
    }, 500);
  }

  // Update the users list panel
  updateUsersList(users) {
    const usersListEl = document.getElementById('users-list');
    if (!usersListEl) return;

    console.log('Updating users list:', users);

    usersListEl.innerHTML = '';

    if (window.drawingApp && window.drawingApp.canvas) {
      window.drawingApp.canvas.setUserNames(users);
    }

    users.forEach((user) => {
      const userItem = document.createElement('div');
      userItem.className = 'user-item';

      const colorDot = document.createElement('div');
      colorDot.className = 'user-color-dot';
      colorDot.style.background = user.color;

      const userName = document.createElement('span');
      userName.className = 'user-name';
      userName.textContent = user.name || user.id.substring(0, 12);

      userItem.appendChild(colorDot);
      userItem.appendChild(userName);
      usersListEl.appendChild(userItem);
    });
  }
}

export default WebSocketHandler;
