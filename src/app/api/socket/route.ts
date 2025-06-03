import { NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { Server as NetServer } from 'http';

let io: SocketIOServer | null = null;

export async function GET(req: Request) {
  try {
    if (!io) {
      const res = new NextResponse();
      io = new SocketIOServer({
        path: '/api/socket',
        addTrailingSlash: false,
        cors: {
          origin: process.env.NEXT_PUBLIC_APP_URL || '*',
          methods: ['GET', 'POST']
        }
      });

      io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        socket.on('join-conversation', (conversationId: string) => {
          socket.join(`conversation:${conversationId}`);
        });

        socket.on('leave-conversation', (conversationId: string) => {
          socket.leave(`conversation:${conversationId}`);
        });
      });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Socket initialization error:', error);
    return NextResponse.json({ error: 'Failed to initialize socket' }, { status: 500 });
  }
} 