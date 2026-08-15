"use client";

import { useEffect } from "react";
import ErrorRecovery from "../error-recovery";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorRecovery kind="error" reset={reset} />;
}