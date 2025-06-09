import { io as socketIO, Socket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';

// Client-side socket instance
let socket: Socket | undefined;
// Server-side socket instance
let ioServer: SocketIOServer | null = null;
const onlineUsers = new Map<string, string>(); // userId -> socketId

export const initSocket = (server?: any) => {
  if (server) {
    // Server-side initialization
    if (!ioServer) {
      ioServer = new SocketIOServer(server, {
        path: '/api/socket',
        addTrailingSlash: false,
        cors: {
          origin: process.env.NEXT_PUBLIC_APP_URL || '*',
          methods: ['GET', 'POST'],
          credentials: true
        }
      });

      // Middleware for authentication
      ioServer.use(async (socket, next) => {
        try {
          const token = await getToken({ 
            req: socket.request as any,
            secret: process.env.NEXTAUTH_SECRET 
          });
          
          if (!token?.sub) {
            return next(new Error('Unauthorized'));
          }
          
          socket.data.userId = token.sub;
          next();
        } catch (error) {
          console.error('Socket authentication error:', error);
          next(new Error('Authentication failed'));
        }
      });

      ioServer.on('connection', (socket) => {
        const userId = socket.data.userId;
        if (!userId) {
          console.error('No userId found in socket data');
          socket.disconnect();
          return;
        }

        console.log('Client connected:', socket.id, 'User:', userId);
        
        // Update online status
        onlineUsers.set(userId, socket.id);
        ioServer?.emit('user-online', userId);

        // Join user's personal room for direct messages
        socket.join(`user:${userId}`);

        socket.on('join-conversation', (conversationId: string) => {
          if (!conversationId) {
            console.error('Invalid conversationId received');
            return;
          }
          socket.join(`conversation:${conversationId}`);
          console.log(`Client ${socket.id} joined conversation: ${conversationId}`);
        });

        socket.on('leave-conversation', (conversationId: string) => {
          if (!conversationId) {
            console.error('Invalid conversationId received');
            return;
          }
          socket.leave(`conversation:${conversationId}`);
          console.log(`Client ${socket.id} left conversation: ${conversationId}`);
        });

        // Handle new messages
        socket.on('new-message', (message) => {
          if (!message?.conversationId) {
            console.error('Invalid message format received');
            return;
          }
          // Broadcast to all users in the conversation including the sender
          ioServer?.to(`conversation:${message.conversationId}`).emit('message-received', message);
        });

        // Typing indicators
        socket.on('typing-start', (conversationId: string) => {
          if (!conversationId) {
            console.error('Invalid conversationId received');
            return;
          }
          socket.to(`conversation:${conversationId}`).emit('user-typing', {
            userId,
            conversationId
          });
        });

        socket.on('typing-stop', (conversationId: string) => {
          if (!conversationId) {
            console.error('Invalid conversationId received');
            return;
          }
          socket.to(`conversation:${conversationId}`).emit('user-stopped-typing', {
            userId,
            conversationId
          });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
          console.log('Client disconnected:', socket.id);
          onlineUsers.delete(userId);
          ioServer?.emit('user-offline', userId);
        });
      });
    }
    return ioServer;
  } else {
    // Client-side initialization
    if (!socket) {
      socket = socketIO({
        path: '/api/socket',
        addTrailingSlash: false,
        transports: ['websocket'],
        autoConnect: true,
      });

      socket.on('connect', () => {
        console.log('Socket connected');
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
      });
    }
    return socket;
  }
};

export const getSocket = () => socket;
export const getIO = () => ioServer;

// Helper function to emit events to specific users
export const emitToUser = (userId: string, event: string, data: any) => {
  if (!userId || !event) {
    console.error('Invalid parameters for emitToUser');
    return;
  }
  const socketId = onlineUsers.get(userId);
  if (socketId && ioServer) {
    ioServer.to(socketId).emit(event, data);
  }
};

// Helper function to check if a user is online
export const isUserOnline = (userId: string) => {
  if (!userId) {
    console.error('Invalid userId for isUserOnline check');
    return false;
  }
  return onlineUsers.has(userId);
};