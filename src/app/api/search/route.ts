import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: Request) {
    console.log("API GET /api/search (Prisma): Received request");

    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q') || '';
        const category = searchParams.get('category');
        const minPrice = searchParams.get('minPrice');
        const maxPrice = searchParams.get('maxPrice');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const skip = (page - 1) * limit;

        const where: any = {
            status: 'available',
            OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } }
            ]
        };

        if (category) {
            where.category = category;
        }

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) {
                where.price.gte = parseFloat(minPrice);
            }
            if (maxPrice) {
                where.price.lte = parseFloat(maxPrice);
            }
        }

        const [items, total] = await Promise.all([
            prisma.item.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    seller: {
                        select: {
                            id: true,
                            name: true,
                            image: true
                        }
                    }
                }
            }),
            prisma.item.count({ where })
        ]);

        console.log(`API Search GET: Found ${items.length} items matching query "${query}"`);
        return NextResponse.json({
            items,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                currentPage: page,
                hasMore: skip + items.length < total
            }
        });

    } catch (error: any) {
        console.error("API Search GET Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to search items', error: error.message }, { status: 500 });
    }
} 