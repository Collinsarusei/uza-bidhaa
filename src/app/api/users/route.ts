import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
    console.log("API GET /api/users (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Users GET: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q') || '';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                    createdAt: true,
                    _count: {
                        select: {
                            items: true,
                            reviews: true
                        }
                    }
                }
            }),
            prisma.user.count({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' } }
                    ]
                }
            })
        ]);

        console.log(`API Users GET: Found ${users.length} users matching query "${query}"`);
        return NextResponse.json({
            users,
            pagination: {
                total,
                pages: Math.ceil(total / limit),
                currentPage: page,
                hasMore: skip + users.length < total
            }
        });

    } catch (error: any) {
        console.error("API Users GET Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to fetch users', error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    console.log("API POST /api/users (Prisma): Received request");
    
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        console.warn("API Users POST: Unauthorized attempt.");
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        const body = await req.json();
        const { name, email, image } = body;

        if (!name || !email) {
            console.error("API Users POST: Missing required fields.");
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            console.warn(`API Users POST: User with email ${email} already exists.`);
            return NextResponse.json({ message: 'User already exists' }, { status: 409 });
        }

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                image
            },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                createdAt: true
            }
        });

        console.log(`API Users POST: Successfully created user ${newUser.id}`);
        return NextResponse.json(newUser, { status: 201 });

    } catch (error: any) {
        console.error("API Users POST Error (Prisma):", error);
        return NextResponse.json({ message: 'Failed to create user', error: error.message }, { status: 500 });
    }
} 