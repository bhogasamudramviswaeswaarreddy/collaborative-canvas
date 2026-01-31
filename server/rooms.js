// Room management - one default room for now, structure ready for more

class RoomManager {
    constructor() {
        this.rooms = new Map();
        // Create a default room that everyone joins
        this.createRoom('default');
    }

    createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                id: roomId,
                users: new Map(), // userId -> {socketId, color, name}
                createdAt: Date.now()
            });
        }
    }

    // Add user to a room
    addUser(roomId, userId, socketId, userData) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.users.set(userId, {
                socketId: socketId,
                color: userData.color,
                name: userData.name || 'Anonymous',
                joinedAt: Date.now()
            });
        }
    }

    // Remove user from room
    removeUser(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.users.delete(userId);
        }
    }

    getRoomUsers(roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            const userList = [];
            for (let [id, data] of room.users.entries()) {
                userList.push({
                    id: id,
                    ...data
                });
            }
            return userList;
        }
        return [];
    }

    // Update a user's display name in a room
    updateUserName(roomId, userId, name) {
        const room = this.rooms.get(roomId);
        if (room && room.users.has(userId)) {
            const user = room.users.get(userId);
            const updatedUser = {
                ...user,
                name: name || user.name || 'Anonymous'
            };
            console.log('Updating user in room:', roomId, 'userId:', userId, 'old name:', user.name, 'new name:', updatedUser.name);
            room.users.set(userId, updatedUser);
        } else {
            console.log('User not found in room:', roomId, 'userId:', userId);
        }
    }

    // Find which room a user is in (by socket ID)
    findUserRoom(socketId) {
        for (let [roomId, room] of this.rooms) {
            for (let [userId, userData] of room.users) {
                if (userData.socketId === socketId) {
                    return { roomId, userId };
                }
            }
        }
        return null;
    }
}

module.exports = RoomManager;
