# How This Works (Technical Breakdown)

## Overview

When multiple clients connect, they need to see each other's drawings in real-time. The server acts as a relay - it receives drawing events from one client and broadcasts them to everyone else.

### Basic Flow

1. User connects → Server assigns them a unique ID and color
2. Server sends all existing strokes to the new user
3. When User A draws → Server tells all other users about it
4. Users B, C, D see User A's strokes appearing on their canvas

This is called "client-server architecture".

### 2. Drawing Flow (Real-time Synchronization)

```
User A (Drawing)                Server                    User B (Viewing)
     │                             │                             │
     ├─ mousedown                  │                             │
     ├──► draw-start ─────────────►│                             │
     │                             │                             │
     ├─ mousemove                  │                             │
     ├──► draw-move ──────────────►├──► remote-draw ───────────►├─ Draw on canvas
     │   (x, y, color, width)      │    (broadcast to others)    │
     │                             │                             │
     ├─ mousemove                  │                             │
     ├──► draw-move ──────────────►├──► remote-draw ───────────►├─ Draw on canvas
     │                             │                             │
     │                             │                             │
     ├─ mouseup                    │                             │
     ├──► draw-end ────────────────►│                             │
     │                             ├─ Save complete stroke       │
     │                             │   to history                │
     └─ Drawing complete           └─ Stroke saved              │
```

**Key Design Decisions:**

1. **Segment-based transmission** - Instead of sending entire paths, we send individual movement points
   - Pros: Lower latency, users see strokes as they happen
   - Cons: More network messages (mitigated by throttling)

2. **Stroke completion** - Only complete strokes are saved to history
   - This makes undo work cleanly (one stroke = one action)

3. **Broadcast pattern** - Server broadcasts to all OTHER clients (not back to sender)
   - Sender draws locally for immediate feedback
   - No round-trip delay for the drawing user

### 3. Cursor Indicator Flow

```
Client A                          Server                    Client B
   │                               │                             │
   ├─ mousemove (throttled)        │                             │
   ├──► cursor-move ───────────────►├──► remote-cursor ─────────►├─ Update cursor
   │    (x, y)                      │    (userId, x, y, color)   │   overlay
   │                               │                             │
```

**Throttling Strategy:**
- Cursor updates limited to max 1 per 50ms (20 updates/sec)
- Prevents server overload while maintaining smooth visuals
- Could be increased/decreased based on network conditions

## 🗄️ State Management

### Server-Side State

The server maintains two main data structures:

#### 1. Stroke History (StateManager)

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
        // ... more segments
      ]
    },
    // ... more strokes
  ]
}
```

**Why store segments?**
- Allows redrawing exact strokes during undo
- Enables potential features like stroke replay or animation
- Could compress segments later for optimization

#### 2. Room Data (RoomManager)

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
        // ... more users
      }
    }
  }
}
```

**Room system benefits:**
- Ready for multiple isolated canvases
- Easy to add private/public rooms later
- Clean user management per room

### Client-Side State

Each client maintains:

```javascript
{
  // Drawing state
  isDrawing: boolean,
  lastX: number,
  lastY: number,
  currentTool: string,
  currentColor: string,
  brushSize: number,
  
  // Remote tracking
  remoteCursors: Map<userId, {x, y, color}>,
  remotePositions: Map<userId, {x, y}>  // For smooth line drawing
}
```

## 🔧 WebSocket Message Protocol

### Client → Server Events

| Event | Data | Purpose |
|-------|------|---------|
| `draw-start` | `{color, width, tool}` | Notify drawing started |
| `draw-move` | `{x, y, color, width, tool}` | Send stroke segment |
| `draw-end` | (empty) | Notify drawing finished |
| `cursor-move` | `{x, y}` | Update cursor position |
| `undo` | (empty) | Request global undo |
| `clear-canvas` | (empty) | Clear entire canvas |

### Server → Client Events

| Event | Data | Purpose |
|-------|------|---------|
| `init` | `{userId, userColor, strokes, users}` | Initial setup data |
| `remote-draw` | `{userId, x, y, color, width, tool}` | Drawing from another user |
| `remote-cursor` | `{userId, x, y, color}` | Cursor position update |
| `canvas-update` | `{action, strokes}` | Full canvas sync (undo/clear) |
| `user-joined` | `{id, color}` | New user connected |
| `user-left` | `{userId}` | User disconnected |

### Message Size Optimization

**Current approach:**
- Each `draw-move` event is ~50-100 bytes
- At 60 FPS, that's ~6KB/sec per user drawing
- With 10 simultaneous users drawing: ~60KB/sec server bandwidth

**Possible optimizations** (not implemented):
- Batch multiple segments into one message
- Use binary protocol instead of JSON
- Delta encoding (only send position changes)
- Compress long-running strokes

## ↩️ Undo/Redo Logic

### Global Undo Implementation

This was the trickiest part. Here's how it works:

```
1. User clicks Undo
2. Client sends 'undo' event to server
3. Server:
   - Removes last stroke from history array
   - Broadcasts full stroke history to ALL clients
4. All clients:
   - Clear their canvas
   - Redraw every stroke from history in order
```

**Why redraw everything?**

Alternative approaches considered:

❌ **Option 1: Store canvas snapshots**
- Pros: Fast undo (just load snapshot)
- Cons: High memory usage, complex to manage

❌ **Option 2: Reverse individual operations**
- Pros: Efficient
- Cons: Very complex (how do you "un-draw" a partially overlapping stroke?)

✅ **Option 3: Redraw from history (chosen)**
- Pros: Simple logic, reliable, easy to implement
- Cons: Slower for large histories (but acceptable for <1000 strokes)

### Redo (Not Implemented)

To add redo, I would:
1. Add a `redoStack` array to StateManager
2. When undoing, push removed stroke to redoStack
3. Clear redoStack when new drawing happens
4. On redo, pop from redoStack and push back to strokes

Didn't implement because:
- Time constraint
- Undo covers 80% of use cases
- Redo adds complexity for conflict resolution

## ⚡ Performance Considerations

### 1. Canvas Coordinate Mapping

**Problem:** CSS canvas size ≠ internal canvas resolution

```javascript
// Must scale mouse coordinates
const scaleX = canvas.width / rect.width;
const scaleY = canvas.height / rect.height;

const x = (event.clientX - rect.left) * scaleX;
const y = (event.clientY - rect.top) * scaleY;
```

**Why this matters:**
- If canvas is 1920x1080 but CSS displays at 960x540
- Without scaling, all clicks would be off by 2x

### 2. Drawing Smoothness

**Techniques used:**

1. **lineCap and lineJoin**
   ```javascript
   ctx.lineCap = 'round';
   ctx.lineJoin = 'round';
   ```
   - Prevents jagged corners
   - Makes strokes look natural

2. **Continuous paths**
   - Drawing from lastX/lastY to currentX/currentY
   - Creates connected lines instead of dots

3. **Event frequency**
   - Mouse moves fire at ~60 FPS
   - Each event is immediately sent (no batching yet)
   - Could be optimized with requestAnimationFrame

### 3. Network Optimization

**Current throttling:**
- Cursor updates: 50ms (20/sec)
- Drawing updates: No throttling (immediate)

**Why no throttling on drawing?**
- Drawing accuracy is priority
- Throttling would cause gaps in lines
- Network can handle 60 messages/sec per user

### 4. Memory Management

**Current limitations:**
- Max 1000 strokes in history
- Older strokes removed when limit reached
- No stroke compression

**Production improvements needed:**
- Compress stroke segments (remove redundant points)
- Store in database instead of RAM
- Implement canvas chunking for large drawings

## 🤔 Conflict Handling

### What happens when two users draw at the same time?

**Current approach: Eventual consistency**

```
Time: 0ms
User A draws line at (10,10) → (20,20)
User B draws line at (10,10) → (20,20)

Time: 50ms (network delay)
Server receives A's stroke → broadcasts to B
Server receives B's stroke → broadcasts to A

Time: 100ms
Both users see both strokes
Order determined by server receive time
```

**No locking mechanism because:**
- Locking would add latency
- Drawing is additive (no deletions)
- Last-write-wins is acceptable for art

**Edge cases:**

1. **Overlapping strokes**
   - Both strokes are drawn
   - Order doesn't really matter visually
   - Both saved to history

2. **Simultaneous undo**
   - Server processes one first
   - Second undo removes the next stroke
   - Could result in unexpected behavior
   - Fix: Add undo cooldown or queue

3. **Network partition**
   - User loses connection while drawing
   - Their active stroke is lost (not saved)
   - Reconnect shows current state
   - Fix: Send periodic "checkpoint" events

## 🏗️ Architecture Trade-offs

### What I prioritized:

1. **Simplicity over optimization**
   - Clear, readable code
   - Easy to understand data flow
   - Avoided premature optimization

2. **Real-time over accuracy**
   - Immediate feedback
   - Accept eventual consistency
   - Smooth UX more important than perfect sync

3. **Scalability considerations**
   - Room system ready for expansion
   - State manager can be swapped with database
   - WebSocket can be replaced with WebRTC for peer-to-peer

### What I'd change for production:

1. **Database integration**
   - PostgreSQL for metadata (users, rooms)
   - Redis for active stroke buffer
   - S3 for completed drawings

2. **Authentication**
   - User accounts and sessions
   - Private vs public canvases
   - Permissions system

3. **Better state sync**
   - Operational transformation for conflicts
   - CRDT-based stroke management
   - Vector clocks for causality

4. **Performance monitoring**
   - Track websocket message rates
   - Canvas redraw performance
   - Server memory usage
   - Network bandwidth per user

## 🐛 Known Issues & Edge Cases

1. **Fast drawing creates gaps**
   - When mouse moves very fast, segments might be far apart
   - Fix: Interpolate points between segments

2. **Memory leak with many users**
   - remoteCursors Map grows indefinitely
   - Fix: Clean up on user disconnect (partially done)

3. **Canvas doesn't persist**
   - Server restart = lost drawings
   - Fix: Save to database periodically

4. **No conflict resolution for undo**
   - Race condition if two users undo simultaneously
   - Fix: Add undo queue with debouncing

## 📚 Learning Outcomes

**Hardest challenges:**

1. Getting coordinate mapping right with CSS scaling
2. Deciding on stroke vs segment storage
3. Making undo work globally without flickering
4. Balancing network efficiency with drawing smoothness

**Specific bugs I had to fix:**

1. **Remote strokes connecting** - When User B started drawing, strokes connected to where User A left off instead of starting fresh. Took 2+ hours to debug. Fixed by tracking separate lastX/lastY per user.

2. **Clear canvas wasn't working** - Using `canvas.width = canvas.width` didn't clear. The real issue was CSS scaling and devicePixelRatio. Switched to using getBoundingClientRect().

3. **Undo removing wrong stroke** - Strokes stored in object, lost order. Switched to array.

4. **Cursor leak** - Removed users' cursors stayed on canvas. Added cleanup functions.

5. **New users didn't see online list** - Disconnect handler wasn't broadcasting updates. Added io.emit('users-list-update').

**What I'd change:**

- Database integration from day 1 (having to redo state management later was painful)
- Better logging/debugging tools earlier
- Simulate network lag during testing (would have caught race conditions)
- Implement redo with undo (much harder to retrofit)
- Use TypeScript instead (would have caught state bugs)

**Main learning:**

Global undo forced me to think of the canvas as a replay of operations, not a static image. This is how event sourcing works - something I'd never understood before.

---

*This is my honest documentation of what I built and learned. Not perfect, but real.*
