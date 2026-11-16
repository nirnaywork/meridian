"use client";
import { ErrorState } from "@/components/ui";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      message="We couldn't load your workspace. Please try again."
      retry={reset}
    />
  );
}
