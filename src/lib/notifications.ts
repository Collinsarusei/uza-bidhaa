// src/lib/notifications.ts
import prisma from './prisma'; // Changed: Use Prisma client
import type { Notification as PrismaNotification } from '@prisma/client'; // Import Prisma's generated Notification type

// The Notification type from src/lib/types.ts (UserProfile, ApiTimestamp etc.)
// should align with what's expected by the frontend or for API responses.
// For creating notifications, we'll map to what Prisma expects.

// Type definition for the data needed to create a notification via this function.
// Prisma will handle id, createdAt, updatedAt, isRead (if defaulted in schema).
export interface CreateNotificationParams {
  userId: string;
  type: string; // Consider using an enum if you have fixed notification types
  message: string;
  relatedItemId?: string | null;
  relatedPaymentId?: string | null;
  relatedWithdrawalId?: string | null;
  relatedDisputeId?: string | null;
  // relatedConversationId?: string | null; // Example: if you add this to your Prisma schema
  // relatedOrderId?: string | null;      // Example: if you add this to your Prisma schema
}

/**
 * Creates a notification document in PostgreSQL via Prisma.
 * Prisma handles id, createdAt, isRead (default: false).
 * @param data - The notification data (userId, type, message, optional related IDs).
 */
export async function createNotification(data: CreateNotificationParams): Promise<PrismaNotification | null> {
  try {
    const newNotification = await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        message: data.message,
        relatedItemId: data.relatedItemId, // Prisma will handle null if undefined and field is optional
        relatedPaymentId: data.relatedPaymentId,
        relatedWithdrawalId: data.relatedWithdrawalId,
        relatedDisputeId: data.relatedDisputeId,
        // isRead is defaulted to false in the schema
        // createdAt is defaulted to now() in the schema
        // id is auto-generated
      },
    });
    console.log(`Notification created for user ${newNotification.userId} (Type: ${newNotification.type}, ID: ${newNotification.id})`);
    return newNotification;
  } catch (error) {
    console.error("Error creating notification with Prisma:", error);
    // Depending on how you want to handle errors, you might rethrow or return null/specific error object
    // throw error; 
    return null;
  }
}

// Example of fetching notifications (you'll likely have this in an API route)
// export async function getNotificationsForUser(userId: string): Promise<PrismaNotification[]> {
//   try {
//     return await prisma.notification.findMany({
//       where: { userId },
//       orderBy: { createdAt: 'desc' },
//       take: 20, // Example: pagination
//     });
//   } catch (error) {
//     console.error("Error fetching notifications:", error);
//     return [];
//   }
// }
