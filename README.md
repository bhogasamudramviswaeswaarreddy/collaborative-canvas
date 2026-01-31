# Collaborative Drawing Canvas

A real-time drawing app where multiple people can draw on the same canvas at the same time. I built this to learn WebSockets and figure out how to keep everyone's drawings in sync.

## What it can do

- Draw in real-time with other people
- Pick your brush or eraser
- Choose colors (or just use the presets)
- See where other people's cursors are
- Undo (removes the last stroke for everyone)
- Clear the whole canvas at once
- Works on phones and computers

## Getting it running

You need Node.js and npm first.

```bash
npm install
npm run client:install
```

### During development (hot reload mode)

```bash
npm run dev
npm run client:dev
```

Go to http://localhost:5173 in your browser. React dev server automatically talks to the backend.

### For actual use

```bash
npm run client:build
npm start
```

Then go to http://localhost:3000.

## Try it out with multiple people

Open the app in 2+ different browser tabs or windows and draw. Here's what you'll see:

- Your drawings show up instantly (no lag)
- Other people's drawings appear right away too (in their own colors)
- Click Undo and it removes the last stroke for everyone
- You can see where other people's cursors are moving around

## Stuff that doesn't work perfectly

- Restart the server = all drawings are gone (not saved anywhere)
- Undo regenerates everything from scratch, so it can lag with huge drawings
- If two people undo at the exact same time, weird stuff might happen
- If your internet is really slow, cursors jump around instead of moving smoothly

## How long this took

I spent like 8-12 hours on it over a couple days.

## What I used to build it

- Frontend: React + Vite + Canvas API
- Backend: Node.js + Express
- Real-time stuff: Socket.io
- Database: None (everything in memory)
