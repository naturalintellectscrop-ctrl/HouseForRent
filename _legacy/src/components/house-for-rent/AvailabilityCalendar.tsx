'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Check,
  Loader2, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/store/useAppStore';
import { toast } from 'sonner';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  isSameDay, isToday, isBefore, addDays, parseISO
} from 'date-fns';

interface AvailabilityCalendarProps {
  propertyId: string;
}

interface TimeSlotInfo {
  time: string;
  available: boolean;
}

// Day cell variants for framer-motion
const dayVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
  selected: { scale: 1.1 },
};

const slotVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.2 },
  }),
  exit: { opacity: 0, y: -10 },
};

export default function AvailabilityCalendar({ propertyId }: AvailabilityCalendarProps) {
  const { user, setShowAuthModal, setAuthMode } = useAppStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableDates, setAvailableDates] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [showTwoMonths, setShowTwoMonths] = useState(true);

  // Responsive: show 1 month on small screens, 2 on larger
  useEffect(() => {
    const checkSize = () => setShowTwoMonths(window.innerWidth >= 640);
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Fetch availability data
  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/availability?propertyId=${propertyId}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableDates(data.availableDates || {});
      }
    } catch {
      toast.error('Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Generate calendar days for a given month
  const getCalendarDays = useMemo(() => {
    return (month: Date) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      const calStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
      const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

      return eachDayOfInterval({ start: calStart, end: calEnd });
    };
  }, []);

  // Get time slots for selected date
  const selectedTimeSlots: TimeSlotInfo[] = useMemo(() => {
    if (!selectedDate) return [];
    const slots = availableDates[selectedDate] || [];
    const allSlots = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
    return allSlots.map(time => ({
      time,
      available: slots.includes(time),
    }));
  }, [selectedDate, availableDates]);

  // Check if a date is available
  const isDateAvailable = useCallback((dateStr: string) => {
    const slots = availableDates[dateStr];
    return !!slots && slots.length > 0;
  }, [availableDates]);

  // Handle date click
  const handleDateClick = (dateStr: string) => {
    if (!isDateAvailable(dateStr)) return;
    setSelectedDate(dateStr);
    setSelectedTimeSlot(null);
  };

  // Handle booking
  const handleBookViewing = async () => {
    if (!user) {
      toast.error('Please login to request a viewing');
      setAuthMode('login');
      setShowAuthModal(true);
      return;
    }
    if (!selectedDate || !selectedTimeSlot) {
      toast.error('Please select a date and time slot');
      return;
    }

    setBooking(true);
    try {
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          date: selectedDate,
          timeSlot: selectedTimeSlot,
        }),
      });

      if (res.ok) {
        toast.success('Viewing requested! The landlord will confirm your appointment.');
        setSelectedDate(null);
        setSelectedTimeSlot(null);
        // Refresh availability
        fetchAvailability();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to book viewing');
      }
    } catch {
      toast.error('Failed to book viewing');
    } finally {
      setBooking(false);
    }
  };

  // Navigate months
  const goToPrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));

  // Don't go to past months
  const canGoPrev = !isSameMonth(currentMonth, new Date());

  // Render a single month calendar
  const renderMonth = (month: Date, monthIndex: number) => {
    const days = getCalendarDays(month);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
      <div className="flex-1 min-w-0">
        {/* Month header with navigation */}
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={monthIndex === 0 ? goToPrevMonth : undefined}
            disabled={monthIndex === 0 ? !canGoPrev : true}
          >
            {monthIndex === 0 && <ChevronLeft className="h-4 w-4" />}
          </Button>
          <h3 className="text-sm font-semibold">
            {format(month, 'MMMM yyyy')}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={monthIndex === (showTwoMonths ? 1 : 0) ? goToNextMonth : undefined}
            disabled={monthIndex !== (showTwoMonths ? 1 : 0)}
          >
            {monthIndex === (showTwoMonths ? 1 : 0) && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isCurrentMonth = isSameMonth(day, month);
            const isPast = isBefore(day, today) && !isToday(day);
            const isAvailable = !isPast && isCurrentMonth && isDateAvailable(dateStr);
            const isSelected = selectedDate === dateStr;
            const isTodayDate = isToday(day);

            return (
              <motion.button
                key={dateStr}
                custom={i}
                variants={dayVariants}
                initial="hidden"
                animate={isSelected ? 'selected' : 'visible'}
                transition={{ duration: 0.15, delay: i * 0.01 }}
                onClick={() => isAvailable && handleDateClick(dateStr)}
                disabled={!isAvailable}
                className={`
                  relative aspect-square flex items-center justify-center rounded-lg text-xs font-medium
                  transition-all duration-150
                  ${!isCurrentMonth ? 'text-muted-foreground/30' : ''}
                  ${isPast ? 'text-muted-foreground/40 cursor-not-allowed' : ''}
                  ${isAvailable && !isSelected ? 'cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/50 text-foreground' : ''}
                  ${!isAvailable && !isPast && isCurrentMonth ? 'text-muted-foreground/50 cursor-not-allowed bg-muted/30' : ''}
                  ${isSelected ? 'bg-red-600 text-white shadow-md shadow-red-500/30' : ''}
                  ${isTodayDate && !isSelected ? 'ring-1 ring-red-400' : ''}
                `}
              >
                {format(day, 'd')}
                {/* Available indicator dot */}
                {isAvailable && !isSelected && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-red-500" />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  };

  // Mobile simplified view
  const renderMobileMonth = () => {
    const days = getCalendarDays(currentMonth);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    // Get available dates for this month
    const availableInMonth: string[] = [];
    let d = addDays(today, 1);
    while (d <= monthEnd && d <= addMonths(today, 2)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      if (isDateAvailable(dateStr)) {
        availableInMonth.push(dateStr);
      }
      d = addDays(d, 1);
    }

    return (
      <div>
        {/* Month header with navigation */}
        <div className="flex items-center justify-between mb-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goToPrevMonth}
            disabled={!canGoPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={goToNextMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Available dates list */}
        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {availableInMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No available dates this month
            </p>
          ) : (
            availableInMonth.map((dateStr, i) => {
              const date = parseISO(dateStr);
              const isSelected = selectedDate === dateStr;
              return (
                <motion.button
                  key={dateStr}
                  variants={slotVariants}
                  initial="hidden"
                  animate="visible"
                  custom={i}
                  onClick={() => handleDateClick(dateStr)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors
                    ${isSelected
                      ? 'bg-red-600 text-white'
                      : 'hover:bg-red-50 dark:hover:bg-red-950/50'
                    }
                  `}
                >
                  <Calendar className={`h-4 w-4 shrink-0 ${isSelected ? 'text-white' : 'text-red-600'}`} />
                  <span className="font-medium">{format(date, 'EEE, MMM d')}</span>
                  <Badge
                    variant="secondary"
                    className={`ml-auto text-xs ${
                      isSelected
                        ? 'bg-white/20 text-white hover:bg-white/30'
                        : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400'
                    }`}
                  >
                    {(availableDates[dateStr] || []).length} slots
                  </Badge>
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-5 w-5 text-red-600" />
          Schedule a Viewing
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pick a date and time that works for you
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="flex-1">
                <Skeleton className="h-7 w-32 mb-3" />
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-lg" />
                  ))}
                </div>
              </div>
              <div className="hidden sm:block flex-1">
                <Skeleton className="h-7 w-32 mb-3" />
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                Available
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                Unavailable
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-lg bg-red-600 text-white text-[10px] flex items-center justify-center font-medium">1</span>
                Selected
              </div>
            </div>

            <Separator />

            {/* Desktop: Full calendar grid */}
            <div className="hidden sm:block">
              <div className="flex gap-4">
                {renderMonth(currentMonth, 0)}
                {showTwoMonths && renderMonth(addMonths(currentMonth, 1), 1)}
              </div>
            </div>

            {/* Mobile: Simplified date list */}
            <div className="sm:hidden">
              {renderMobileMonth()}
            </div>

            {/* Time Slots Section */}
            <AnimatePresence mode="wait">
              {selectedDate && (
                <motion.div
                  key={selectedDate}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <Separator className="mb-4" />
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="h-4 w-4 text-red-600" />
                      <h4 className="text-sm font-semibold">
                        Available times for {format(parseISO(selectedDate), 'EEE, MMM d, yyyy')}
                      </h4>
                    </div>

                    {selectedTimeSlots.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <AlertCircle className="h-4 w-4" />
                        No time slots available for this date
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {selectedTimeSlots.map((slot, i) => (
                          <motion.button
                            key={slot.time}
                            custom={i}
                            variants={slotVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            onClick={() => slot.available && setSelectedTimeSlot(slot.time)}
                            disabled={!slot.available}
                            className={`
                              flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                              transition-all duration-150 border
                              ${!slot.available
                                ? 'bg-muted/50 text-muted-foreground/50 cursor-not-allowed border-muted/50 line-through'
                                : selectedTimeSlot === slot.time
                                  ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-500/20'
                                  : 'border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/50 text-foreground cursor-pointer'
                              }
                            `}
                          >
                            <Clock className={`h-3.5 w-3.5 ${
                              !slot.available ? 'text-muted-foreground/40'
                                : selectedTimeSlot === slot.time ? 'text-white'
                                : 'text-red-600'
                            }`} />
                            {slot.time}
                            {selectedTimeSlot === slot.time && (
                              <Check className="h-3.5 w-3.5 ml-auto text-white" />
                            )}
                          </motion.button>
                        ))}
                      </div>
                    )}

                    {/* Request Viewing Button */}
                    {selectedTimeSlot && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-4"
                      >
                        <Button
                          className="w-full bg-red-600 hover:bg-red-700 text-white"
                          onClick={handleBookViewing}
                          disabled={booking}
                        >
                          {booking ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Booking...
                            </>
                          ) : (
                            <>
                              <Calendar className="mr-2 h-4 w-4" />
                              Request Viewing
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          {format(parseISO(selectedDate), 'EEE, MMM d')} at {selectedTimeSlot}
                        </p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* No date selected prompt */}
            {!selectedDate && (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground">
                  Select an available date to see time slots
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
