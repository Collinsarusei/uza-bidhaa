import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import type { Notification } from './types';

const notificationsCollection = adminDb.collection('notifications');

// Type definition for the data needed to create a notification (excluding auto-generated fields)
type CreateNotificationData = Omit<Notification, 'id' | 'createdAt' | 'readStatus'>;

/**
 * Creates a notification document in Firestore.
 * @param data - The notification data (userId, type, message, optional related IDs).
 */
export async function createNotification(data: CreateNotificationData): Promise<void> {
    try {
        const notificationId = uuidv4(); // Generate a unique ID
        const newNotification: Omit<Notification, 'createdAt'> & { createdAt: FieldValue } = {
            ...data,
            id: notificationId,
            readStatus: false, // Always start as unread
            createdAt: FieldValue.serverTimestamp(), // Use Firestore server timestamp
        };

        await notificationsCollection.doc(notificationId).set(newNotification);
        console.log(`Notification created for user ${data.userId} (Type: ${data.type}, ID: ${notificationId})`);

    } catch (error) {
        console.error("Error creating notification:", error);
        // Decide if you want to throw the error, log it, or handle it silently
        // Depending on the context, failing to create a notification might not be critical
    }
}
