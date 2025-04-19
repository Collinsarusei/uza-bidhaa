"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";

const KYC = () => {
  const [idImage, setIdImage] = useState<File | null>(null);
  const [selfieImage, setSelfieImage] = useState<File | null>(null);

  const handleIdImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIdImage(e.target.files[0]);
    }
  };

  const handleSelfieImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelfieImage(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    // Implement your KYC submission logic here, e.g., upload to Firebase Storage
    console.log(
      `Submit KYC - ID Image: ${idImage?.name} Selfie Image: ${selfieImage?.name}`
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>KYC Verification</CardTitle>
          <CardDescription>
            Please upload a clear image of your ID and a selfie for verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="idImage">ID Image</Label>
            <Input
              id="idImage"
              type="file"
              accept="image/*"
              onChange={handleIdImageChange}
            />
            {idImage && <p>Selected: {idImage.name}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="selfieImage">Selfie Image</Label>
            <Input
              id="selfieImage"
              type="file"
              accept="image/*"
              onChange={handleSelfieImageChange}
            />
            {selfieImage && <p>Selected: {selfieImage.name}</p>}
          </div>
          <Button onClick={handleSubmit} disabled={!idImage || !selfieImage}>
            Submit for Verification
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default KYC;
