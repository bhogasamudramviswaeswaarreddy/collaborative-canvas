// Drawing history manager - keeps strokes in array for easy undo

class StateManager {
    constructor() {
        // stroke history (tried stack but array is simpler for new users)
        this.strokes = [];
        this.maxHistory = 1000; // Prevent memory issues if someone draws too much
    }

    // Add stroke to history
    addStroke(stroke) {
        // stroke has: userId, segments, color, width, tool
        if (!stroke) return; // just in case
        if (!stroke.segments || stroke.segments.length === 0) return; // need segments
        this.strokes.push(stroke);
        console.log('Stroke added. Total:', this.strokes.length); // DEBUG
        
        // Keep history manageable
        // TODO: Maybe compress old strokes to reduce memory? (not urgent)
        if (this.strokes.length > this.maxHistory) {
            this.strokes.shift(); // Remove oldest stroke
            console.warn('Reached max history, removing oldest'); // DEBUG
        }
    }

    // Remove last stroke for undo (returns it for possible redo)
    removeLastStroke() {
        if (this.strokes.length > 0) {
            return this.strokes.pop();
        }
        return null;
    }

    // Get all strokes (for new users joining)
    getAllStrokes() {
        return this.strokes;
    }

    // Clear everything
    clearCanvas() {
        this.strokes = [];
    }

    // Get total number of strokes
    getStrokeCount() {
        return this.strokes.length;
    }
}

module.exports = StateManager;
