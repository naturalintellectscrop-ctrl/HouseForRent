'use client';

import { type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

// Floating decorative icons for the illustration area
const floatingIcons = [
  { icon: '🏠', delay: 0, x: 20, y: 15 },
  { icon: '🔑', delay: 0.5, x: 75, y: 20 },
  { icon: '🏡', delay: 1.0, x: 15, y: 70 },
  { icon: '🏢', delay: 1.5, x: 80, y: 65 },
  { icon: '✨', delay: 0.8, x: 50, y: 10 },
  { icon: '💫', delay: 1.2, x: 45, y: 75 },
];

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-16 px-6"
    >
      {/* Animated illustration area */}
      <div className="relative w-40 h-28 mb-6 rounded-xl overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-red-100 via-red-50 to-cyan-100 dark:from-red-950/60 dark:via-red-900/40 dark:to-cyan-950/60" />

        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-30 dark:opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 2px 2px, oklch(0.577 0.245 27.325 / 0.3) 1px, transparent 0)',
            backgroundSize: '16px 16px',
          }}
        />

        {/* Floating decorative icons */}
        {floatingIcons.map((item, i) => (
          <motion.span
            key={i}
            className="absolute text-lg select-none"
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.7, 0.5],
              scale: [0.5, 1.1, 1],
              y: [0, -4, 0],
            }}
            transition={{
              delay: item.delay,
              duration: 2,
              repeat: Infinity,
              repeatType: 'reverse',
              ease: 'easeInOut',
            }}
          >
            {item.icon}
          </motion.span>
        ))}

        {/* Central icon with red ring */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 dark:bg-gray-900/90 shadow-lg ring-2 ring-red-300/50 dark:ring-red-700/50"
          >
            <Icon className="h-7 w-7 text-red-600 dark:text-red-400" />
          </motion.div>
        </div>
      </div>

      {/* Title with red accent */}
      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="text-xl font-semibold text-foreground"
      >
        {title}
      </motion.h3>

      {/* Description in muted text */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="mt-2 text-sm text-muted-foreground text-center max-w-sm leading-relaxed"
      >
        {description}
      </motion.p>

      {/* Optional CTA button */}
      {actionLabel && onAction && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Button
            className="mt-6 bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20"
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
