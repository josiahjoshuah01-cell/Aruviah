"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signUp, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Creating account…" : "Create account"}
    </Button>
  );
}

export default function SignupPage() {
  const [state, formAction] = useActionState<AuthState, FormData>(signUp, {});

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/" className="font-display text-2xl font-bold">
            Aruviah
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your account
          </p>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="new-password" minLength={6} />
          </div>
          {state.error && (
            <p className="text-sm text-coral-pulse">{state.error}</p>
          )}
          <SubmitButton />
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-stream hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
