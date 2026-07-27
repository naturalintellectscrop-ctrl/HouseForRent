'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
        <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
      </div>
      <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">
        Something Went Wrong
      </h1>
      <p className="mb-8 max-w-md text-muted-foreground">
        We encountered an unexpected error. This has been logged and our team will look into it. 
        Please try again or go back to the homepage.
      </p>
      {error.message && process.env.NODE_ENV === 'development' && (
        <div className="mb-6 max-w-lg rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 text-left">
          <p className="text-sm font-mono text-red-700 dark:text-red-300 break-words">
            {error.message}
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-red-500">Error ID: {error.digest}</p>
          )}
        </div>
      )}
      <div className="flex gap-3">
        <Button
          onClick={reset}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
        <Button
          variant="outline"
          onClick={() => (window.location.href = '/')}
          className="gap-2"
        >
          <Home className="h-4 w-4" />
          Go Home
        </Button>
      </div>
    </div>
  );
}
