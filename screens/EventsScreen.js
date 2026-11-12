import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
  Alert,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COLORS = {
  background: '#09090E',
  surface: '#17171F',
  surfaceLight: '#22222C',
  primary: '#A855F7',
  text: '#FFFFFF',
  muted: '#9999A7',
  border: '#292932',
};

const API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY;
const CITY_KEY = '@community_selected_city';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: 'apps-outline' },
  { id: 'music', label: 'Music', icon: 'musical-notes-outline' },
  { id: 'nightlife', label: 'Nightlife', icon: 'wine-outline' },
  { id: 'food', label: 'Food', icon: 'restaurant-outline' },
  { id: 'sports', label: 'Sports', icon: 'football-outline' },
  { id: 'festivals', label: 'Festivals', icon: 'bonfire-outline' },
  { id: 'arts', label: 'Arts', icon: 'color-palette-outline' },
  { id: 'film', label: 'Film', icon: 'film-outline' },
];

const SEGMENTS = {
  music: 'KZFzniwnSyZfZ7v7nJ',
  sports: 'KZFzniwnSyZfZ7v7nE',
  arts: 'KZFzniwnSyZfZ7v7na',
  film: 'KZFzniwnSyZfZ7v7nn',
};

const KEYWORDS = {
  nightlife: 'nightlife',
  food: 'food',
  festivals: 'festival',
};

function formatDate(dateString, timeString) {
  if (!dateString) return 'Date to be announced';

  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) return dateString;

  const formatted = date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return timeString
    ? `${formatted} · ${timeString.slice(0, 5)}`
    : formatted;
}

function normalizeEvent(event) {
  const venue = event._embedded?.venues?.[0];
  const images = event.images || [];

  const image =
    images.find(
      (item) =>
        item.ratio === '16_9' &&
        item.width >= 600
    ) ||
    images.find((item) => item.ratio === '16_9') ||
    images[0];

  const start = event.dates?.start || {};

  return {
    id: event.id,
    title: event.name || 'Untitled event',
    date: formatDate(start.localDate, start.localTime),
    rawDate: start.localDate || null,
    rawTime: start.localTime || null,
    location: venue?.name || 'Venue to be announced',
    city: venue?.city?.name || '',
    address: venue?.address?.line1 || '',
    image: image?.url || null,
    description:
      event.info ||
      event.pleaseNote ||
      event.description ||
      '',
    url: event.url || null,
    category:
      event.classifications?.[0]?.segment?.name || '',
    genre:
      event.classifications?.[0]?.genre?.name || '',
    priceMin: event.priceRanges?.[0]?.min ?? null,
    priceMax: event.priceRanges?.[0]?.max ?? null,
    currency: event.priceRanges?.[0]?.currency || null,
  };
}

function EventCard({
  event,
  isFavorite,
  onPress,
  onFavorite,
}) {
  return (
    <TouchableOpacity
      style={styles.eventCard}
      activeOpacity={0.88}
      onPress={onPress}
    >
      <View style={styles.imageContainer}>
        {event.image ? (
          <Image
            source={{ uri: event.image }}
            style={styles.eventImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons
              name="images-outline"
              size={34}
              color={COLORS.muted}
            />
          </View>
        )}

        <LinearGradient
          colors={[
            'transparent',
            'rgba(0,0,0,0.55)',
          ]}
          style={StyleSheet.absoluteFillObject}
        />

        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={onFavorite}
          accessibilityLabel={
            isFavorite
              ? 'Remove saved event'
              : 'Save event'
          }
        >
          <Ionicons
            name={
              isFavorite
                ? 'heart'
                : 'heart-outline'
            }
            size={22}
            color={
              isFavorite
                ? '#FF648A'
                : '#FFFFFF'
            }
          />
        </TouchableOpacity>

        {event.category ? (
          <View style={styles.imageBadge}>
            <Text style={styles.imageBadgeText}>
              {event.category.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.eventInfo}>
        <Text style={styles.eventDate}>
          {event.date}
        </Text>

        <Text
          style={styles.eventTitle}
          numberOfLines={2}
        >
          {event.title}
        </Text>

        <View style={styles.eventLocationRow}>
          <Ionicons
            name="location-outline"
            size={15}
            color={COLORS.muted}
          />

          <Text
            style={styles.eventLocation}
            numberOfLines={1}
          >
            {[event.location, event.city]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        {event.priceMin != null &&
        event.currency ? (
          <Text style={styles.eventPrice}>
            From {event.currency} {event.priceMin}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function EventsScreen({
  navigation,
  route,
}) {
  const insets = useSafeAreaInsets();

  const [city, setCity] = useState('Johannesburg');
  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState('city');

  const [selectedCategory, setSelectedCategory] =
    useState('all');

  const [coordinates, setCoordinates] = useState(null);
  const [events, setEvents] = useState([]);
  const [favorites, setFavorites] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const requestId = useRef(0);
  const searchInputRef = useRef(null);
  const initialized = useRef(false);

  const loadFavorites = useCallback(async () => {
    try {
      const value = await AsyncStorage.getItem(
        'favorites'
      );

      const parsed = value
        ? JSON.parse(value)
        : [];

      setFavorites(
        Array.isArray(parsed) ? parsed : []
      );
    } catch (err) {
      console.error('Favorites error:', err);
      setFavorites([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function syncScreen() {
        await loadFavorites();

        try {
          const savedCity =
            await AsyncStorage.getItem(CITY_KEY);

          if (!active) return;

          if (!initialized.current) {
            initialized.current = true;

            if (savedCity?.trim()) {
              setCity(savedCity.trim());
            }
          }
        } catch (err) {
          console.error('City sync error:', err);
        }
      }

      syncScreen();

      return () => {
        active = false;
      };
    }, [loadFavorites])
  );

  useEffect(() => {
    const category = route?.params?.category;

    if (category) {
      const normalized = String(category).toLowerCase();

      const valid = CATEGORIES.some(
        (item) => item.id === normalized
      );

      setSelectedCategory(
        valid ? normalized : 'all'
      );
    }
  }, [route?.params?.category]);

  const fetchEvents = useCallback(
    async (isRefresh = false) => {
      const currentRequest = ++requestId.current;

      if (!isRefresh) setLoading(true);
      setError('');

      try {
        if (!API_KEY) {
          throw new Error(
            'Missing Ticketmaster API key. Check your .env file.'
          );
        }

        const params = [
          `apikey=${encodeURIComponent(API_KEY)}`,
          'size=40',
          'sort=date,asc',
        ];

        if (coordinates) {
          params.push(
            `latlong=${coordinates.latitude},${coordinates.longitude}`
          );
          params.push('radius=50');
          params.push('unit=km');
        } else if (city.trim()) {
          params.push(
            `city=${encodeURIComponent(city.trim())}`
          );
        }

        if (SEGMENTS[selectedCategory]) {
          params.push(
            `segmentId=${SEGMENTS[selectedCategory]}`
          );
        }

        if (KEYWORDS[selectedCategory]) {
          params.push(
            `keyword=${encodeURIComponent(
              KEYWORDS[selectedCategory]
            )}`
          );
        }

        if (
          searchMode === 'event' &&
          searchText.trim()
        ) {
          params.push(
            `keyword=${encodeURIComponent(
              searchText.trim()
            )}`
          );
        }

        const url =
          'https://app.ticketmaster.com/discovery/v2/events.json?' +
          params.join('&');

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            `Ticketmaster error (${response.status})`
          );
        }

        const data = await response.json();

        if (data.errors?.length) {
          throw new Error(
            data.errors[0]?.detail ||
              'Unable to load events.'
          );
        }

        const results = (
          data._embedded?.events || []
        ).map(normalizeEvent);

        if (currentRequest === requestId.current) {
          setEvents(results);
        }
      } catch (err) {
        console.error('Fetch events error:', err);

        if (currentRequest === requestId.current) {
          setEvents([]);
          setError(
            err.message || 'Unable to load events.'
          );
        }
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      city,
      coordinates,
      selectedCategory,
      searchMode,
      searchText,
    ]
  );

  useEffect(() => {
    if (!initialized.current) return;

    fetchEvents();

    return () => {
      requestId.current += 1;
    };
  }, [fetchEvents]);

  const search = async () => {
    const query = searchText.trim();

    if (!query) {
      searchInputRef.current?.focus();
      return;
    }

    Keyboard.dismiss();

    if (searchMode === 'city') {
      setCoordinates(null);
      setCity(query);
      setSearchText('');

      try {
        await AsyncStorage.setItem(
          CITY_KEY,
          query
        );
      } catch (err) {
        console.error('Save city error:', err);
      }
    } else {
      fetchEvents();
    }
  };

  const useMyLocation = async () => {
    try {
      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Location permission',
          'You can still find events by searching for a city.'
        );
        return;
      }

      setLoading(true);

      const position =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

      setCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      setCity('Near me');
      setSearchText('');
      setSearchMode('city');
    } catch (err) {
      console.error('Location error:', err);

      Alert.alert(
        'Location unavailable',
        'Please search by city instead.'
      );

      setLoading(false);
    }
  };

  const toggleFavorite = async (event) => {
    const previous = favorites;

    const exists = favorites.some(
      (item) => item.id === event.id
    );

    const updated = exists
      ? favorites.filter(
          (item) => item.id !== event.id
        )
      : [...favorites, event];

    setFavorites(updated);

    try {
      await AsyncStorage.setItem(
        'favorites',
        JSON.stringify(updated)
      );
    } catch (err) {
      setFavorites(previous);

      Alert.alert(
        'Could not save event',
        'Please try again.'
      );
    }
  };

  const refreshEvents = () => {
    setRefreshing(true);
    fetchEvents(true);
  };

  const renderHeader = () => (
    <View>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>
            FIND YOUR NEXT EXPERIENCE
          </Text>

          <Text style={styles.headerTitle}>
            Explore
          </Text>
        </View>

        <TouchableOpacity
          style={styles.locationButton}
          onPress={useMyLocation}
        >
          <Ionicons
            name="location-outline"
            size={22}
            color={COLORS.text}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.cityRow}>
        <Ionicons
          name="location"
          size={17}
          color={COLORS.primary}
        />

        <Text style={styles.cityText}>
          {city}
        </Text>
      </View>

      <View style={styles.searchModeRow}>
        {[
          ['city', 'City'],
          ['event', 'Events & artists'],
        ].map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.modeButton,
              searchMode === value &&
                styles.modeButtonActive,
            ]}
            onPress={() => {
              setSearchMode(value);
              setSearchText('');
            }}
          >
            <Text
              style={[
                styles.modeText,
                searchMode === value &&
                  styles.modeTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color={COLORS.muted}
        />

        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder={
            searchMode === 'city'
              ? 'Search by city...'
              : 'Search events or artists...'
          }
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={search}
          returnKeyType="search"
          autoCorrect={false}
        />

        {searchText ? (
          <TouchableOpacity
            onPress={() => setSearchText('')}
          >
            <Ionicons
              name="close-circle"
              size={19}
              color={COLORS.muted}
            />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.searchAction}
          onPress={search}
        >
          <Ionicons
            name="arrow-forward"
            size={18}
            color="#FFFFFF"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.categoryHeading}>
        <Text style={styles.sectionTitle}>
          Categories
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryList}
      >
        {CATEGORIES.map((category) => {
          const active =
            selectedCategory === category.id;

          return (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryChip,
                active &&
                  styles.categoryChipActive,
              ]}
              onPress={() =>
                setSelectedCategory(category.id)
              }
            >
              <Ionicons
                name={category.icon}
                size={17}
                color={
                  active
                    ? '#FFFFFF'
                    : COLORS.muted
                }
              />

              <Text
                style={[
                  styles.categoryLabel,
                  active &&
                    styles.categoryLabelActive,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.resultsHeader}>
        <Text style={styles.sectionTitle}>
          {coordinates
            ? 'Events near you'
            : `Events in ${city}`}
        </Text>

        <Text style={styles.resultsSubtitle}>
          {loading
            ? 'Finding experiences...'
            : `${events.length} events found`}
        </Text>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
          />

          <Text style={styles.emptyDescription}>
            Finding events worth going out for...
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={
              error
                ? 'cloud-offline-outline'
                : 'calendar-outline'
            }
            size={32}
            color={COLORS.primary}
          />
        </View>

        <Text style={styles.emptyTitle}>
          {error
            ? 'Unable to load events'
            : 'Nothing found yet'}
        </Text>

        <Text style={styles.emptyDescription}>
          {error ||
            'Try another city, category or search term.'}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => fetchEvents()}
        >
          <Text style={styles.retryText}>
            Try again
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={loading ? [] : events}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            isFavorite={favorites.some(
              (favorite) =>
                favorite.id === item.id
            )}
            onPress={() =>
              navigation.navigate(
                'EventDetail',
                { event: item }
              )
            }
            onFavorite={() =>
              toggleFavorite(item)
            }
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom:
              insets.bottom + 110,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshEvents}
            tintColor={COLORS.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  listContent: {
    paddingHorizontal: 22,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  headerEyebrow: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 7,
  },

  headerTitle: {
    color: COLORS.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.5,
  },

  locationButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 20,
  },

  cityText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },

  searchModeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },

  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },

  modeButtonActive: {
    backgroundColor: '#332044',
  },

  modeText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },

  modeTextActive: {
    color: '#D8B4FE',
  },

  searchContainer: {
    height: 58,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingLeft: 16,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },

  searchInput: {
    flex: 1,
    height: '100%',
    color: COLORS.text,
    fontSize: 15,
    marginLeft: 12,
  },

  searchAction: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  categoryHeading: {
    marginBottom: 16,
  },

  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },

  categoryList: {
    gap: 9,
    paddingBottom: 32,
  },

  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  categoryLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },

  categoryLabelActive: {
    color: '#FFFFFF',
  },

  resultsHeader: {
    marginBottom: 20,
  },

  resultsSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 7,
  },

  eventCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 18,
  },

  imageContainer: {
    height: 205,
    backgroundColor: COLORS.surfaceLight,
  },

  eventImage: {
    width: '100%',
    height: '100%',
  },

  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  favoriteButton: {
    position: 'absolute',
    top: 13,
    right: 13,
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: 'rgba(12,12,18,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  imageBadge: {
    position: 'absolute',
    bottom: 13,
    left: 14,
    backgroundColor: 'rgba(12,12,18,0.75)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },

  imageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  eventInfo: {
    paddingHorizontal: 17,
    paddingTop: 17,
    paddingBottom: 19,
  },

  eventDate: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },

  eventTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
    marginBottom: 10,
  },

  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  eventLocation: {
    color: COLORS.muted,
    fontSize: 13,
    flex: 1,
  },

  eventPrice: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 13,
  },

  emptyState: {
    paddingTop: 65,
    paddingBottom: 75,
    alignItems: 'center',
  },

  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: '#21152F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  emptyTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 10,
  },

  emptyDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },

  retryButton: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 13,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },

  retryText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
});