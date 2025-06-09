import { NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { getToken } from 'next-auth/jwt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let io: SocketIOServer | null = null;

export async function GET(req: Request) {
  if (!io) {
    const server = (req as any).socket?.server;
    if (!server?.io) {
      io = new SocketIOServer(server, {
        path: '/api/socket',
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

      io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        
        socket.on('join-conversation', (conversationId: string) => {
          socket.join(`conversation:${conversationId}`);
          console.log(`Client ${socket.id} joined conversation: ${conversationId}`);
        });

        socket.on('leave-conversation', (conversationId: string) => {
          socket.leave(`conversation:${conversationId}`);
          console.log(`Client ${socket.id} left conversation: ${conversationId}`);
        });

        socket.on('disconnect', () => {
          console.log('Client disconnected:', socket.id);
        });
      });

      server.io = io;
    }
  }

  return NextResponse.json({ success: true });
}