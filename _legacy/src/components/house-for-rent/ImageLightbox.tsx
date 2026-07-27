'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';
import type { PropertyImage } from '@/store/useAppStore';

interface ImageLightboxProps {
  images: PropertyImage[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

// Slide direction variants for image transitions
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
};

export default function ImageLightbox({
  images,
  initialIndex,
  isOpen,
  onClose,
  title,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [direction, setDirection] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastPanRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset state when opening with a new initial index
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
      setDirection(0);
    }
  }, [isOpen, initialIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const goToPrev = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, [images.length]);

  const goToNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, [images.length]);

  const goToIndex = useCallback(
    (index: number) => {
      setDirection(index > currentIndex ? 1 : -1);
      setCurrentIndex(index);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    },
    [currentIndex]
  );

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.5, 1);
      if (newZoom === 1) {
        setPanOffset({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
          handleZoomOut();
          break;
        case '0':
          resetZoom();
          break;
      }
    },
    [isOpen, onClose, goToPrev, goToNext, handleZoomIn, handleZoomOut, resetZoom]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    },
    [handleZoomIn, handleZoomOut]
  );

  // Touch swipe support for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (zoom > 1) return; // Don't swipe when zoomed
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY, time: Date.now() });
  }, [zoom]);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart || zoom > 1) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.x;
      const deltaTime = Date.now() - touchStart.time;
      const velocity = Math.abs(deltaX) / deltaTime;

      // Swipe threshold: 50px or fast swipe (velocity > 0.3)
      if (Math.abs(deltaX) > 50 || velocity > 0.3) {
        if (deltaX > 0) {
          goToPrev();
        } else {
          goToNext();
        }
      }
      setTouchStart(null);
    },
    [touchStart, zoom, goToPrev, goToNext]
  );

  // Pan support when zoomed in (mouse)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    },
    [zoom, panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || zoom <= 1) return;
      const newX = e.clientX - panStartRef.current.x;
      const newY = e.clientY - panStartRef.current.y;
      // Limit pan range based on zoom level
      const maxPan = (zoom - 1) * 200;
      setPanOffset({
        x: Math.max(-maxPan, Math.min(maxPan, newX)),
        y: Math.max(-maxPan, Math.min(maxPan, newY)),
      });
    },
    [isPanning, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col"
          onClick={(e) => {
            // Close only when clicking the backdrop (not the image or controls)
            if (e.target === e.currentTarget && zoom === 1) {
              onClose();
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/90" />

          {/* Top Controls Bar */}
          <div className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
            {/* Left: Image counter */}
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white backdrop-blur-md border border-white/10">
                {currentIndex + 1} / {images.length}
              </span>
              {title && (
                <span className="hidden sm:inline-block text-sm text-white/60 truncate max-w-[200px]">
                  {title}
                </span>
              )}
            </div>

            {/* Right: Zoom controls & Close */}
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 px-1 py-1">
                <button
                  onClick={handleZoomOut}
                  disabled={zoom <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[3rem] text-center text-xs font-medium text-white/80">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoom >= 4}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {zoom > 1 && (
                  <button
                    onClick={resetZoom}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-red-400 transition-colors hover:bg-white/20"
                    aria-label="Reset zoom"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md border border-white/10 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Close lightbox"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Image Area */}
          <div
            ref={containerRef}
            className="relative z-10 flex flex-1 items-center justify-center overflow-hidden"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            style={{ cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
          >
            {/* Navigation Arrow - Left */}
            {images.length > 1 && (
              <button
                onClick={goToPrev}
                className="absolute left-3 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md border border-white/10 transition-all hover:bg-red-600/80 hover:text-white hover:border-red-500/50 sm:left-6"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Image with slide animation */}
            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                  scale: { duration: 0.2 },
                }}
                className="relative flex items-center justify-center"
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: zoom > 1 ? 'none' : '90vw',
                  maxHeight: zoom > 1 ? 'none' : '70vh',
                }}
                drag={zoom > 1 ? false : false}
              >
                <div
                  className="relative"
                  style={{
                    width: zoom > 1 ? `${zoom * 70}vh` : '100%',
                    maxWidth: zoom > 1 ? `${zoom * 90}vw` : '90vw',
                    height: zoom > 1 ? `${zoom * 50}vh` : '70vh',
                    maxHeight: zoom > 1 ? `${zoom * 70}vh` : '70vh',
                    transform: zoom > 1
                      ? `translate(${panOffset.x}px, ${panOffset.y}px)`
                      : 'none',
                    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                  }}
                >
                  <Image
                    src={currentImage.url}
                    alt={currentImage.caption || `Photo ${currentIndex + 1}`}
                    fill
                    className="object-contain"
                    unoptimized
                    priority
                    sizes="90vw"
                  />
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation Arrow - Right */}
            {images.length > 1 && (
              <button
                onClick={goToNext}
                className="absolute right-3 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md border border-white/10 transition-all hover:bg-red-600/80 hover:text-white hover:border-red-500/50 sm:right-6"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {/* Thumbnail Strip */}
          <div className="relative z-10 pb-4 pt-2 px-4 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-center justify-center gap-2 overflow-x-auto py-2 scrollbar-thin">
                {images.map((img, i) => (
                  <motion.button
                    key={img.id}
                    onClick={() => goToIndex(i)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all duration-200 ${
                      i === currentIndex
                        ? 'border-red-400 shadow-lg shadow-red-500/30 ring-1 ring-red-400/50'
                        : 'border-white/20 opacity-60 hover:opacity-90 hover:border-white/40'
                    }`}
                  >
                    <Image
                      src={img.url}
                      alt={img.caption || `Thumbnail ${i + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                      sizes="80px"
                    />
                    {/* Active indicator overlay */}
                    {i === currentIndex && (
                      <div className="absolute inset-0 bg-red-500/20" />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Caption */}
            {currentImage.caption && (
              <motion.p
                key={currentIndex}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-sm text-white/50 mt-1"
              >
                {currentImage.caption}
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
