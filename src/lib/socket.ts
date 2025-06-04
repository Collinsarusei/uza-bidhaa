import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { NextApiResponse } from 'next';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

let io: SocketIOServer | null = null;
const onlineUsers = new Map<string, string>(); // userId -> socketId

export const getIO = () => io;

export type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: NetServer & {
      io?: SocketIOServer;
    };
  };
};

export const initSocket = (res: NextApiResponseWithSocket) => {
  if (!res.socket.server.io) {
    io = new SocketIOServer(res.socket.server, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || '*',
        methods: ['GET', 'POST']
      }
    });

    // Middleware for authentication
    io.use(async (socket, next) => {
      try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
          return next(new Error('Unauthorized'));
        }
        socket.data.userId = session.user.id;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
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

    res.socket.server.io = io;
  }
  return res.socket.server.io;
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