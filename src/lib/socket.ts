import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

export const initSocket = () => {
  if (!socket) {
    socket = io('/api/socketio', {
      path: '/api/socketio',
      addTrailingSlash: false,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

<<<<<<< HEAD
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
=======
    io.on('connection', (socket) => {
      const userId = socket.data.userId;
      console.log('Client connected:', socket.id, 'User:', userId);
      
      // Update online status
      onlineUsers.set(userId, socket.id);
      io?.emit('user-online', userId);

      // Join user's personal room for direct messages
      socket.join(`user:${userId}`);

      socket.on('join-conversation', (conversationId: string) => {
        socket.join(`conversation:${conversationId}`);
        console.log(`Client ${socket.id} joined conversation: ${conversationId}`);
      });

      socket.on('leave-conversation', (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`);
        console.log(`Client ${socket.id} left conversation: ${conversationId}`);
      });

      // Handle new messages
      socket.on('new-message', (message) => {
        // Broadcast to all users in the conversation including the sender
        if (io) {
          io.to(`conversation:${message.conversationId}`).emit('message-received', message);
        }
      });

      // Typing indicators
      socket.on('typing-start', (conversationId: string) => {
        socket.to(`conversation:${conversationId}`).emit('user-typing', {
          userId,
          conversationId
        });
      });

      socket.on('typing-stop', (conversationId: string) => {
        socket.to(`conversation:${conversationId}`).emit('user-stopped-typing', {
          userId,
          conversationId
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        onlineUsers.delete(userId);
        io?.emit('user-offline', userId);
      });
>>>>>>> origin/master
    });
  }
  return socket;
};

export const getSocket = () => socket;