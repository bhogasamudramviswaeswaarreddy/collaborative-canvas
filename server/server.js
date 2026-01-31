// Server - Express + Socket.io setup
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const StateManager = require('./drawing-state');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Initialize managers
const stateManager = new StateManager();
const roomManager = new RoomManager();
// TODO: cap history per room or persist to disk for longer sessions

// Serve static files from React build output
const clientDistPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientDistPath));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Store current strokes being drawn (temporary until mouseup)
// had to use Map instead of object because socketId includes special chars
const activeStrokes = new Map(); // socketId -> current stroke data

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // random color (tried color lib but manual is fine)
    const userColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    console.log('Generated color:', userColor, 'for user:', userId); // DEBUG: remove later

    // Add user to default room
    roomManager.addUser('default', userId, socket.id, {
        color: userColor,
        name: 'Anonymous'
    });

    // Send initial data to new user
    socket.emit('init', {
        userId: userId,
        userColor: userColor,
        strokes: stateManager.getAllStrokes(),
        users: roomManager.getRoomUsers('default')
    });

    // Broadcast to others that new user joined
    const newUser = roomManager.getRoomUsers('default').find(u => u.id === userId);
    socket.broadcast.emit('user-joined', {
        id: userId,
        color: userColor,
        name: newUser?.name || 'Anonymous'
    });
    
    // Broadcast updated user list to ALL clients (including the new one)
    io.emit('users-list-update', {
        users: roomManager.getRoomUsers('default')
    });

    // Handle user setting their display name (first-time prompt or refresh)
    socket.on('set-name', (data) => {
        const rawName = typeof data?.name === 'string' ? data.name : '';
        const trimmed = rawName.trim();
        const safeName = trimmed.length > 0 ? trimmed.substring(0, 32) : 'Anonymous';

        console.log('Received set-name event. UserId:', userId, 'Raw name:', rawName, 'Safe name:', safeName);
        roomManager.updateUserName('default', userId, safeName);
        
        const updatedUsers = roomManager.getRoomUsers('default');
        console.log('Updated user list:', JSON.stringify(updatedUsers));

        // Broadcast updated user list to ALL clients
        io.emit('users-list-update', {
            users: updatedUsers
        });
    });

    // Handle drawing start
    // track by socket.id for easier cleanup on disconnect
    socket.on('draw-start', (data) => {
        if (!data) return;
        activeStrokes.set(socket.id, {
            userId: userId,
            color: data.color,
            width: data.width,
            tool: data.tool,
            segments: [{
                x: data.x,
                y: data.y,
                timestamp: Date.now()
            }]
        });
        
        socket.broadcast.emit('remote-draw-start', {
            userId: userId,
            x: data.x,
            y: data.y,
            color: data.color,
            width: data.width,
            tool: data.tool
        });
    });

    socket.on('draw-move', (data) => {
        if (!data) return;
        const stroke = activeStrokes.get(socket.id);
        if (stroke) {
            stroke.segments.push({
                x: data.x,
                y: data.y,
                timestamp: Date.now()
            });
        }

        socket.broadcast.emit('remote-draw', {
            userId: userId,
            x: data.x,
            y: data.y,
            color: data.color,
            width: data.width,
            tool: data.tool
        });
    });

    socket.on('draw-end', () => {
        const stroke = activeStrokes.get(socket.id);
        if (stroke && stroke.segments.length > 0) {
            stateManager.addStroke(stroke);
            activeStrokes.delete(socket.id);
        } else if (stroke) {
            activeStrokes.delete(socket.id);
        }
        
        socket.broadcast.emit('remote-draw-end', {
            userId: userId
        });
    });

    socket.on('cursor-move', (data) => {
        socket.broadcast.emit('remote-cursor', {
            userId: userId,
            x: data.x,
            y: data.y,
            color: userColor
        });
    });

    // undo request - global, affects everyone (server owns history)
    socket.on('undo', () => {
        const removedStroke = stateManager.removeLastStroke();
        if (removedStroke) {
            // Tell everyone to redraw from history
            io.emit('canvas-update', {
                action: 'undo',
                strokes: stateManager.getAllStrokes()
            });
            console.log('Undo performed. Remaining strokes:', stateManager.getStrokeCount());
        }
    });

    // Handle clear canvas
    socket.on('clear-canvas', () => {
        stateManager.clearCanvas();
        io.emit('canvas-update', {
            action: 'clear',
            strokes: []
        });
        console.log('Canvas cleared');
    });

    socket.on('disconnect', () => {
        const activeStroke = activeStrokes.get(socket.id);
        if (activeStroke && activeStroke.segments.length > 0) {
            stateManager.addStroke(activeStroke);
        }
        activeStrokes.delete(socket.id);
        
        roomManager.removeUser('default', userId);
        
        io.emit('users-list-update', {
            users: roomManager.getRoomUsers('default')
        });
        
        socket.broadcast.emit('remote-draw-end', {
            userId: userId
        });
        
        socket.broadcast.emit('user-left', {
            userId: userId
        });
    });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
