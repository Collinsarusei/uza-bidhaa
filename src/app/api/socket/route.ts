import { NextResponse, NextRequest } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { getToken } from 'next-auth/jwt';

let io: SocketIOServer | null = null;
const onlineUsers = new Map<string, string>(); // userId -> socketId

export const getIO = () => io;

export async function GET(req: NextRequest) {
  try {
    // Get the session token from cookies
    const token = await getToken({ 
      req,
      secret: process.env.NEXTAUTH_SECRET 
    });

    if (!token?.sub) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const userId = token.sub;

    if (!io) {
      io = new SocketIOServer({
        path: '/api/socket',
        addTrailingSlash: false,
        cors: {
          origin: process.env.NEXT_PUBLIC_APP_URL || '*',
          methods: ['GET', 'POST'],
          credentials: true
        }
      });

      // Add authentication middleware
      io.use(async (socket, next) => {
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

        // Handle new messages
        socket.on('new-message', async (message) => {
          try {
            // Broadcast to all users in the conversation except sender
            socket.to(`conversation:${message.conversationId}`).emit('message-received', message);
          } catch (error) {
            console.error('Error handling new message:', error);
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
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Socket initialization error:', error);
    return NextResponse.json({ error: 'Failed to initialize socket' }, { status: 500 });
  }
}

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