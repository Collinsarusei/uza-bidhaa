"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessage("Welcome to NyeriConnect!");
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>NyeriConnect</CardTitle>
          <CardDescription>Connecting Buyers and Sellers in Nyeri County</CardDescription>
        </CardHeader>
        <CardContent>
          {message ? (
            <p className="text-center text-lg">{message}</p>
          ) : (
            <p className="text-center text-lg">Loading...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
