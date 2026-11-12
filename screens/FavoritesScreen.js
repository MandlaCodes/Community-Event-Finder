
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

const getImage = (event) =>
  event?.image ||
  event?.imageUrl ||
  event?.images?.[0]?.url ||
  event?._embedded?.attractions?.[0]?.images?.[0]?.url ||
  null;

const getTitle = (event) =>
  event?.title || event?.name || 'Untitled event';

function getDate(event) {
  if (event?.date) return event.date;

  const rawDate =
    event?.rawDate ||
    event?.dates?.start?.localDate;

  if (!rawDate) return 'Date to be announced';

  const date = new Date(`${rawDate}T12:00:00`);

  if (Number.isNaN(date.getTime())) return rawDate;

  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getVenue(event) {
  return (
    event?.location ||
    event?._embedded?.venues?.[0]?.name ||
    'Venue to be announced'
  );
}

function SavedCard({
  event,
  navigation,
  onRemove,
  index,
}) {
  const image = getImage(event);

  const fade = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(18)).current;

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
          navigation.navigate('EventDetail', { event })
        }
        accessibilityRole="button"
        accessibilityLabel={`View ${getTitle(event)}`}
      >
        <View style={s.imageContainer}>
          {image ? (
            <Image
              source={{ uri: image }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <View style={s.imageFallback}>
              <Ionicons
                name="images-outline"
                size={34}
                color={C.muted}
              />
            </View>
          )}

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
            onPress={() => onRemove(event)}
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
              {[getVenue(event), event.city]
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

export default function FavoritesScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mounted = useRef(true);
  const mutationQueue = useRef(Promise.resolve());

  const loadFavorites = useCallback(async () => {
    try {
      // Wait for any pending save/remove operation.
      await mutationQueue.current;

      const value = await AsyncStorage.getItem(
        FAVORITES_KEY
      );

      const parsed = value ? JSON.parse(value) : [];

      if (mounted.current) {
        setFavorites(
          Array.isArray(parsed) ? parsed : []
        );
      }
    } catch (error) {
      console.error('Unable to load favorites:', error);

      if (mounted.current) {
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

  const removeFavorite = useCallback(
    (event) => {
      const previous = favorites;

      const updated = favorites.filter(
        (item) =>
          String(item.id) !== String(event.id)
      );

      setFavorites(updated);

      // Serialize writes to avoid overlapping removals.
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
            (item) =>
              String(item.id) !== String(event.id)
          );

          await AsyncStorage.setItem(
            FAVORITES_KEY,
            JSON.stringify(next)
          );
        });

      mutationQueue.current = operation.catch(
        (error) => {
          console.error('Remove favorite failed:', error);

          if (mounted.current) {
            setFavorites(previous);

            Alert.alert(
              'Unable to remove event',
              'Please try again.'
            );
          }
        }
      );
    },
    [favorites]
  );

  const refresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

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

      {!loading && favorites.length > 0 && (
        <View style={s.countRow}>
          <View style={s.countBadge}>
            <Ionicons
              name="bookmark-outline"
              size={15}
              color={C.purple}
            />

            <Text style={s.countText}>
              {favorites.length}{' '}
              {favorites.length === 1
                ? 'saved event'
                : 'saved events'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

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

  return (
    <View style={s.container}>
      <FlatList
        data={loading ? [] : favorites}
        keyExtractor={(item, index) =>
          String(item.id ?? index)
        }
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

  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
