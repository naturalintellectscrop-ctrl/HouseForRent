'use client';

import { Home, Search, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-100 dark:bg-cyan-900/30">
        <Search className="h-10 w-10 text-cyan-600 dark:text-cyan-400" />
      </div>
      <h1 className="mb-2 text-4xl font-bold text-foreground sm:text-6xl">
        404
      </h1>
      <h2 className="mb-3 text-xl font-semibold text-foreground sm:text-2xl">
        Page Not Found
      </h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        The page you're looking for doesn't exist or may have been moved. 
        Let's get you back on track.
      </p>
      <div className="flex gap-3">
        <Button
          onClick={() => (window.location.href = '/')}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Home className="h-4 w-4" />
          Go Home
        </Button>
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    </div>
  );
}
