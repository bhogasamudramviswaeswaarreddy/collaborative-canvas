# How This Works (Technical Breakdown)

## Overview

So basically, when people connect they need to see each other drawing in real-time. The server acts like a messenger - it gets drawing events from one person and tells everyone else about it. Pretty straightforward stuff.

### Basic Flow

1. Someone connects → Server gives them a unique ID and a color
2. Server sends them all the drawings that are already there
3. When Person A draws → Server broadcasts it to everyone else
4. Everyone else sees Person A's strokes showing up on their canvas

This is the "client-server" model I guess? I didn't even think about alternatives honestly, just seemed like the obvious way.

### 2. Drawing Flow (How it actually happens)

```
Person Drawing                    Server                    Other Person
     │                             │                             │
     ├─ mousedown                  │                             │
     ├──► draw-start ─────────────►│                             │
     │                             │                             │
     ├─ mousemove                  │                             │
     ├──► draw-move ──────────────►├──► remote-draw ───────────►├─ Draws it
     │   (x, y, color, width)      │    (tells everyone)         │
     │                             │                             │
     ├─ mousemove                  │                             │
     ├──► draw-move ──────────────►├──► remote-draw ───────────►├─ More drawing
     │                             │                             │
     │                             │                             │
     ├─ mouseup                    │                             │
     ├──► draw-end ────────────────►│                             │
     │                             ├─ OK saves this stroke       │
     │                             │   to the history            │
     └─ Done drawing               └─ Stroke saved              │
```

**Why I made these choices:**

1. **Send individual points, not the whole path** - Every mousemove I send the current position
   - Good: Less delay, drawing shows up immediately
   - Bad: Sends a LOT of messages (but throttling helped)

2. **Only save complete strokes** - I don't save anything until you let go of the mouse
   - Makes undo way easier (each stroke = one undo)

3. **Don't send back to yourself** - Server tells EVERYONE EXCEPT YOU
   - You see your drawing instantly locally
   - Server doesn't send it back to you (that would be slow)

### 3. Cursors (the other user's mouse)

```
My Client                          Server                    Their Client
   │                               │                             │
   ├─ mouse moves                  │                             │
   ├──► cursor-move ──────────────►├──► remote-cursor ────────►├─ Show cursor
   │    (x, y)                      │    (userId, x, y, color)   │   on screen
   │                               │                             │
```

**How I throttle this:**
- Only send cursor position once every 50ms (like 20 times a second)
- Stops the server from drowning in cursor updates
- Still looks smooth on screen
- Could change this if it feels laggy
 (where stuff lives)

### On the Server Side

The server just stores two thing
The server keeps two main data structures in memory:
All the Strokes (StateManager)

```javascript
{
  strokes: [
    {
      userId: "user_123",
      color: "#ff0000",
      width: 5,
      tool: "brush",
      segments: [
        {x: 100, y: 200, timestamp: 1234567890},
        {x: 101, y: 201, timestamp: 1234567891},
        // ... more points
      ]
    },
    // ... more strokes
  ]
}
```

**Why segments?**
- So I can redraw them when undo happens
- Maybe later I'll do cool stuff like replaying the drawing
- Haven't had to optimize this yet

#### 2. Who's Online (RoomManager)

```javascript
{
  rooms: Map {
    "default" => {
      id: "default",
      users: Map {
        "user_123" => {
          socketId: "abc123",
          color: "#ff0000",
          name: "User 123",
          joinedAt: 1234567890
        },
        // ... other people
      }
    }
  }
}
```

**Why I set it up this way:**
- Can add multiple rooms later (like private canvas or something)
- Each room is isolated (one room's drawing doesn't affect another)
- Users tied to rooms makes cleanup easier

### On the Client Side

Each browser keeps track of:

```javascript
{
  // My drawing state
  isDrawing: boolean,
  lastX: number,
  lastY: number,
  currentTool: string,
  currentColor: string,
  brushSize: number,
  
  // Other people's stuff
  remoteCursors: Map<userId, {x, y, color}>,
  remotePositions: Map<userId, {x, y}>  // For drawing their lines
}
```

## 🔧 Socket.io Messages

### Client sends these:

| Event | Data | What it does |
|-------|------|---------|
| `draw-start` | `{x, y, color, width, tool}` | "I started drawing" |
| `draw-move` | `{x, y, color, width, tool}` | "Here's the next point" |
| `draw-end` | (nothing) | "OK I'm done" |
| `cursor-move` | `{x, y}` | "My cursor is here" |
| `undo` | (nothing) | "Delete last stroke" |
| `clear-canvas` | (nothing) | "Wipe everything" |
| `set-name` | `{name}` | "Call me this" |

### Server sends these back:

| Event | Data | What it means |
|-------|------|---------|
| `init` | `{userId, userColor, strokes, users}` | "Here's your info + everything drawn so far" |
| `remote-draw-start` | `{userId, x, y, color, width, tool}` | "Someone started drawing" |
| `remote-draw` | `{userId, x, y, color, width, tool}` | "They drew here" |
| `remote-draw-end` | `{userId}` | "They finished" |
| `remote-cursor` | `{userId, x, y, color}` | "Their cursor moved" |
| `canvas-update` | `{action, strokes}` | "Redraw everything (undo/clear happened)" |
| `user-joined` | `{id, color, name}` | "New person connected" |
| `user-left` | `{userId}` | "Someone disconnected" |
| `users-list-update` | `{users}` | "Here's the updated list of who's here" |

## ↩️ Undo (the hardest part)

### How it works

```
1. Someone clicks Undo
2. Their browser sends 'undo' to server
3. Server:
   - Removes the last stroke from the list
   - Tells EVERYONE "here's the new list of strokes"
4. Everyone's browser:
   - Clears the canvas
   - Redraws every stroke in order
```

**Why redraw everything?**

I thought about other ways but they all sucked:

❌ **Snapshots** - Save a picture before each stroke
- Fast to restore but uses SO much memory
- Messy to manage

❌ **Undo each action** - Somehow reverse the drawing
- Super complicated (how do you "undraw" something that overlaps?)
- Math would be a nightmare

✅ **Redraw from scratch (what I did)** - Keep a list, rebuild on undo
- Super simple code
- Works perfectly
- Little slower with huge histories but fine for <1000 strokes

### Redo - didn't do it

Ran out of time. Undo is enough honestly.

## ⚡ The Performance Stuff I Had to Deal With

### 1. Canvas Coordinate Hell

**The problem:** The actual canvas resolution (like 1920x1080) doesn't match what the browser displays due to CSS

```javascript
// Gotta scale everything
const scaleX = canvas.width / rect.width;
const scaleY = canvas.height / rect.height;

const x = (event.clientX - rect.left) * scaleX;
const y = (event.clientY - rect.top) * scaleY;
```

**Why this matters:**
- Mess this up = all clicks are off by 2x
- Wasted SO much time on this before I figured it out

2. **Making Lines Look Good**

How I made drawing not suck:

1. **Rounded corners**
   ```javascript
   ctx.lineCap = 'round';
   ctx.lineJoin = 'round';
   ```
   - Not sharp and weird looking

2. **Connect the dots**
   - Draw a line from the last point to the current point
   - Not just random dots scattered

3. **Send it NOW**
   - Mouse moves ~60 times per second
   - Send each one right away (no grouping)
   - Could optimize with requestAnimationFrame but doesn't need it yet

### 3. Network Stuff

**What gets throttled:**
- Cursor: Only send once every 50ms (like 20 times/sec)
- Drawing: Send immediately every time

**Why not throttle drawing?**
- If I slow it down you get gaps in your line
- Would feel like lag
- Network can handle it (60 msgs/sec is chill)

### 4. Memory

**Limits:**
- Keep max 1000 strokes
- Oldest ones get deleted if we hit the limit
- Haven't needed to optimize yet

## 🤔 What Happens With Weird Timing

**Two people drawing at exactly the same time:**

```
Time: 0ms
Person A draws at (10,10) → (20,20)
Person B draws at (10,10) → (20,20)

Time: 50ms (lag)
Server gets A's stroke → tells B
Server gets B's stroke → tells A

Time: 100ms
Both see both strokes
Whoever sent first wins (but doesn't really matter)
```

**Why no locks?**
- Locks = slow
- Drawing just adds stuff, doesn't edit
- Drawing app doesn't care about order

**Edge cases that could happen:**

1. **Strokes on top of each other**
   - Both show up
   - Order based on who the server heard from first
   - No big deal

2. **Connection drops mid-stroke**
   - Stroke gets saved anyway (disconnect code handles it)
   - Reconnect shows everything

## 🏗️ What I Decided To Do

### My priorities:

1. **Simple > Fancy**
   - Code I can understand later
   - Simple data flow
   - No over-engineering

2. **Fast UI > Perfect accuracy**
   - You see your stroke instantly
   - Other people see it in a moment
   - Feels good > technically perfect

3. **Think about scale**
   - Room system could handle multiple canvases
   - Could swap in a database later
   - Could go peer-to-peer with WebRTC if needed

### What I'd fix for a real app:

1. **Save to a database** - drawings disappear on server restart
2. **Add login** - accounts and private canvases
3. **Handle more users** - right now it's just one room

## 🐛 Known Issues

1. **Fast mouse = gaps**
   - If you draw really fast, points get far apart
   - Could fix by adding more points between them

2. **Nothing saves**
   - Restart the server = everything's gone
   - On purpose (learning project, not production)

## 📚 How I Built This

**Hardest parts:**

1. Canvas coordinate scaling - invisible bug that broke everything
2. Deciding what to save and how
3. Making undo not flicker
4. Network efficiency while keeping it responsive

**Bugs I actually had to fix:**

1. **Other people's strokes were connecting** - When User B started drawing, it continued from where User A left off. Spent forever on this. Fixed by tracking separate coords per user.

2. **Canvas wasn't actually clearing** - `canvas.width = canvas.width` doesn't work. Turned out to be the devicePixelRatio. Used getBoundingClientRect() instead.

3. **Undo was deleting random strokes** - Stored strokes in an object so I lost the order. Switched to an array.

4. **Ghost cursors** - Removed users' cursors stayed on screen forever. Added cleanup functions.

5. **New people didn't see the user list** - Disconnect wasn't broadcasting the updated list. Added io.emit.

**What I learned:**

The undo thing made me realize you can think of a canvas as just replaying all the operations. That's event sourcing - kind of blew my mind.

---

*This is my honest documentation of what I built and learned. Not perfect, but real.*
