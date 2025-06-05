import { Server as SocketIOServer } from 'socket.io';

// Get socket instance and online users map
const onlineUsers = new Map<string, string>();

// Helper function to emit events to specific users
export const emitToUser = (io: SocketIOServer | null, userId: string, event: string, data: any) => {
  const socketId = onlineUsers.get(userId);
  if (socketId && io) {
    io.to(socketId).emit(event, data);
  }
};

// Helper function to check if a user is online
export const isUserOnline = (userId: string) => {
  return onlineUsers.has(userId);
};

// Helper function to add online user
export const addOnlineUser = (userId: string, socketId: string) => {
  onlineUsers.set(userId, socketId);
};

// Helper function to remove online user
export const removeOnlineUser = (userId: string) => {
  onlineUsers.delete(userId);
}; 