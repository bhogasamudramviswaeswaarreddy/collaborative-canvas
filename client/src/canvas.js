// Canvas drawing - using raw Canvas API, no libs

class CanvasDrawing {
  constructor(canvasId, cursorCanvasId) {
    // Get both canvases
    this.canvas = document.getElementById(canvasId);
    this.cursorCanvas = document.getElementById(cursorCanvasId);
    this.ctx = this.canvas.getContext('2d');
    this.cursorCtx = this.cursorCanvas.getContext('2d');

    // Drawing state
    this.isDrawing = false;
    this.lastX = 0;
    this.lastY = 0;

    // Current tool settings
    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.brushSize = 5;

    // Store remote cursors
    this.remoteCursors = new Map(); // userId -> {x, y, color}

    // Store user display names for labels
    this.userNames = new Map(); // userId -> name

    // Brush preview cursor
    this.showBrushPreview = false;
    this.brushPreviewX = 0;
    this.brushPreviewY = 0;

    // Track remote drawing state to properly handle stroke lifecycle
    this.remoteDrawingState = new Map(); // userId -> {isDrawing: bool, lastX, lastY}

    // Setup canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Setup drawing events
    this.setupDrawingEvents();
  }

  // Resize canvas to fill window
  resizeCanvas() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();

    // Save current drawing before resizing
    let imageData = null;
    if (this.canvas.width > 0 && this.canvas.height > 0) {
      try {
        imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      } catch (e) {
        // Canvas too small or invalid
      }
    }

    const pixelRatio = window.devicePixelRatio || 1;

    // Set canvas resolution
    this.canvas.width = rect.width * pixelRatio;
    this.canvas.height = rect.height * pixelRatio;
    this.cursorCanvas.width = rect.width * pixelRatio;
    this.cursorCanvas.height = rect.height * pixelRatio;

    // Set display size
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.cursorCanvas.style.width = rect.width + 'px';
    this.cursorCanvas.style.height = rect.height + 'px';

    // Scale drawing context
    this.ctx.scale(pixelRatio, pixelRatio);
    this.cursorCtx.scale(pixelRatio, pixelRatio);

    // Restore previous drawing
    if (imageData) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.putImageData(imageData, 0, 0);
      this.ctx.drawImage(tempCanvas, 0, 0);
    }
  }

  // Convert mouse position to canvas coordinates
  getCanvasCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y };
  }

  // Setup all mouse and touch events for drawing
  setupDrawingEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDrawing) {
        this.draw(e);
      }
      this.handleCursorMove(e);
    });
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => {
      this.stopDrawing();
      this.showBrushPreview = false;
      this.redrawCursors();
    });

    // Show brush preview when mouse enters
    this.canvas.addEventListener('mouseenter', () => {
      this.showBrushPreview = true;
    });

    // Catch mouseup on window
    window.addEventListener('mouseup', () => {
      if (this.isDrawing) {
        this.stopDrawing();
      }
    });

    // Touch support for mobile
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];

      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.startDrawing(mouseEvent);
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();

      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY
        });

        if (this.isDrawing) {
          this.draw(mouseEvent);
        }
        this.handleCursorMove(mouseEvent);
      }
    });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopDrawing();
    });

    this.canvas.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      this.stopDrawing();
    });
  }

  // Start drawing
  startDrawing(event) {
    this.isDrawing = true;
    const coords = this.getCanvasCoordinates(event);
    this.lastX = coords.x;
    this.lastY = coords.y;

    if (window.drawingApp && window.drawingApp.onDrawStart) {
      window.drawingApp.onDrawStart({
        x: coords.x,
        y: coords.y,
        color: this.currentColor,
        width: this.brushSize,
        tool: this.currentTool
      });
    }
  }

  // Main drawing function
  draw(event) {
    if (!this.isDrawing) return;
    if (!this.ctx) return;

    const coords = this.getCanvasCoordinates(event);

    if (window.drawingApp && window.drawingApp.onCursorMove) {
      window.drawingApp.onCursorMove(coords);
    }

    let strokeColor = this.currentColor;
    if (this.currentTool === 'eraser') {
      strokeColor = '#ffffff';
    }
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(coords.x, coords.y);
    this.ctx.stroke();

    if (window.drawingApp && window.drawingApp.onDrawMove) {
      window.drawingApp.onDrawMove({
        x: coords.x,
        y: coords.y,
        color: this.currentTool === 'eraser' ? '#ffffff' : this.currentColor,
        width: this.brushSize,
        tool: this.currentTool
      });
    }

    this.lastX = coords.x;
    this.lastY = coords.y;
  }

  // Stop drawing
  stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;

      if (window.drawingApp && window.drawingApp.onDrawEnd) {
        window.drawingApp.onDrawEnd();
      }
    }
  }

  // Handle cursor movement for sending to other users
  handleCursorMove(event) {
    const coords = this.getCanvasCoordinates(event);

    this.brushPreviewX = coords.x;
    this.brushPreviewY = coords.y;
    this.showBrushPreview = true;
    this.redrawCursors();

    if (window.drawingApp && window.drawingApp.onCursorMove) {
      window.drawingApp.onCursorMove(coords);
    }
  }

  // Start remote stroke
  startRemoteStroke(userId, data) {
    if (!userId) return;
    this.remoteDrawingState.set(userId, {
      isDrawing: true,
      lastX: data.x,
      lastY: data.y,
      color: data.color,
      width: data.width,
      tool: data.tool
    });
  }

  // Draw remote strokes
  drawRemoteStroke(userId, data) {
    const state = this.remoteDrawingState.get(userId);

    if (!state || !state.isDrawing) {
      return;
    }

    let remoteColor = state.color;
    if (state.tool === 'eraser') {
      remoteColor = '#ffffff';
    }
    this.ctx.strokeStyle = remoteColor;
    this.ctx.lineWidth = state.width;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(state.lastX, state.lastY);
    this.ctx.lineTo(data.x, data.y);
    this.ctx.stroke();

    state.lastX = data.x;
    state.lastY = data.y;
  }

  // End remote stroke
  endRemoteStroke(userId) {
    const state = this.remoteDrawingState.get(userId);
    if (state) {
      state.isDrawing = false;
    }
  }

  // Update remote cursor position
  updateRemoteCursor(userId, x, y, color) {
    this.remoteCursors.set(userId, { x, y, color });
    this.redrawCursors();
  }

  // Remove remote cursor when user disconnects
  removeRemoteCursor(userId) {
    this.remoteCursors.delete(userId);
    this.remoteDrawingState.delete(userId);
    this.redrawCursors();
  }

  // Redraw all remote cursors on the cursor canvas
  redrawCursors() {
    const rect = this.cursorCanvas.getBoundingClientRect();

    this.cursorCtx.clearRect(0, 0, rect.width, rect.height);

    // Show brush preview circle for both brush and eraser tools
    if (this.showBrushPreview) {
      if (this.currentTool === 'brush') {
        this.cursorCtx.strokeStyle = this.currentColor;
      } else if (this.currentTool === 'eraser') {
        // Show red circle for eraser
        this.cursorCtx.strokeStyle = '#ff0000';
      }
      this.cursorCtx.lineWidth = 2;
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(this.brushPreviewX, this.brushPreviewY, this.brushSize / 2, 0, Math.PI * 2);
      this.cursorCtx.stroke();
    }

    for (let [userId, cursor] of this.remoteCursors) {
      const displayName = this.userNames.get(userId) || userId.substring(0, 8);
      this.cursorCtx.fillStyle = cursor.color;
      this.cursorCtx.strokeStyle = '#ffffff';
      this.cursorCtx.lineWidth = 2;

      const cursorSize = 8;
      this.cursorCtx.beginPath();
      this.cursorCtx.arc(cursor.x, cursor.y, cursorSize, 0, Math.PI * 2);
      this.cursorCtx.fill();
      this.cursorCtx.stroke();

      this.cursorCtx.fillStyle = '#000000';
      this.cursorCtx.font = '10px Arial';
      this.cursorCtx.fillText(displayName, cursor.x + 12, cursor.y + 5);
    }
  }

  // Update user names map for cursor labels
  setUserNames(users) {
    this.userNames.clear();
    users.forEach((user) => {
      const name = user.name || 'Anonymous';
      this.userNames.set(user.id, name);
    });
    this.redrawCursors();
  }

  // Clear the entire canvas
  clearCanvas() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();

    this.ctx.clearRect(0, 0, rect.width, rect.height);
  }

  // Redraw canvas from stroke history (for undo)
  redrawFromHistory(strokes) {
    this.clearCanvas();

    for (let stroke of strokes) {
      const ctx = this.ctx;
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.segments && stroke.segments.length > 0) {
        ctx.beginPath();
        ctx.moveTo(stroke.segments[0].x, stroke.segments[0].y);

        for (let i = 1; i < stroke.segments.length; i++) {
          ctx.lineTo(stroke.segments[i].x, stroke.segments[i].y);
        }

        ctx.stroke();
      }
    }

    this.redrawCursors();
  }

  // Change current tool
  setTool(tool) {
    this.currentTool = tool;
    console.log('Tool changed:', tool);
    this.redrawCursors();
  }

  // Change current color
  setColor(color) {
    this.currentColor = color;
    this.redrawCursors();
  }

  // Change brush size
  setBrushSize(size) {
    this.brushSize = size;
    this.redrawCursors();
  }
}

export default CanvasDrawing;
