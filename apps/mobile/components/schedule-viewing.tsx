import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Alert,
  BodySm,
  Button,
  Subtitle,
  Title,
  TrustNote,
} from '@/components/ui';
import { ChevronRightIcon, CloseIcon, ShieldIcon } from '@/components/icons';
import { radius, space, type as t, usePalette } from '@/lib/theme';

/**
 * Requesting a viewing (FR-5.1).
 *
 * ── These are proposals, not availability ──
 * The reference draws a calendar with some dates greyed and a time grid with
 * one slot disabled, which reads as "these are the times an officer is
 * free". This product cannot say that: `POST /v1/viewings` takes a free
 * `scheduledFor` and there is no endpoint that publishes officer
 * availability. Greying out slots we have not checked would be inventing a
 * constraint, and — worse — implying we had confirmed one we had not.
 *
 * So every future date and every listed time is selectable, and the screen
 * says plainly that dispatch confirms. The reference's own caption already
 * says exactly that: "Our Field Officer will confirm the time with you."
 * Building the honest version of this screen means keeping that line and
 * dropping the greyed cells.
 *
 * ── Why the times are fixed ──
 * Six slots across a working day, not a free time picker. A tenant choosing
 * 03:40 would be proposing something no dispatcher can schedule around, and
 * a coarse grid is faster to use on a phone than a wheel.
 */

const TIMES = [
  { hour: 9, minute: 0, label: '09:00 AM' },
  { hour: 10, minute: 0, label: '10:00 AM' },
  { hour: 11, minute: 0, label: '11:00 AM' },
  { hour: 14, minute: 0, label: '02:00 PM' },
  { hour: 15, minute: 0, label: '03:00 PM' },
  { hour: 16, minute: 0, label: '04:00 PM' },
] as const;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ScheduleViewingSheet({
  visible,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  busy?: boolean;
  error?: { message: string; code?: string } | null;
  onClose: () => void;
  onSubmit: (scheduledFor: Date) => void;
}) {
  const p = usePalette();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [timeIndex, setTimeIndex] = useState<number | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const month = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);

  const grid = useMemo(() => buildMonthGrid(month), [month]);

  const chosen = useMemo(() => {
    if (selectedDay === null || timeIndex === null) return null;
    const time = TIMES[timeIndex];
    return new Date(
      month.getFullYear(),
      month.getMonth(),
      selectedDay,
      time.hour,
      time.minute,
      0,
      0,
    );
  }, [month, selectedDay, timeIndex]);

  // A proposal in the past is the one thing the server will certainly
  // reject, so it is the one thing this screen refuses to send.
  const valid = chosen !== null && chosen.getTime() > Date.now();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={{ flex: 1, backgroundColor: p.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ flex: 1 }}
          onPress={onClose}
        />

        <View
          style={{
            backgroundColor: p.bg,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            maxHeight: '92%',
            paddingTop: space.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.screen,
              marginBottom: space.gutter,
            }}
          >
            <Title>Schedule viewing</Title>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon size={22} color={p.ink} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: space.screen,
              paddingBottom: space.gutter,
            }}
          >
            {error && (
              <Alert tone="error" message={error.message} code={error.code} />
            )}

            <Subtitle>Select date</Subtitle>

            <MonthHeader
              month={month}
              canGoBack={monthOffset > 0}
              onPrev={() => {
                setMonthOffset((m) => Math.max(0, m - 1));
                setSelectedDay(null);
              }}
              onNext={() => {
                setMonthOffset((m) => m + 1);
                setSelectedDay(null);
              }}
            />

            <View style={{ flexDirection: 'row', marginBottom: space.sm }}>
              {WEEKDAYS.map((d) => (
                <Text
                  key={d}
                  style={[
                    t.labelMd,
                    { flex: 1, textAlign: 'center', color: p.inkFaint },
                  ]}
                >
                  {d}
                </Text>
              ))}
            </View>

            {grid.map((week, wi) => (
              <View key={wi} style={{ flexDirection: 'row' }}>
                {week.map((day, di) => {
                  if (day === null) {
                    return <View key={di} style={{ flex: 1, height: 44 }} />;
                  }
                  const date = new Date(
                    month.getFullYear(),
                    month.getMonth(),
                    day,
                  );
                  const past = date < today;
                  const selected = selectedDay === day;
                  return (
                    <Pressable
                      key={di}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: past }}
                      accessibilityLabel={date.toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                      disabled={past}
                      onPress={() => setSelectedDay(day)}
                      style={{
                        flex: 1,
                        height: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: radius.chip,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: selected ? p.brand : 'transparent',
                        }}
                      >
                        <Text
                          style={[
                            t.bodySm,
                            {
                              color: selected
                                ? p.brandInk
                                : past
                                  ? p.inkFaint
                                  : p.ink,
                            },
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={{ marginTop: space.lg }}>
              <Subtitle>Select time</Subtitle>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: space.sm,
                  marginTop: space.md,
                }}
              >
                {TIMES.map((time, i) => {
                  const selected = timeIndex === i;
                  return (
                    <Pressable
                      key={time.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setTimeIndex(i)}
                      style={{
                        // Three to a row, with the gaps taken out.
                        width: '31.5%',
                        minHeight: 46,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: radius.chip,
                        borderWidth: 1,
                        borderColor: selected ? p.brand : p.line,
                        backgroundColor: selected ? p.brand : p.surface,
                      }}
                    >
                      <Text
                        style={[
                          t.labelMd,
                          { color: selected ? p.brandInk : p.ink },
                        ]}
                      >
                        {time.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ marginTop: space.lg }}>
              <TrustNote icon={<ShieldIcon size={20} color={p.brand} />}>
                A House For Rent Field Operations Officer meets you at the
                property — not the landlord, and not a broker. We will confirm
                the time with you before the visit.
              </TrustNote>
            </View>
          </ScrollView>

          <View
            style={{
              paddingHorizontal: space.screen,
              paddingTop: space.md,
              paddingBottom: space.xl,
              borderTopWidth: 1,
              borderTopColor: p.line,
            }}
          >
            <Button
              label={
                chosen
                  ? `Request ${chosen.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}, ${TIMES[timeIndex!].label}`
                  : 'Request viewing'
              }
              icon={<ChevronRightIcon size={20} color={p.brandInk} />}
              disabled={!valid}
              busy={busy}
              onPress={() => chosen && onSubmit(chosen)}
            />
            <BodySm
              tone="faint"
              style={{ textAlign: 'center', marginTop: space.sm }}
            >
              {chosen === null
                ? 'Pick a date and a time to continue.'
                : 'Free for tenants. No viewing fee.'}
            </BodySm>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MonthHeader({
  month,
  canGoBack,
  onPrev,
  onNext,
}: {
  month: Date;
  canGoBack: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: space.md,
        marginBottom: space.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        accessibilityState={{ disabled: !canGoBack }}
        disabled={!canGoBack}
        onPress={onPrev}
        hitSlop={12}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ transform: [{ scaleX: -1 }] }}>
          <ChevronRightIcon
            size={20}
            color={canGoBack ? p.ink : p.inkFaint}
          />
        </View>
      </Pressable>

      <Text style={[t.labelLg, { color: p.ink }]}>
        {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        onPress={onNext}
        hitSlop={12}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronRightIcon size={20} color={p.ink} />
      </Pressable>
    </View>
  );
}

/**
 * A month as rows of seven, Monday-first, padded with nulls.
 *
 * Monday-first because that is the working week in Uganda and the reference
 * draws it that way; `getDay()` is Sunday-first, hence the shift.
 */
function buildMonthGrid(month: Date): (number | null)[][] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const firstWeekday = (new Date(year, m, 1).getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
