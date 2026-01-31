import React, { useEffect } from 'react';
import DrawingApp from './drawing-app.js';

export default function App() {
  useEffect(() => {
    const app = new DrawingApp();
    app.init();

    return () => {
      if (app.websocket && app.websocket.socket) {
        app.websocket.socket.disconnect();
      }
    };
  }, []);

  return (
    <div>
      <div className="toolbar">
        <div className="tool-section">
          <label>Tool:</label>
          <button id="brush-btn" className="tool-btn active">Brush</button>
          <button id="eraser-btn" className="tool-btn">Eraser</button>
        </div>

        <div className="tool-section">
          <label>Color:</label>
          <input type="color" id="color-picker" defaultValue="#000000" />
          <button className="color-preset" data-color="#000000" style={{ background: '#000000' }}></button>
          <button className="color-preset" data-color="#ff0000" style={{ background: '#ff0000' }}></button>
          <button className="color-preset" data-color="#00ff00" style={{ background: '#00ff00' }}></button>
          <button className="color-preset" data-color="#0000ff" style={{ background: '#0000ff' }}></button>
          <button className="color-preset" data-color="#ffff00" style={{ background: '#ffff00' }}></button>
        </div>

        <div className="tool-section">
          <label>Size:</label>
          <input type="range" id="brush-size" min="1" max="50" defaultValue="5" />
          <span id="size-display">5px</span>
        </div>

        <div className="tool-section">
          <button id="undo-btn" className="action-btn">Undo</button>
          <button id="clear-btn" className="action-btn">Clear All</button>
        </div>

        <div className="tool-section">
          <span id="user-info">Connecting...</span>
        </div>
      </div>

      <div className="canvas-container">
        <canvas id="drawing-canvas"></canvas>
        <canvas id="cursor-canvas"></canvas>
      </div>

      <div className="users-panel">
        <h3>Online Users</h3>
        <div id="users-list"></div>
      </div>

      <div id="name-modal" className="modal">
        <div className="modal-content">
          <h2>Welcome</h2>
          <p>Enter your name (shown to everyone)</p>
          <input type="text" id="name-input" maxLength={32} placeholder="Your name" />
          <div id="name-error" className="modal-error" aria-live="polite"></div>
          <button id="name-submit" className="action-btn">Join</button>
        </div>
      </div>
    </div>
  );
}
