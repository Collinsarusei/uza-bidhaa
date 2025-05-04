'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { auth } from "@/lib/firebase"; 
import {
    RecaptchaVerifier,
    signInWithPhoneNumber,
    ConfirmationResult
} from "firebase/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const togglePasswordVisibility = () => setShowPassword(prev => !prev);
  const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(prev => !prev);

  // --- Setup reCAPTCHA --- 
   useEffect(() => {
       if (!auth) return; 
       if (typeof window !== 'undefined' && !window.recaptchaVerifier) {
           const recaptchaContainer = document.getElementById('recaptcha-container');
           if (recaptchaContainer) {
                window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                   'size': 'invisible',
                   'callback': (response: any) => { console.log("reCAPTCHA verified"); },
                   'expired-callback': () => { console.log("reCAPTCHA expired"); toast({ title: "reCAPTCHA Expired", description: "Please try sending the OTP again.", variant: "destructive" }); }
               });
                window.recaptchaVerifier.render().then((widgetId) => {
                    window.recaptchaWidgetId = widgetId;
                    console.log("reCAPTCHA rendered");
                }).catch(err => { console.error("reCAPTCHA render error:", err); setError("Failed to init reCAPTCHA."); });
            } else { console.error("'recaptcha-container' missing!"); setError("Captcha init failed."); }
        }
   }, [auth, toast]);
   // -----------------------

  // --- Handle Send OTP --- 
  const handleSendOtp = async () => {
      setError(null);
      if (!phoneNumber.trim()) { setError("Phone number needed."); return; }
      if (!window.recaptchaVerifier) { setError("reCAPTCHA not ready."); return; }
       let formattedPhoneNumber = phoneNumber.trim();
       if (formattedPhoneNumber.startsWith('07')) formattedPhoneNumber = `+254${formattedPhoneNumber.substring(1)}`;
       else if (formattedPhoneNumber.startsWith('7')) formattedPhoneNumber = `+254${formattedPhoneNumber}`;
       else if (!formattedPhoneNumber.startsWith('+254')) { setError("Invalid phone format."); return; }

      setIsSendingOtp(true);
      try {
          const confirmation = await signInWithPhoneNumber(auth, formattedPhoneNumber, window.recaptchaVerifier);
          setConfirmationResult(confirmation);
          setShowOtpInput(true);
          toast({ title: "OTP Sent", description: "Check phone for code." });
      } catch (error: any) {
          console.error("OTP Send Error:", error);
          let message = error.message.includes('reCAPTCHA') ? "Captcha failed." : "Failed to send OTP.";
          if (error.code === 'auth/invalid-phone-number') message = "Invalid phone number.";
          else if (error.code === 'auth/too-many-requests') message = "Too many requests.";
          setError(message); toast({ title: "OTP Send Failed", description: message, variant: "destructive" });
           // Corrected: Check if grecaptcha exists before calling reset
           try { 
               if (window.recaptchaVerifier && window.grecaptcha && window.recaptchaWidgetId !== undefined) {
                   window.grecaptcha.reset(window.recaptchaWidgetId);
                } 
           } catch (resetError) { 
               console.error("reCAPTCHA reset error:", resetError);
            }
      } finally { setIsSendingOtp(false); }
  };
  // -----------------------

  // --- Handle Register ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (!email.trim() || !password || !confirmPassword || !username.trim()) { setError("Fill required fields."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (!showOtpInput || !otp.trim()) { setError("Enter OTP."); return; }
    if (!confirmationResult) { setError("Request new OTP."); return; }

    setIsVerifyingOtp(true); setIsLoading(true);
    try {
        console.log(`Verifying OTP: ${otp}`);
        await confirmationResult.confirm(otp.trim());
        console.log("OTP Verified!");
        setIsVerifyingOtp(false);

        const registrationData = { email: email.trim(), password, phoneNumber: phoneNumber.trim(), username: username.trim() };
        console.log("Calling backend register API...");
        const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(registrationData) });
        const result = await response.json();
        if (!response.ok) { throw new Error(result.message || `Reg failed: ${response.statusText}`); }

        toast({ title: "Registration Successful", description: "Log in now." });
        router.push('/auth');

    } catch (error: any) {
        console.error("OTP/Reg Error:", error);
        let message = error.message || "Registration failed.";
         if (error.code === 'auth/invalid-verification-code') message = "Invalid OTP code.";
         else if (error.code === 'auth/code-expired') { message = "OTP expired."; setShowOtpInput(false); setConfirmationResult(null); }
        setError(message); toast({ title: "Registration Failed", description: message, variant: "destructive" });
        setIsLoading(false); setIsVerifyingOtp(false); 
    } 
  };
  // ---------------------

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100 dark:bg-gray-900 px-4">
      <Card className="w-full max-w-md shadow-lg dark:bg-gray-800">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription>Join the marketplace today!</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="grid gap-4">
             <div id="recaptcha-container"></div>
            {error && (<p className="text-sm font-medium text-center text-destructive">{error}</p>)}
            
             <div className="grid gap-1.5">
              <Label htmlFor="username">Username <span className="text-red-500">*</span></Label>
              <Input id="username" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={isLoading} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} />
            </div>
             <div className="grid gap-1.5">
               <Label htmlFor="phone">Phone Number <span className="text-red-500">*</span></Label>
               <div className="flex gap-2">
                    <Input id="phone" type="tel" placeholder="e.g., 0712345678" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required disabled={isLoading || isSendingOtp || showOtpInput} />
                     <Button type="button" onClick={handleSendOtp} disabled={isLoading || isSendingOtp || showOtpInput || !phoneNumber.trim()} variant="outline"> {isSendingOtp ? <Icons.spinner className="h-4 w-4 animate-spin"/> : "Send OTP"} </Button>
               </div>
            </div>
            {showOtpInput && (
                 <div className="grid gap-1.5 animate-in fade-in duration-300">
                     <Label htmlFor="otp">Enter OTP <span className="text-red-500">*</span></Label>
                     <Input id="otp" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value)} required disabled={isLoading || isVerifyingOtp} />
                 </div>
            )}

            {/* Password Field with Toggle */} 
            <div className="grid gap-1.5 relative">
              <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
              <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  disabled={isLoading} 
                  className="pr-10" // Add padding for the icon
              />
              <Button 
                 type="button"
                 variant="ghost"
                 size="icon"
                 onClick={togglePasswordVisibility}
                 className="absolute right-1 top-[25px] h-7 w-7" // Positioning
                 aria-label={showPassword ? "Hide password" : "Show password"}
              >
                 {showPassword ? <Icons.eyeOff className="h-4 w-4"/> : <Icons.eye className="h-4 w-4"/>}
              </Button>
            </div>

            {/* Confirm Password Field with Toggle */} 
            <div className="grid gap-1.5 relative">
              <Label htmlFor="confirm-password">Confirm Password <span className="text-red-500">*</span></Label>
              <Input 
                  id="confirm-password" 
                  type={showConfirmPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  required 
                  disabled={isLoading} 
                  className="pr-10" // Add padding for the icon
              />
               <Button 
                 type="button"
                 variant="ghost"
                 size="icon"
                 onClick={toggleConfirmPasswordVisibility}
                 className="absolute right-1 top-[25px] h-7 w-7" // Positioning
                 aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                 {showConfirmPassword ? <Icons.eyeOff className="h-4 w-4"/> : <Icons.eye className="h-4 w-4"/>}
              </Button>
            </div>

          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading || !showOtpInput || isVerifyingOtp}>
                {(isLoading || isVerifyingOtp) && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                {isVerifyingOtp ? 'Verifying OTP...' : isLoading ? 'Registering...' : 'Register'}
            </Button>
             <p className="text-center text-sm text-muted-foreground">
                 Already have an account?{" "}
                 <Link href="/auth" className="font-medium text-primary hover:underline">Login here</Link>
             </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// Declare global types
declare global {
    interface Window {
        recaptchaVerifier?: RecaptchaVerifier;
        recaptchaWidgetId?: number;
        grecaptcha?: {
             reset: (widgetId?: number) => void;
             // Add other grecaptcha methods if needed
        };
    }
}
