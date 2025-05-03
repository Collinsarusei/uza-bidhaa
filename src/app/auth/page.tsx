// src/app/auth/page.tsx (or wherever your LoginPage component is)
'use client';

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react"; // Using NextAuth for credentials sign-in
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from 'lucide-react'; // Icons for password visibility
import { Icons } from "@/components/icons"; // Assuming you have a spinner icon here

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // --- Login Handler (using NextAuth credentials provider) ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    console.log(`Attempting login with - Email: ${email}`);

    try {
      // Attempt sign in using the 'credentials' provider defined in NextAuth options
      const result = await signIn('credentials', {
        redirect: false, // Handle redirect manually based on result
        email: email,
        password: password,
      });

      console.log("NextAuth signIn result:", result);

      if (result?.error) {
        // Error occurred during authorization (e.g., invalid credentials thrown from authorize)
        toast({
          title: "Login Failed",
          // Use the error message provided by NextAuth, which might come from your authorize function
          description: result.error === 'CredentialsSignin' ? "Invalid email or password." : (result.error || "An unexpected error occurred."),
          variant: "destructive",
        });
      } else if (result?.ok && !result?.error) {
        // Login successful
        toast({
          title: "Login Successful",
          description: "Welcome back!",
        });
        // Redirect to the dashboard or desired page
        router.push('/dashboard');
        router.refresh(); // Optional: Refresh server components if needed
      } else {
        // Handle unexpected scenarios where result is not ok but no error is reported
        toast({
          title: "Login Attempt Unclear",
          description: "Could not determine login status. Please try again.",
          variant: "default", // Or 'destructive'
        });
      }
    } catch (error) {
      // Catch potential network errors or other issues with the signIn call itself
      console.error("Login Page catch error:", error);
      toast({
          title: "Login Error",
          description: "An unexpected client-side error occurred during login. Please try again.",
          variant: "destructive",
        });
    } finally {
        setIsLoading(false); // Ensure loading state is reset
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md shadow-lg dark:bg-gray-800">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Login</CardTitle>
          <CardDescription>
            Welcome back! Access your account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="grid gap-4">
            {/* --- Email Input --- */}
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading} // Only disable based on login loading state
              />
            </div>

            {/* --- Password Input with Visibility Toggle --- */}
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative"> {/* Container for input and icon */}
                    <Input
                        id="password"
                        type={showPassword ? "text" : "password"} // Dynamic type
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading} // Only disable based on login loading state
                        className="pr-10" // Padding for icon
                    />
                    <button
                        type="button" // Prevent form submission
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 cursor-pointer disabled:opacity-50"
                        disabled={isLoading} // Only disable based on login loading state
                        aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                        {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                        ) : (
                        <Eye className="h-5 w-5" />
                        )}
                    </button>
              </div>
            </div>

            {/* --- Login Button --- */}
            <Button type="submit" className="w-full mt-2" disabled={isLoading}>
              {isLoading && (
                 <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isLoading ? "Logging in..." : "Login"}
            </Button>
          </CardContent>
        </form>
        {/* --- Register Link --- */}
        <div className="m-4 mt-2 text-center">
          <Link href="/auth/register" passHref>
            <Button variant="link" size="sm" disabled={isLoading}>
              Don't have an account? Register
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;