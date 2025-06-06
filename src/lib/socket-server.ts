import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiResponse } from 'next';
import type { Socket as NetSocket } from 'node:net';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

let io: SocketIOServer | null = null;
const onlineUsers = new Map<string, string>(); // userId -> socketId

export const getIO = () => io;

export type NextApiResponseWithSocket = NextApiResponse & {
  socket: NetSocket & {
    server: NetServer & {
      io?: SocketIOServer;
    };
  };
};

export const initSocket = (server: any) => {
  if (!io) {
    io = new SocketIOServer(server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Middleware for authentication
    io.use(async (socket, next) => {
      try {
        //console.log('Middleware - Socket Data:', socket.data);
        // Verify JWT from the client
        // Extract token from handshake
        // const token = socket.handshake.auth.token;

        // if (!token) {
        //   console.log('No token provided');
        //   return next(new Error('Authentication error'));
        // }

        // const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // socket.data.userId = decoded.userId;

        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          console.log('No session found');
          return next(new Error('Authentication error'));
        }
        socket.data.userId = session.user.id;

        next();
      } catch (error) {
        console.error('Authentication error', error);
        return next(new Error('Authentication error'));
      }
    });

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
    });
  }
  return io;
};

// Helper function to emit events to specific users
export const emitToUser = (userId: string, event: string, data: any) => {
  const socketId = onlineUsers.get(userId);
  if (socketId) {
    io?.to(socketId).emit(event, data);
  }
};

// Helper function to check if a user is online
export const isUserOnline = (userId: string) => {
  return onlineUsers.has(userId);
};