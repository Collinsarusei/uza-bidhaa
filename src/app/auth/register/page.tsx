'use client'

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useRef, Fragment } from "react"; // Import Fragment
import { useRouter } from 'next/navigation';
import { Icons } from "@/components/icons";
import Link from "next/link";
import { Eye, EyeOff } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";

// Schemas remain the same
const registerFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email." }),
  phoneNumber: z.string().min(10, { message: "Please enter a valid phone number (e.g., +254712345678)." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const otpSchema = z.object({
  otp: z.string().length(6, { message: "OTP must be 6 digits." }),
});

type RegisterFormValues = z.infer<typeof registerFormSchema>;
type OtpFormValues = z.infer<typeof otpSchema>;

// Helper function remains the same
const formatPhoneNumber = (phoneNumber: string): string => {
    if (!phoneNumber.startsWith('+')) {
        return `+254${phoneNumber.replace(/\D/g, '')}`;
    }
    return phoneNumber.replace(/\s/g, '');
}

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifier = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  // Forms setup remains the same
  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: "", email: "", phoneNumber: "", password: "", confirmPassword: "" },
    mode: "onChange",
  });

  const otpForm = useForm<OtpFormValues>({
      resolver: zodResolver(otpSchema),
      defaultValues: { otp: "" },
      mode: "onChange",
  });

  // useEffect for reCAPTCHA remains the same
  useEffect(() => {
    if (typeof window !== 'undefined' && recaptchaContainerRef.current && !recaptchaVerifier.current) {
        try {
            if (auth) {
                 recaptchaVerifier.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
                    'size': 'invisible',
                    'callback': (response: any) => console.log("reCAPTCHA solved:", response),
                    'expired-callback': () => {
                        console.log("reCAPTCHA expired");
                        toast({ title: "reCAPTCHA Expired", description: "Please try submitting the form again.", variant: "default", });
                         if (recaptchaVerifier.current) {
                            recaptchaVerifier.current.render().then(widgetId => { if (typeof window !== 'undefined' && window.grecaptcha?.reset) window.grecaptcha.reset(widgetId); }).catch(e => console.error("Error rendering reCAPTCHA for reset:", e));
                         }
                    }
                });
                recaptchaVerifier.current.render().catch((error) => {
                    console.error("Error rendering reCAPTCHA: ", error);
                    setServerError(`reCAPTCHA Render Error: ${error.message}`);
                    toast({ title: "reCAPTCHA Error", description: "Could not render reCAPTCHA.", variant: "destructive" });
                });
            } else {
                console.error("Firebase auth is not initialized yet.");
                setServerError("Firebase initialization error. Please refresh.");
            }
        } catch (error: any) {
            console.error("Error initializing reCAPTCHA:", error);
            setServerError(`reCAPTCHA Init Error: ${error.message}`);
            toast({ title: "reCAPTCHA Error", description: "Could not initialize reCAPTCHA.", variant: "destructive" });
        }
    }
  }, [auth]);

  // handleRegisterSubmit function remains the same
  async function handleRegisterSubmit(data: RegisterFormValues) {
    setIsLoading(true);
    setServerError(null);
    if (!recaptchaVerifier.current) { setServerError("reCAPTCHA not ready."); toast({ title: "Error", description: "reCAPTCHA not ready.", variant: "destructive" }); setIsLoading(false); return; }
    const formattedPhoneNumber = formatPhoneNumber(data.phoneNumber);
     if (!formattedPhoneNumber) { setServerError("Invalid phone number format."); toast({ title: "Error", description: "Invalid phone number format.", variant: "destructive" }); setIsLoading(false); return; }
    try {
        console.log(`Attempting to send OTP to: ${formattedPhoneNumber}`);
        const confirmation: ConfirmationResult = await signInWithPhoneNumber(auth, formattedPhoneNumber, recaptchaVerifier.current);
        setConfirmationResult(confirmation);
        setIsOtpSent(true);
        toast({ title: "OTP Sent", description: `An OTP has been sent to ${formattedPhoneNumber}.` });
    } catch (error: any) {
      console.error("Firebase phone auth error:", error);
      setServerError(`Failed to send OTP: ${error.message}`);
      toast({ title: "OTP Sending Failed", description: error.message || "Could not send OTP.", variant: "destructive" });
       if (recaptchaVerifier.current) {
           recaptchaVerifier.current.render().then(widgetId => { if (typeof window !== 'undefined' && window.grecaptcha?.reset) window.grecaptcha.reset(widgetId); }).catch(e => console.error("Error resetting reCAPTCHA after send failure:", e));
       }
    } finally { setIsLoading(false); }
  }

  // handleOtpSubmit function remains the same
  async function handleOtpSubmit(otpData: OtpFormValues) {
      setIsLoading(true);
      setServerError(null);
      if (!confirmationResult) { setServerError("OTP process not initiated correctly."); toast({ title: "Error", description: "Verification failed. Try registering again.", variant: "destructive" }); setIsLoading(false); return; }
      try {
          const userCredential = await confirmationResult.confirm(otpData.otp);
          console.log("Phone number verified successfully:", userCredential.user);
          toast({ title: "Phone Verified", description: "Your phone number has been verified." });
          const registerData = registerForm.getValues();
          const { confirmPassword, ...apiData } = registerData;
          const response = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...apiData, phoneNumber: formatPhoneNumber(apiData.phoneNumber) }),
          });
          if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || "Backend registration failed after OTP verification."); }
          toast({ title: "Registration Successful", description: "Account created. Please log in." });
          router.push('/auth');
      } catch (error: any) {
          console.error("OTP verification or backend registration failed:", error);
          let errorMessage = "Verification/registration error.";
          if (error.code === 'auth/invalid-verification-code') errorMessage = "Invalid OTP code.";
          else if (error.code === 'auth/code-expired') errorMessage = "OTP code has expired. Please request a new one.";
          else if (error.message) errorMessage = error.message;
          setServerError(errorMessage);
          toast({ title: "Verification/Registration Failed", description: errorMessage, variant: "destructive" });
      } finally { setIsLoading(false); }
  }

  return (
    <div className="container grid h-screen w-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
        {/* Left side remains the same */}
        <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
            <div className="absolute inset-0 bg-zinc-900" />
            <div className="relative z-20 flex items-center text-lg font-medium"><Icons.logo className="mr-2 h-6 w-6" /> Acme Inc</div>
             <div className="relative z-20 mt-auto"><blockquote className="space-y-2"><p className="text-lg">“This library has saved me countless hours of work and helped me deliver stunning designs to my clients faster than ever before.”</p><footer className="text-sm">Sofia Davis</footer></blockquote></div>
        </div>

        {/* Right side form */}
        <div className="lg:p-8">
            <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
                {/* reCAPTCHA Container remains the same */}
                <div ref={recaptchaContainerRef} id="recaptcha-container-id"></div>

                {/* --- Conditional Rendering with Keys --- */}
                {!isOtpSent ? (
                    <Fragment key="register-form"> {/* <-- Added key */}
                        {/* Registration Form Headers */}
                        <div className="flex flex-col space-y-2 text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
                            <p className="text-sm text-muted-foreground">Enter your details below</p>
                        </div>
                        {/* Registration Form */}
                        <Form {...registerForm}>
                            <form onSubmit={registerForm.handleSubmit(handleRegisterSubmit)} className="space-y-4">
                                {/* Name Field */}
                                <FormField control={registerForm.control} name="name" render={({ field }) => (<FormItem><FormLabel>Name</FormLabel><FormControl><Input placeholder="Your Name" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>)} />
                                {/* Email Field */}
                                <FormField control={registerForm.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="name@example.com" {...field} disabled={isLoading} /></FormControl><FormMessage /></FormItem>)} />
                                 {/* Phone Number Field */}
                                <FormField control={registerForm.control} name="phoneNumber" render={({ field }) => (<FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="0712345678" {...field} disabled={isLoading} /></FormControl><FormDescription>e.g., 0712345678. Country code (+254) added.</FormDescription><FormMessage /></FormItem>)} />
                                {/* Password Field */}
                                <FormField control={registerForm.control} name="password" render={({ field }) => (<FormItem><FormLabel>Password</FormLabel><FormControl><div className="relative"><Input type={showPassword ? "text" : "password"} placeholder="********" {...field} disabled={isLoading} className="pr-10" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500" disabled={isLoading} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></FormControl><FormMessage /></FormItem>)} />
                                {/* Confirm Password Field */}
                                <FormField control={registerForm.control} name="confirmPassword" render={({ field }) => (<FormItem><FormLabel>Confirm Password</FormLabel><FormControl><div className="relative"><Input type={showConfirmPassword ? "text" : "password"} placeholder="********" {...field} disabled={isLoading} className="pr-10" /><button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500" disabled={isLoading} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}>{showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></FormControl><FormMessage /></FormItem>)} />
                                {/* Error Display & Submit */}
                                {serverError && (<p className="text-sm font-medium text-destructive">{serverError}</p>)}
                                <Button type="submit" className="w-full" disabled={isLoading}>{isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} Send OTP</Button>
                            </form>
                        </Form>
                        {/* Footer Links */}
                        <p className="px-8 text-center text-sm text-muted-foreground">Already have an account? <Link href="/auth" className="hover:text-brand underline underline-offset-4">Log In</Link></p>
                        <p className="px-8 text-center text-sm text-muted-foreground">By clicking continue, you agree to our <Link href="/terms" className="hover:text-brand underline underline-offset-4">Terms</Link> and <Link href="/privacy" className="hover:text-brand underline underline-offset-4">Privacy Policy</Link>.</p>
                    </Fragment>
                ) : (
                    <Fragment key="otp-form"> {/* <-- Added key */}
                        {/* OTP Form Headers */}
                        <div className="flex flex-col space-y-2 text-center">
                            <h1 className="text-2xl font-semibold tracking-tight">Verify Phone Number</h1>
                            <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {formatPhoneNumber(registerForm.getValues("phoneNumber"))}</p>
                        </div>
                        {/* OTP Form */}
                        <Form {...otpForm}>
                            <form onSubmit={otpForm.handleSubmit(handleOtpSubmit)} className="space-y-6">
                                <FormField
                                    control={otpForm.control}
                                    name="otp"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>OTP Code</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="123456"
                                                    {...field}
                                                    disabled={isLoading}
                                                    maxLength={6}
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    autoComplete="one-time-code" // <-- Added autoComplete
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {/* Error Display & Submit/Back Buttons */}
                                {serverError && (<p className="text-sm font-medium text-destructive">{serverError}</p>)}
                                <Button type="submit" className="w-full" disabled={isLoading}>{isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />} Verify OTP & Register</Button>
                                <Button type="button" variant="outline" className="w-full" onClick={() => { setIsOtpSent(false); setServerError(null); setConfirmationResult(null); if (recaptchaVerifier.current) { recaptchaVerifier.current.render().then(widgetId => { if (typeof window !== 'undefined' && window.grecaptcha?.reset) window.grecaptcha.reset(widgetId); }).catch(e => console.error("Error resetting reCAPTCHA on back:", e)); } }} disabled={isLoading}>Back to Register</Button>
                            </form>
                        </Form>
                    </Fragment>
                )}
            </div>
        </div>
    </div>
  );
}

// Global declaration remains the same
declare global {
    interface Window { grecaptcha: any; }
}