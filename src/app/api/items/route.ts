// src/app/api/items/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import * as z from 'zod';

// Validation schemas
const createItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  price: z.number().positive("Price must be positive"),
  category: z.string().min(1, "Category is required"),
  location: z.string().min(1, "Location is required"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  mediaUrls: z.array(z.string().url()).optional(),
  offersDelivery: z.boolean().optional(),
  acceptsInstallments: z.boolean().optional(),
  discountPercentage: z.number().min(0).max(100).optional().nullable(),
});

// GET /api/items - Fetch items from PostgreSQL with Prisma
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const userIdToExclude = searchParams.get('userId');
    const sellerIdToInclude = searchParams.get('sellerId');
    const itemIdToFetch = searchParams.get('itemId');
    const categoryFilter = searchParams.get('category');
    const statusQuery = searchParams.get('status');
    const searchTerm = searchParams.get('q');

    let itemStatusFilter: 'AVAILABLE' | 'SOLD' | 'DELISTED' | 'DISPUTED' = 'AVAILABLE';
    if (statusQuery && ['AVAILABLE', 'SOLD', 'DELISTED', 'DISPUTED'].includes(statusQuery)) {
        itemStatusFilter = statusQuery as 'AVAILABLE' | 'SOLD' | 'DELISTED' | 'DISPUTED';
    }

    if (itemIdToFetch) {
        const item = await prisma.item.findUnique({
            where: { id: itemIdToFetch },
            include: {
                seller: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        email: true,
                    },
                },
            },
        });

        if (!item) {
            return NextResponse.json({ message: "Item not found" }, { status: 404 });
        }
        return NextResponse.json([item], {
            headers: {
                'Cache-Control': 'no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            },
        }); 
    }

    let whereClause: {
        status: 'AVAILABLE' | 'SOLD' | 'DELISTED' | 'DISPUTED';
        sellerId?: string | { not: string };
        category?: string;
        OR?: Array<{
            title?: { contains: string; mode: 'insensitive' };
            description?: { contains: string; mode: 'insensitive' };
        }>;
    } = {
        status: itemStatusFilter,
    };

    if (sellerIdToInclude) {
        whereClause.sellerId = sellerIdToInclude;
    } else if (userIdToExclude) {
        whereClause.sellerId = { not: userIdToExclude };
    }

    if (categoryFilter) {
        whereClause.category = categoryFilter;
    }
    
    if (searchTerm) {
        whereClause.OR = [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
        ];
    }

    const items = await prisma.item.findMany({
        where: whereClause,
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            seller: {
                select: {
                    id: true,
                    name: true,
                    image: true,
                    email: true,
                },
            },
        },
    });

    return NextResponse.json(items, {
        headers: {
            'Cache-Control': 'no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        },
    });
  } catch (error) {
    console.error("Error fetching items:", error);
    return NextResponse.json(
      { message: 'Failed to fetch items', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/items - Create a new item
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createItemSchema.parse({
      ...body,
      price: parseFloat(body.price),
      quantity: parseInt(body.quantity, 10),
      discountPercentage: body.discountPercentage ? parseFloat(body.discountPercentage) : null,
    });

    const newItem = await prisma.item.create({
      data: {
        seller: { connect: { id: session.user.id } },
        ...validatedData,
        status: 'AVAILABLE',
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
      },
    });

    // Create notification for the seller
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        type: 'item_listed',
        message: `Your item "${newItem.title}" has been successfully listed!`,
        relatedItemId: newItem.id,
      },
    });
        
    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid input data', errors: error.errors },
        { status: 400 }
      );
    }

    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        return NextResponse.json(
            { message: 'Failed to create item due to a conflict' },
            { status: 409 }
        );
    }

    console.error("Error creating item:", error);
    return NextResponse.json(
      { message: 'Failed to create item' },
      { status: 500 }
    );
  }
}
