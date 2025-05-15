// lib/date-utils.ts
import { parseISO, isValid, formatDistanceToNow, fromUnixTime } from 'date-fns';

interface FirestoreTimestampObject {
  _seconds?: number;
  _nanoseconds?: number;
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date; // For Firebase JS SDK Timestamp objects
}

export function formatTimestampForDisplay(
    timestamp: string | number | Date | FirestoreTimestampObject | null | undefined,
    defaultText: string = 'Date unavailable'
): string {
  if (!timestamp) return defaultText;

  try {
    let dateToFormat: Date | null = null;

    if (timestamp instanceof Date) {
        if (isValid(timestamp)) {
            dateToFormat = timestamp;
        }
    } else if (typeof timestamp === 'string') {
      const parsed = parseISO(timestamp);
      if (isValid(parsed)) {
        dateToFormat = parsed;
      }
    } else if (typeof timestamp === 'number') { // Assuming Unix timestamp in milliseconds if very large, or seconds if smaller
      // Heuristic: if timestamp > 1 Jan 2000 in seconds, it's likely milliseconds.
      // 1 Jan 2000 00:00:00 UTC = 946684800 seconds
      const dateFromNum = timestamp > 94668480000 ? new Date(timestamp) : fromUnixTime(timestamp);
      if (isValid(dateFromNum)) {
        dateToFormat = dateFromNum;
      }
    } else if (typeof timestamp === 'object' && timestamp !== null) {
      if (typeof (timestamp as FirestoreTimestampObject).toDate === 'function') { // Firebase Client SDK Timestamp
        const dateFromToDate = (timestamp as FirestoreTimestampObject).toDate!();
        if (isValid(dateFromToDate)) {
          dateToFormat = dateFromToDate;
        }
      } else { // Plain object from server (potentially from Firestore Admin SDK if not converted)
        const seconds = (timestamp as FirestoreTimestampObject).seconds ?? (timestamp as FirestoreTimestampObject)._seconds;
        const nanoseconds = (timestamp as FirestoreTimestampObject).nanoseconds ?? (timestamp as FirestoreTimestampObject)._nanoseconds;

        if (typeof seconds === 'number') {
          let dateFromObject = fromUnixTime(seconds);
          if (typeof nanoseconds === 'number') {
            // Add nanoseconds as milliseconds
            dateFromObject.setMilliseconds(dateFromObject.getMilliseconds() + Math.floor(nanoseconds / 1000000));
          }
          if (isValid(dateFromObject)) {
            dateToFormat = dateFromObject;
          }
        }
      }
    }

    if (dateToFormat) {
      return formatDistanceToNow(dateToFormat, { addSuffix: true });
    } else {
      // console.warn('formatTimestampForDisplay: Could not parse timestamp:', timestamp);
      return `Invalid date`; // Changed default for better clarity
    }
  } catch (e) {
    console.error('formatTimestampForDisplay: Error formatting timestamp:', timestamp, e);
    return defaultText;
  }
}