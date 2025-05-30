'use client';

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Icons } from "@/components/icons";
import { z } from "zod";

// Password validation schema
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [username, setUsername] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const togglePasswordVisibility = () => setShowPassword(prev => !prev);
  const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(prev => !prev);

  const formatPhoneNumberForBackend = (num: string): string | null => {
    const trimmedNum = num.trim();
    if (trimmedNum.startsWith('07') || trimmedNum.startsWith('01')) {
      return `+254${trimmedNum.substring(1)}`;
    }
    if (trimmedNum.startsWith('+254') && trimmedNum.length >= 13) { 
      return trimmedNum;
    }
    console.warn("Phone number might not be in expected Kenyan format for backend conversion:", trimmedNum);
    return null; 
  };

  const validatePassword = (pass: string): string | null => {
    try {
      passwordSchema.parse(pass);
      return null;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error.errors[0].message;
      }
      return "Invalid password format";
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    if (!email.trim() || !password || !confirmPassword || !username.trim() || !phoneNumber.trim()) {
      setError("Fill all required fields.");
      return;
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    if (!agreedToTerms) {
      setError("You must agree to the Terms and Conditions to register.");
      toast({
        title: "Agreement Required",
        description: "Please agree to the Terms & Conditions.",
        variant: "destructive",
        duration: 5000
      });
      return;
    }

    const formattedPhoneNumberForBackend = formatPhoneNumberForBackend(phoneNumber);
    if (!formattedPhoneNumberForBackend) {
      setError("Invalid phone number format. Use 07... or 01...");
      toast({
        title: "Invalid Phone",
        description: "Please check your phone number format (07... or 01...).",
        variant: "destructive",
        duration: 5000
      });
      return; 
    }

    setIsLoading(true);
    try {
      const registrationData = {
        name: username.trim(), 
        email: email.trim().toLowerCase(),
        password, 
        phoneNumber: formattedPhoneNumberForBackend
      };

      console.log("Calling backend register API with:", { ...registrationData, password: '[REDACTED]' });
      const registerResponse = await fetch('/api/auth/register', { 
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.cookie.split('; ').find(row => row.startsWith('csrf-token='))?.split('=')[1] || ''
        }, 
        body: JSON.stringify(registrationData),
        credentials: 'include'
      });
      
      const responseData = await registerResponse.json();
    
      if (!registerResponse.ok) {
        throw new Error(responseData.message || `Registration failed: ${registerResponse.statusText}`);
      }

      toast({
        title: "Registration Successful",
        description: "Log in now.",
        duration: 3000
      });
      router.push('/auth');
    } catch (error: any) {
      console.error("Registration Error:", error);
      let message = error.message || "Registration failed.";
      if (message.startsWith("Registration failed:")) {
        // Keep backend message
      } else if (message.startsWith("Invalid input data")) {
        message = "Registration failed. Please check your input.";
      }

      setError(message);
      toast({
        title: "Registration Failed",
        description: message,
        variant: "destructive",
        duration: 5000
      });
    } finally {
      setIsLoading(false);
    } 
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription>Join the marketplace today!</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_-]+"
                title="Username can only contain letters, numbers, underscores, and hyphens"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
                title="Please enter a valid email address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number (07.. or 01..) *</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g., 0712345678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                disabled={isLoading}
                pattern="^(?:254|\+254|0)?([17]\d{8})$"
                title="Please enter a valid Kenyan phone number"
              />
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="pr-10"
                minLength={8}
                pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])[A-Za-z\d\W]{8,}$"
                title="Password must be at least 8 characters long and contain uppercase, lowercase, number and special character"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={togglePasswordVisibility}
                className="absolute right-1 top-[25px] h-7 w-7"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <Icons.eyeOff className="h-4 w-4" />
                ) : (
                  <Icons.eye className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="confirm-password">Confirm Password *</Label>
              <Input 
                id="confirm-password" 
                type={showConfirmPassword ? "text" : "password"} 
                placeholder="••••••••" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                required 
                disabled={isLoading} 
                className="pr-10"
              />
               <Button 
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleConfirmPasswordVisibility}
                className="absolute right-1 top-[25px] h-7 w-7"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <Icons.eyeOff className="h-4 w-4" />
                ) : (
                  <Icons.eye className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                disabled={isLoading}
              />
              <Label htmlFor="terms" className="text-sm">
                I agree to the{" "}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms and Conditions
                </Link>
              </Label>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>

            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
