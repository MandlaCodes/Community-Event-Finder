
import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Image,
  Animated,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiImage } from '../lib/communityApi';

const C = {
  bg: '#09090E',
  card: '#191920',
  surface: '#24232D',
  purple: '#A855F7',
  white: '#F7F7FA',
  muted: '#AAA9B5',
  border: '#2C2B35',
  pink: '#FF648A',
};

const FAVORITES_KEY = 'favorites';

const fallback = require('../assets/pexels-apasaric-2078008.jpg');

// --------------------------------------------------
// EVENT HELPERS
// --------------------------------------------------

function getImage(event) {
  const candidates = [
    event?.image,
    event?.imageUrl,
    event?.image_url,
    event?.images,
    event?.thumbnail,
    event?._embedded?.attractions?.[0]?.images,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const url = apiImage(candidate);

    if (url) return url;
  }

  return null;
}

function getTitle(event) {
  return event?.title || event?.name || 'Untitled event';
}

function getRawDate(event) {
  return (
    event?.rawDate ||
    event?.dates?.start?.localDate ||
    null
  );
}

function getRawTime(event) {
  return (
    event?.rawTime ||
    event?.dates?.start?.localTime ||
    null
  );
}

function getDate(event) {
  const rawDate = getRawDate(event);

  if (!rawDate) {
    return event?.date || 'Date to be announced';
  }

  const date = new Date(`${rawDate}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(rawDate);
  }

  const formatted = date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const time = getRawTime(event);

  return time
    ? `${formatted} · ${String(time).slice(0, 5)}`
    : formatted;
}

function getVenue(event) {
  return (
    event?.location ||
    event?._embedded?.venues?.[0]?.name ||
    'Venue to be announced'
  );
}

function getCity(event) {
  return (
    event?.city ||
    event?._embedded?.venues?.[0]?.city?.name ||
    ''
  );
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function eventGroupKey(event) {
  const title = normalizeText(getTitle(event));
  const venue = normalizeText(getVenue(event));
  const city = normalizeText(getCity(event));

  return `${title}|${venue}|${city}`;
}

function eventTimestamp(event) {
  const date = getRawDate(event);

  if (!date) {
    return '9999-12-31T23:59:59';
  }

  return `${date}T${getRawTime(event) || '00:00:00'}`;
}

function eventId(event) {
  return `${event?.kind || 'event'}:${String(event?.id || '')}`;
}

// --------------------------------------------------
// GROUP DUPLICATE SAVED EVENTS
// --------------------------------------------------

function groupSavedEvents(events) {
  const groups = new Map();

  for (const event of events) {
    if (!event || typeof event !== 'object') {
      continue;
    }

    const key = eventGroupKey(event);

    if (!groups.has(key)) {
      groups.set(key, {
        ...event,
        image: getImage(event),
        savedPerformanceCount: 1,
      });

      continue;
    }

    const existing = groups.get(key);

    const earlier =
      eventTimestamp(event) <
      eventTimestamp(existing);

    const preferred = earlier
      ? event
      : existing;

    const other = earlier
      ? existing
      : event;

    groups.set(key, {
      ...preferred,

      image:
        getImage(preferred) ||
        getImage(other) ||
        null,

      description:
        preferred.description ||
        other.description ||
        '',

      url:
        preferred.url ||
        other.url ||
        null,

      savedPerformanceCount:
        existing.savedPerformanceCount + 1,
    });
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      eventTimestamp(a).localeCompare(
        eventTimestamp(b)
      )
  );
}

// --------------------------------------------------
// SAVED EVENT CARD
// --------------------------------------------------

function SavedCard({
  event,
  navigation,
  onRemove,
  index,
}) {
  const imageUrl = getImage(event);

  const [imageFailed, setImageFailed] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 380,
        delay: Math.min(index * 65, 350),
        useNativeDriver: true,
      }),

      Animated.timing(translate, {
        toValue: 0,
        duration: 380,
        delay: Math.min(index * 65, 350),
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => animation.stop();
  }, [fade, translate, index]);

  const showRemote = !!imageUrl && !imageFailed;

  return (
    <Animated.View
      style={{
        opacity: fade,
        transform: [{ translateY: translate }],
      }}
    >
      <Pressable
        style={s.eventCard}
        onPress={() =>
          navigation.navigate('EventDetail', {
            event,
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`View ${getTitle(event)}`}
      >
        <View style={s.imageContainer}>
          <Image
            source={
              showRemote
                ? { uri: imageUrl }
                : fallback
            }
            style={s.eventImage}
            resizeMode="cover"
            onError={(error) => {
              if (showRemote) {
                console.warn(
                  '[Community] Saved image failed:',
                  getTitle(event),
                  imageUrl,
                  error?.nativeEvent?.error
                );

                setImageFailed(true);
              }
            }}
          />

          <LinearGradient
            colors={[
              'transparent',
              'rgba(9,9,14,0.10)',
              'rgba(9,9,14,0.60)',
            ]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          <View style={s.savedBadge}>
            <Ionicons
              name="bookmark"
              size={12}
              color="#E3B9FF"
            />

            <Text style={s.savedBadgeText}>
              SAVED
            </Text>
          </View>

          <Pressable
            style={s.heartButton}
            onPress={(pressEvent) => {
              pressEvent.stopPropagation();
              onRemove(event);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${getTitle(event)} from saved events`}
            hitSlop={8}
          >
            <Ionicons
              name="heart"
              size={21}
              color={C.pink}
            />
          </Pressable>
        </View>

        <View style={s.eventInfo}>
          <Text
            style={s.eventDate}
            numberOfLines={1}
          >
            {getDate(event)}
          </Text>

          <Text
            style={s.eventTitle}
            numberOfLines={2}
          >
            {getTitle(event)}
          </Text>

          {event.savedPerformanceCount > 1 ||
          event.performanceCount > 1 ? (
            <View style={s.performanceRow}>
              <Ionicons
                name="calendar-outline"
                size={15}
                color={C.purple}
              />

              <Text style={s.performanceText}>
                Multiple performances available
              </Text>
            </View>
          ) : null}

          <View style={s.locationRow}>
            <Ionicons
              name="location-outline"
              size={15}
              color={C.muted}
            />

            <Text
              style={s.eventVenue}
              numberOfLines={1}
            >
              {[getVenue(event), getCity(event)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>

          <View style={s.cardFooter}>
            <Text style={s.detailsText}>
              View event details
            </Text>

            <View style={s.arrowCircle}>
              <Ionicons
                name="arrow-forward"
                size={17}
                color={C.white}
              />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// --------------------------------------------------
// FAVORITES SCREEN
// --------------------------------------------------

export default function FavoritesScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  const mutationQueue = useRef(Promise.resolve());
  const favoritesRef = useRef([]);

  // --------------------------------------------------
  // LOAD FAVORITES
  // --------------------------------------------------

  const loadFavorites = useCallback(async () => {
    try {
      await mutationQueue.current;

      const value = await AsyncStorage.getItem(
        FAVORITES_KEY
      );

      const parsed = value
        ? JSON.parse(value)
        : [];

      const list = Array.isArray(parsed)
        ? parsed
        : [];

      if (mounted.current) {
        favoritesRef.current = list;
        setFavorites(list);
      }
    } catch (error) {
      console.error(
        '[Community] Unable to load favorites:',
        error
      );

      if (mounted.current) {
        favoritesRef.current = [];
        setFavorites([]);
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
  );

  // --------------------------------------------------
  // REMOVE SAVED EVENT
  // --------------------------------------------------

  const removeFavorite = useCallback((event) => {
    const key = eventGroupKey(event);

    const previous = favoritesRef.current;

    const updated = previous.filter(
      (item) => eventGroupKey(item) !== key
    );

    favoritesRef.current = updated;
    setFavorites(updated);

    const operation = mutationQueue.current
      .catch(() => {})
      .then(async () => {
        const stored = await AsyncStorage.getItem(
          FAVORITES_KEY
        );

        const parsed = stored
          ? JSON.parse(stored)
          : [];

        const current = Array.isArray(parsed)
          ? parsed
          : [];

        const next = current.filter(
          (item) => eventGroupKey(item) !== key
        );

        await AsyncStorage.setItem(
          FAVORITES_KEY,
          JSON.stringify(next)
        );
      });

    mutationQueue.current = operation.catch(
      (error) => {
        console.error(
          '[Community] Remove favorite failed:',
          error
        );

        if (mounted.current) {
          Alert.alert(
            'Unable to remove event',
            'Please try again.'
          );

          loadFavorites();
        }
      }
    );
  }, [loadFavorites]);

  // --------------------------------------------------
  // REFRESH
  // --------------------------------------------------

  const refresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

  const uniqueFavorites = groupSavedEvents(favorites);

  // --------------------------------------------------
  // HEADER
  // --------------------------------------------------

  const renderHeader = () => (
    <View style={s.header}>
      <View style={s.headerTop}>
        <View>
          <Text style={s.eyebrow}>
            YOUR EXPERIENCES
          </Text>

          <Text style={s.title}>
            Saved
            <Text style={{ color: C.purple }}>.</Text>
          </Text>
        </View>

        <View style={s.headerIcon}>
          <Ionicons
            name="heart"
            size={23}
            color={C.purple}
          />
        </View>
      </View>

      <Text style={s.subtitle}>
        Keep the experiences you love in one place.
      </Text>

      {!loading && uniqueFavorites.length > 0 && (
        <View style={s.countRow}>
          <View style={s.countBadge}>
            <Ionicons
              name="bookmark-outline"
              size={15}
              color={C.purple}
            />

            <Text style={s.countText}>
              {uniqueFavorites.length}{' '}
              {uniqueFavorites.length === 1
                ? 'saved event'
                : 'saved events'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  // --------------------------------------------------
  // EMPTY STATE
  // --------------------------------------------------

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={s.loadingState}>
          <ActivityIndicator
            size="large"
            color={C.purple}
          />
        </View>
      );
    }

    return (
      <View style={s.emptyState}>
        <View style={s.emptyIconOuter}>
          <View style={s.emptyIconInner}>
            <Ionicons
              name="heart-outline"
              size={43}
              color={C.purple}
            />
          </View>
        </View>

        <Text style={s.emptyTitle}>
          Nothing saved yet.
        </Text>

        <Text style={s.emptyDescription}>
          Found something you love? Tap the heart on
          any event to save it here for later.
        </Text>

        <Pressable
          style={s.exploreButton}
          onPress={() => navigation.navigate('Events')}
        >
          <Text style={s.exploreButtonText}>
            Explore events
          </Text>

          <Ionicons
            name="arrow-forward"
            size={19}
            color="#FFFFFF"
          />
        </Pressable>
      </View>
    );
  };

  // --------------------------------------------------
  // MAIN SCREEN
  // --------------------------------------------------

  return (
    <View style={s.container}>
      <FlatList
        data={loading ? [] : uniqueFavorites}
        keyExtractor={(item) => eventGroupKey(item)}
        renderItem={({ item, index }) => (
          <SavedCard
            event={item}
            index={index}
            navigation={navigation}
            onRemove={removeFavorite}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          s.listContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 110,
            flexGrow: 1,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={C.purple}
          />
        }
      />
    </View>
  );
}

// --------------------------------------------------
// STYLES
// --------------------------------------------------

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  listContent: {
    paddingHorizontal: 22,
  },

  header: {
    marginBottom: 28,
  },

  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  eyebrow: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 7,
  },

  title: {
    color: C.white,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.5,
  },

  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#251733',
    alignItems: 'center',
    justifyContent: 'center',
  },

  subtitle: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 13,
  },

  countRow: {
    marginTop: 22,
    flexDirection: 'row',
  },

  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#251733',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  countText: {
    color: '#DDB9FF',
    fontSize: 12,
    fontWeight: '700',
  },

  eventCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 19,
    borderWidth: 1,
    borderColor: C.border,
  },

  imageContainer: {
    height: 205,
    backgroundColor: C.surface,
  },

  eventImage: {
    width: '100%',
    height: '100%',
  },

  savedBadge: {
    position: 'absolute',
    bottom: 13,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(12,12,18,0.80)',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },

  savedBadgeText: {
    color: '#E3B9FF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  heartButton: {
    position: 'absolute',
    top: 13,
    right: 13,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(12,12,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  eventInfo: {
    paddingHorizontal: 17,
    paddingTop: 16,
    paddingBottom: 17,
  },

  eventDate: {
    color: C.purple,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },

  eventTitle: {
    color: C.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
  },

  performanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 11,
  },

  performanceText: {
    color: '#D3A6FF',
    fontSize: 12,
    fontWeight: '600',
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
  },

  eventVenue: {
    color: C.muted,
    fontSize: 13,
    flex: 1,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 19,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#36343F',
  },

  detailsText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
  },

  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#33223F',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingState: {
    paddingTop: 80,
    alignItems: 'center',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 70,
  },

  emptyIconOuter: {
    width: 124,
    height: 124,
    borderRadius: 42,
    backgroundColor: '#17111F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },

  emptyIconInner: {
    width: 92,
    height: 92,
    borderRadius: 31,
    backgroundColor: '#291A3B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    color: C.white,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.7,
    textAlign: 'center',
  },

  emptyDescription: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 28,
    maxWidth: 285,
  },

  exploreButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: C.purple,
    paddingHorizontal: 23,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
