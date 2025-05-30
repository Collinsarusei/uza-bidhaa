declare module 'firebase/auth' {
  export interface ConfirmationResult {
    confirm(verificationCode: string): Promise<any>;
    verificationId: string;
  }
  
  export function signInWithPhoneNumber(auth: any, phoneNumber: string, appVerifier: any): Promise<ConfirmationResult>;
} 