import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { initSocket, getIO } from '@/lib/socket';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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