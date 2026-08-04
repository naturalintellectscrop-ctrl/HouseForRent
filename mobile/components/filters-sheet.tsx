import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import {
  Body,
  BodySm,
  Button,
  Chip,
  Field,
  Subtitle,
  Title,
} from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { radius, space, type as t, usePalette } from '@/lib/theme';
import { Text } from 'react-native';

/**
 * The filters sheet (FR-4.1).
 *
 * ── What is here, and what is deliberately not ──
 * The reference draws four filters: budget, bedrooms, neighbourhood and
 * amenities. Two of them ship.
 *
 * `SearchQueryDto` already accepts `minRent`, `maxRent` and `bedrooms`, so
 * budget and bedrooms are real filters that narrow the query server-side.
 * It also accepts `neighbourhoodId` and `amenityId` — but there is no
 * endpoint that lists the neighbourhoods or amenities, and `SearchResult`
 * returns `neighbourhoodName` without the matching id, so a client has no
 * way to populate those chips or map a tap back to a filter value. Drawing
 * them anyway would mean either inventing a list that does not match the
 * corridor taxonomy, or shipping a control that silently does nothing.
 * They are left out until the taxonomy is reachable.
 *
 * ── Property type stays client-side, and says so ──
 * It narrows the page the server already returned. That is the only
 * client-side narrowing in the app, and it can only ever remove rows the
 * server approved — never reveal one it withheld.
 */

export interface Filters {
  minRent: string;
  maxRent: string;
  bedrooms: number | null;
}

export const NO_FILTERS: Filters = {
  minRent: '',
  maxRent: '',
  bedrooms: null,
};

export function countActive(f: Filters): number {
  return (
    (f.minRent ? 1 : 0) + (f.maxRent ? 1 : 0) + (f.bedrooms !== null ? 1 : 0)
  );
}

const BEDROOM_OPTIONS = [1, 2, 3, 4];

export function FiltersSheet({
  visible,
  initial,
  onApply,
  onClose,
}: {
  visible: boolean;
  initial: Filters;
  onApply: (filters: Filters) => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [draft, setDraft] = useState<Filters>(initial);

  // Re-seed from the applied filters each time the sheet opens, so
  // abandoning an edit does not leave the draft half-changed behind it.
  const [seenVisible, setSeenVisible] = useState(visible);
  if (visible !== seenVisible) {
    setSeenVisible(visible);
    if (visible) setDraft(initial);
  }

  const invalidRange =
    draft.minRent !== '' &&
    draft.maxRent !== '' &&
    Number(draft.minRent) > Number(draft.maxRent);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: p.scrim, justifyContent: 'flex-end' }}>
        {/* Tapping the dimmed area behind a sheet closes it — the gesture
            every bottom sheet has trained people to expect. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          style={{ flex: 1 }}
          onPress={onClose}
        />

        <View
          style={{
            backgroundColor: p.bg,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            maxHeight: '88%',
            paddingTop: space.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space.screen,
              marginBottom: space.md,
            }}
          >
            <Title>Filters</Title>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close filters"
              onPress={onClose}
              hitSlop={12}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon size={24} color={p.ink} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: space.screen,
              paddingBottom: space.lg,
            }}
          >
            <Subtitle>Budget</Subtitle>
            <BodySm style={{ marginTop: 2, marginBottom: space.md }}>
              Shillings per month. Leave either side blank for no limit.
            </BodySm>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: space.md,
              }}
            >
              <Field
                label="Minimum"
                containerStyle={{ flex: 1 }}
                value={draft.minRent}
                onChangeText={(v) =>
                  setDraft({ ...draft, minRent: digitsOnly(v) })
                }
                placeholder="Any"
                keyboardType="number-pad"
              />
              <Field
                label="Maximum"
                containerStyle={{ flex: 1 }}
                value={draft.maxRent}
                onChangeText={(v) =>
                  setDraft({ ...draft, maxRent: digitsOnly(v) })
                }
                placeholder="Any"
                keyboardType="number-pad"
                error={invalidRange ? 'Lower than the minimum.' : null}
              />
            </View>

            <View style={{ marginTop: space.md }}>
              <Subtitle>Bedrooms</Subtitle>
              <BodySm style={{ marginTop: 2, marginBottom: space.md }}>
                Shows homes with at least this many.
              </BodySm>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {BEDROOM_OPTIONS.map((n) => (
                  <Chip
                    key={n}
                    grow
                    label={n === 4 ? '4+' : String(n)}
                    selected={draft.bedrooms === n}
                    onPress={() =>
                      setDraft({
                        ...draft,
                        bedrooms: draft.bedrooms === n ? null : n,
                      })
                    }
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              gap: space.md,
              paddingHorizontal: space.screen,
              paddingTop: space.md,
              paddingBottom: space.xl,
              borderTopWidth: 1,
              borderTopColor: p.line,
            }}
          >
            <Button
              label="Clear all"
              variant="ghost"
              onPress={() => setDraft(NO_FILTERS)}
            />
            <Button
              label="Show homes"
              style={{ flex: 1 }}
              disabled={invalidRange}
              onPress={() => onApply(draft)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** The server takes money as integer shillings; nothing else is worth sending. */
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}
