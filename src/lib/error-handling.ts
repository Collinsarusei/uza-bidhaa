import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public meta?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleApiError(error: unknown) {
  console.error('API Error:', error);

  if (error instanceof AppError) {
    return NextResponse.json(
      { 
        message: error.message,
        code: error.code,
        meta: error.meta 
      }, 
      { status: error.statusCode }
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return NextResponse.json(
          { 
            message: 'A record with this value already exists',
            code: error.code,
            meta: error.meta 
          }, 
          { status: 409 }
        );
      case 'P2025':
        return NextResponse.json(
          { 
            message: 'Record not found',
            code: error.code,
            meta: error.meta 
          }, 
          { status: 404 }
        );
      default:
        return NextResponse.json(
          { 
            message: 'Database error occurred',
            code: error.code,
            meta: error.meta 
          }, 
          { status: 500 }
        );
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      { 
        message: 'Invalid data provided',
        error: error.message 
      }, 
      { status: 400 }
    );
  }

  return NextResponse.json(
    { 
      message: 'An unexpected error occurred',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 
    { status: 500 }
  );
}

export function validateAuth(session: any) {
  if (!session?.user?.id) {
    throw new AppError('Unauthorized', 401);
  }
  return session.user.id;
}

export function validateAdmin(session: any) {
  if (!session?.user?.id || (session.user as any).role !== 'ADMIN') {
    throw new AppError('Forbidden: Admin access required', 403);
  }
  return session.user.id;
}

export function validateResourceAccess(userId: string, resourceUserId: string) {
  if (userId !== resourceUserId) {
    throw new AppError('Forbidden: Cannot access this resource', 403);
  }
} 