// Main app - wires up canvas and websocket
import CanvasDrawing from './canvas.js';
import WebSocketHandler from './websocket.js';

class DrawingApp {
  constructor() {
    this.canvas = null;
    this.websocket = null;

    // UI elements
    this.colorPicker = null;
    this.brushSizeSlider = null;
    this.sizeDisplay = null;

    // expose for existing canvas/websocket hooks
    window.drawingApp = this;
  }

  init() {
    console.log('Starting drawing app...');
    
    // Initialize canvas
    this.canvas = new CanvasDrawing('drawing-canvas', 'cursor-canvas');

    // Connect to server
    this.websocket = new WebSocketHandler();
    this.websocket.connect();

    // Setup UI controls
    this.setupUIControls();
    this.connectCanvasToWebSocket();
  }

  // Setup all UI control event listeners
  setupUIControls() {
    // Tool buttons
    const brushBtn = document.getElementById('brush-btn');
    const eraserBtn = document.getElementById('eraser-btn');

    brushBtn.addEventListener('click', () => {
      this.canvas.setTool('brush');
      brushBtn.classList.add('active');
      eraserBtn.classList.remove('active');
    });

    eraserBtn.addEventListener('click', () => {
      this.canvas.setTool('eraser');
      eraserBtn.classList.add('active');
      brushBtn.classList.remove('active');
    });

    this.colorPicker = document.getElementById('color-picker');
    this.colorPicker.addEventListener('change', (e) => {
      this.canvas.setColor(e.target.value);
    });

    document.querySelectorAll('.color-preset').forEach((preset) => {
      preset.addEventListener('click', () => {
        const color = preset.getAttribute('data-color');
        this.colorPicker.value = color;
        this.canvas.setColor(color);
      });
    });

    this.brushSizeSlider = document.getElementById('brush-size');
    this.sizeDisplay = document.getElementById('size-display');

    this.brushSizeSlider.addEventListener('input', (e) => {
      const size = parseInt(e.target.value, 10);
      this.canvas.setBrushSize(size);
      this.sizeDisplay.textContent = size + 'px';
    });

    const undoBtn = document.getElementById('undo-btn');
    undoBtn.addEventListener('click', () => {
      this.websocket.sendUndo();
    });

    const clearBtn = document.getElementById('clear-btn');
    clearBtn.addEventListener('click', () => {
      this.websocket.sendClear();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this.websocket.sendUndo();
      }

      if (e.key === 'b' || e.key === 'B') {
        brushBtn.click();
      }

      if (e.key === 'e' || e.key === 'E') {
        eraserBtn.click();
      }
    });
  }

  connectCanvasToWebSocket() {
    this.onDrawStart = (data) => {
      this.websocket.sendDrawStart(data);
    };

    this.onDrawMove = (data) => {
      this.websocket.sendDrawMove(data);
    };

    // When drawing ends
    this.onDrawEnd = () => {
      this.websocket.sendDrawEnd();
    };

    // When cursor moves
    this.onCursorMove = (coords) => {
      this.websocket.sendCursorMove(coords);
    };
  }
}

export default DrawingApp;
