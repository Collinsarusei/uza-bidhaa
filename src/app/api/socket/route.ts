import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { initSocket, getIO } from '@/lib/socket';
import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Get socket instance and online users map
const io = getIO();
const onlineUsers = new Map<string, string>();

export async function GET(req: Request) {
  try {
    // Get the session token from cookies
    const token = await getToken({ 
      req: req as any,
      secret: process.env.NEXTAUTH_SECRET 
    });

    if (!token?.sub) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Initialize socket if not already initialized
    const server = (req as any).socket?.server;
    if (!server) {
      throw new Error('Socket server not found');
    }
    
    const io = initSocket(server);
    
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