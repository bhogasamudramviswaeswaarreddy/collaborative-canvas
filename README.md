# Collaborative Drawing Canvas

A real-time drawing app where multiple people can draw on the same canvas at the same time. Built as a learning project to understand WebSockets and multi-user state synchronization.

## Features

- Real-time drawing with other users
- Brush and eraser tools
- Color picker with presets
- See other users' cursors while they draw
- Undo button (affects all users)
- Clear canvas (global)
- Works on desktop and touch devices

## How to Run

Prerequisites: Node.js and npm

Install dependencies:

```bash
npm install
npm run client:install
```

### Dev mode (React + server)

```bash
npm run dev
npm run client:dev
```

Open http://localhost:5173 in your browser. The React dev server proxies Socket.io to the backend.

### Production mode

```bash
npm run client:build
npm start
```

Then open http://localhost:3000 in your browser.

## Testing Collaborative Features

Open the app in 2+ browser windows/tabs and start drawing. You should see:
- Your own drawing appears instantly
- Other users' drawings appear in real-time in their own colors
- When you click Undo, it removes the last stroke for everyone
- You can see cursors of other users moving around

## Known Limitations

- State is in memory only; a server restart wipes drawings.
- Undo is global and redraws from history, so large canvases can feel slower.
- No conflict resolution if two users undo at the same time.
- High latency can make cursors jump around.

## Time Spent

Roughly 8–12 hours over 2–3 days.

## Tech Stack

- Frontend: React + Vite + HTML5 Canvas
- Backend: Node.js + Express
- Real-time: Socket.io WebSockets
- No database (stores in memory)
