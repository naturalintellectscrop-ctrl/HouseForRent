'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X } from 'lucide-react';

export default function SafetyWarning() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('safety-warning-dismissed') === 'true';
    }
    return false;
  });

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('safety-warning-dismissed', 'true');
  };

  if (dismissed) return null;

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden"
        >
          <div className="bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-800">
            {/* Pulse animation bar at top */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-0.5 bg-amber-400"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <motion.div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </motion.div>
                  <p className="text-sm text-amber-800 dark:text-amber-200 leading-snug">
                    <span className="font-semibold">Safety Notice:</span>{' '}
                    Always verify the existence of a property in person before making any payments. House For Rent verifies properties, but please exercise caution with transactions.
                  </p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="shrink-0 rounded-full p-1 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/60 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                  aria-label="Dismiss safety warning"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
