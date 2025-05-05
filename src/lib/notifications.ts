import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import type { Notification } from './types';

// --- Null Check --- 
if (!adminDb) {
     console.error("FATAL: notifications.ts - Firebase Admin DB not initialized.");
     // Throw or handle as appropriate for your app's startup logic
}
const notificationsCollection = adminDb!.collection('notifications'); // Use non-null assertion or handle above

// Type definition for the data needed to create a notification
// Omit fields that are auto-generated or have fixed defaults within this function
type CreateNotificationData = Omit<Notification, 'id' | 'createdAt' | 'isRead' | 'readAt'>;

/**
 * Creates a notification document in Firestore.
 * Sets isRead to false and createdAt to server timestamp automatically.
 * @param data - The notification data (userId, type, message, optional related IDs).
 */
export async function createNotification(data: CreateNotificationData): Promise<void> {
    try {
        if (!notificationsCollection) { // Runtime check just in case
             console.error("Cannot create notification: notificationsCollection is not available.");
             return;
        }
        const notificationId = uuidv4(); // Generate a unique ID
        
        // Construct the full notification object to be saved
        // Explicitly define the type being created
        const newNotification: Omit<Notification, 'createdAt' | 'readAt'> & { createdAt: FieldValue } = {
            ...data,
            id: notificationId,
            isRead: false, // Always set to false initially
            createdAt: FieldValue.serverTimestamp(), // Use Firestore server timestamp
        };

        await notificationsCollection.doc(notificationId).set(newNotification);
        console.log(`Notification created for user ${data.userId} (Type: ${data.type}, ID: ${notificationId})`);

    } catch (error) {
        console.error("Error creating notification:", error);
        // Rethrow or handle as needed
        // throw error; 
    }
}
