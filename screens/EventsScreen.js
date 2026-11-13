
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
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

import {
  getEvents,
  apiImage,
} from '../lib/communityApi';

// ============================================================
// THEME
// ============================================================

const COLORS = {
  background: '#09090E',
  surface: '#17171F',
  surfaceLight: '#22222C',
  primary: '#A855F7',
  text: '#FFFFFF',
  muted: '#9999A7',
  border: '#292932',
};

const CITY_KEY = '@community_selected_city';
const COUNTRY_KEY = '@community_selected_country';
const FAVORITES_KEY = 'favorites';

const EVENT_PAGES = 5;

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

const fallback = require('../assets/pexels-apasaric-2078008.jpg');

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateString, timeString) {
  if (!dateString) return 'Date to be announced';

  const match = String(dateString).match(
    /\d{4}-\d{2}-\d{2}/
  );

  if (!match) return String(dateString);

  const date = new Date(`${match[0]}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(dateString);
  }

  const formatted = date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const time = timeString
    ? String(timeString).slice(0, 5)
    : '';

  return time
    ? `${formatted} · ${time}`
    : formatted;
}

function resolveImage(event) {
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

function normalizeEvent(event) {
  const start = event?.dates?.start || {};
  const venue = event?._embedded?.venues?.[0] || {};

  const rawDate =
    event?.rawDate ||
    start.localDate ||
    null;

  const rawTime =
    event?.rawTime ||
    start.localTime ||
    null;

  const performanceDates = Array.isArray(
    event?.performanceDates
  )
    ? event.performanceDates
    : [];

  const performanceCount = Math.max(
    Number(event?.performanceCount) || 0,
    performanceDates.length,
    1
  );

  return {
    ...event,

    id: String(event.id),
    kind: event.kind || 'event',

    title:
      event.title ||
      event.name ||
      'Untitled event',

    rawDate,
    rawTime,

    date: formatDate(rawDate, rawTime),

    location:
      event.location ||
      venue.name ||
      'Venue to be announced',

    city:
      event.city ||
      venue.city?.name ||
      '',

    address:
      event.address ||
      venue.address?.line1 ||
      '',

    image: resolveImage(event),

    description:
      event.description ||
      event.info ||
      event.pleaseNote ||
      '',

    url:
      event.url ||
      event.ticketUrl ||
      null,

    category:
      event.category ||
      event.classifications?.[0]?.segment?.name ||
      'Event',

    genre:
      event.genre ||
      event.classifications?.[0]?.genre?.name ||
      '',

    priceMin:
      event.priceMin ??
      event.priceRanges?.[0]?.min ??
      null,

    priceMax:
      event.priceMax ??
      event.priceRanges?.[0]?.max ??
      null,

    currency:
      event.currency ||
      event.priceRanges?.[0]?.currency ||
      null,

    performanceCount,
    performanceDates,
  };
}

function duplicateKey(event) {
  return [
    normalizeText(event.title),
    normalizeText(event.location),
    normalizeText(event.city),
  ].join('|');
}

function eventTimestamp(event) {
  return (
    `${event.rawDate || '9999-12-31'}T` +
    `${event.rawTime || '23:59:59'}`
  );
}

function normalizePerformance(performance) {
  return {
    id: String(performance.id || ''),
    rawDate: performance.rawDate || null,
    rawTime: performance.rawTime || null,
    url: performance.url || null,
  };
}

function performanceKey(performance) {
  if (performance.id) {
    return `id:${performance.id}`;
  }

  return [
    performance.rawDate || '',
    performance.rawTime || '',
    performance.url || '',
  ].join('|');
}

// ============================================================
// DEDUPLICATION
// ============================================================
// Backend already groups repeated performances.
// This is an additional safety net for overlapping results.
// ============================================================

function removeDuplicateEvents(events) {
  const groups = new Map();

  for (const event of events) {
    const key = duplicateKey(event);

    const incomingPerformances =
      event.performanceDates?.length > 0
        ? event.performanceDates.map(normalizePerformance)
        : [
            normalizePerformance({
              id: event.id,
              rawDate: event.rawDate,
              rawTime: event.rawTime,
              url: event.url,
            }),
          ];

    if (!groups.has(key)) {
      groups.set(key, {
        ...event,
        performanceDates: incomingPerformances,
        performanceCount: Math.max(
          event.performanceCount || 1,
          incomingPerformances.length
        ),
      });

      continue;
    }

    const existing = groups.get(key);

    const allPerformances = [
      ...(existing.performanceDates || []),
      ...incomingPerformances,
    ];

    const uniquePerformances = Array.from(
      new Map(
        allPerformances.map((performance) => [
          performanceKey(performance),
          performance,
        ])
      ).values()
    );

    uniquePerformances.sort((a, b) => {
      const aTime =
        `${a.rawDate || '9999-12-31'}T` +
        `${a.rawTime || '23:59:59'}`;

      const bTime =
        `${b.rawDate || '9999-12-31'}T` +
        `${b.rawTime || '23:59:59'}`;

      return aTime.localeCompare(bTime);
    });

    const incomingEarlier =
      eventTimestamp(event) < eventTimestamp(existing);

    const preferred = incomingEarlier
      ? event
      : existing;

    const other = incomingEarlier
      ? existing
      : event;

    groups.set(key, {
      ...preferred,

      image:
        preferred.image ||
        other.image ||
        null,

      description:
        preferred.description ||
        other.description ||
        '',

      url:
        preferred.url ||
        other.url ||
        null,

      performanceDates: uniquePerformances,

      performanceCount: Math.max(
        uniquePerformances.length,
        existing.performanceCount || 1,
        event.performanceCount || 1
      ),
    });
  }

  return Array.from(groups.values()).sort((a, b) =>
    eventTimestamp(a).localeCompare(eventTimestamp(b))
  );
}

function eventKey(event) {
  return `${event?.kind || 'event'}:${String(
    event?.id || ''
  )}`;
}

function favoriteMatches(favorite, event) {
  return (
    eventKey(favorite) === eventKey(event) ||
    (
      favorite?.kind !== 'place' &&
      event?.kind !== 'place' &&
      String(favorite?.id) === String(event?.id)
    )
  );
}

// ============================================================
// EVENT CARD
// ============================================================

const EventCard = React.memo(function EventCard({
  event,
  isFavorite,
  onPress,
  onFavorite,
}) {
  const imageUrl = resolveImage(event);

  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const showRemote = !!imageUrl && !imageFailed;

  const performanceCount =
    event.performanceCount || 1;

  return (
    <TouchableOpacity
      style={styles.eventCard}
      activeOpacity={0.88}
      onPress={onPress}
    >
      <View style={styles.imageContainer}>
        <Image
          key={imageUrl || 'fallback'}
          source={
            showRemote
              ? { uri: imageUrl }
              : fallback
          }
          style={styles.eventImage}
          resizeMode="cover"
          onError={(error) => {
            if (!showRemote) return;

            console.warn(
              '[Community] Explore image failed:',
              event.title,
              imageUrl,
              error?.nativeEvent?.error
            );

            setImageFailed(true);
          }}
        />

        <LinearGradient
          colors={[
            'transparent',
            'rgba(0,0,0,0.55)',
          ]}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
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
              {String(event.category).toUpperCase()}
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

        {performanceCount > 1 ? (
          <View style={styles.performanceRow}>
            <Ionicons
              name="calendar-outline"
              size={15}
              color={COLORS.primary}
            />

            <Text style={styles.performanceText}>
              {`${performanceCount} performances available`}
            </Text>
          </View>
        ) : null}

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
            From {event.currency}{' '}
            {event.priceMin}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

// ============================================================
// STABLE SEARCH HEADER
// ============================================================
// Defined outside EventsScreen so keyboard focus remains stable.
// ============================================================

const ExploreHeader = React.memo(function ExploreHeader({
  city,
  searchText,
  setSearchText,
  searchMode,
  onChangeSearchMode,
  onSearch,
  onClearSearch,
  onUseMyLocation,
  selectedCategory,
  onSelectCategory,
  loading,
  resultCount,
  searchInputRef,
  searchRadius,
  isPartial,
  appliedKeyword,
}) {
  return (
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
          onPress={onUseMyLocation}
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

        {searchRadius ? (
          <View style={styles.radiusBadge}>
            <Text style={styles.radiusText}>
              {`${searchRadius} km area`}
            </Text>
          </View>
        ) : null}
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
            onPress={() => onChangeSearchMode(value)}
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
          onSubmitEditing={onSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={true}
        />

        {searchText.length > 0 || appliedKeyword ? (
          <TouchableOpacity
            onPress={onClearSearch}
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
          onPress={onSearch}
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
        keyboardShouldPersistTaps="always"
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
                onSelectCategory(category.id)
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
          {appliedKeyword
            ? `Results for "${appliedKeyword}"`
            : `Events in ${city}`}
        </Text>

        <Text style={styles.resultsSubtitle}>
          {loading
            ? appliedKeyword
              ? 'Searching live event listings...'
              : 'Finding experiences across the city...'
            : `${resultCount} unique events found`}
        </Text>

        {!loading && isPartial ? (
          <Text style={styles.partialText}>
            Some event listings may be temporarily unavailable.
          </Text>
        ) : null}
      </View>
    </View>
  );
});

// ============================================================
// EXPLORE SCREEN
// ============================================================

export default function EventsScreen({
  navigation,
  route,
}) {
  const insets = useSafeAreaInsets();

  const [city, setCity] = useState('Johannesburg');
  const [country, setCountry] = useState('');

  const [searchText, setSearchText] = useState('');
  const [searchMode, setSearchMode] = useState('city');
  const [appliedKeyword, setAppliedKeyword] = useState('');

  const [selectedCategory, setSelectedCategory] =
    useState('all');

  const [events, setEvents] = useState([]);
  const [favorites, setFavorites] = useState([]);

  const [initialized, setInitialized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [searchRadius, setSearchRadius] = useState(null);
  const [isPartial, setIsPartial] = useState(false);

  const requestId = useRef(0);
  const searchInputRef = useRef(null);
  const favoritesRef = useRef([]);
  const mutationQueue = useRef(Promise.resolve());

  // ==========================================================
  // INITIALIZE CITY
  // ==========================================================

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const values = await AsyncStorage.multiGet([
          CITY_KEY,
          COUNTRY_KEY,
        ]);

        if (!active) return;

        const savedCity = values[0]?.[1];
        const savedCountry = values[1]?.[1];

        if (savedCity?.trim()) {
          setCity(savedCity.trim());
        }

        if (savedCountry?.trim()) {
          setCountry(savedCountry.trim());
        }
      } catch (err) {
        console.warn(
          '[Community] Explore initialization:',
          err
        );
      } finally {
        if (active) {
          setInitialized(true);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  // ==========================================================
  // FAVORITES
  // ==========================================================

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

      favoritesRef.current = list;
      setFavorites(list);
    } catch (err) {
      console.warn(
        '[Community] Favorites error:',
        err
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
  );

  // ==========================================================
  // SYNC LOCATION WITH HOME
  // ==========================================================

  useFocusEffect(
    useCallback(() => {
      if (!initialized) return;

      let active = true;

      async function syncCity() {
        try {
          const values = await AsyncStorage.multiGet([
            CITY_KEY,
            COUNTRY_KEY,
          ]);

          if (!active) return;

          const savedCity = values[0]?.[1];
          const savedCountry = values[1]?.[1];

          if (
            savedCity?.trim() &&
            savedCity.trim() !== city
          ) {
            setCity(savedCity.trim());
          }

          if (
            (savedCountry || '') !== country
          ) {
            setCountry(savedCountry || '');
          }
        } catch (err) {
          console.warn(
            '[Community] City sync error:',
            err
          );
        }
      }

      syncCity();

      return () => {
        active = false;
      };
    }, [initialized, city, country])
  );

  // ==========================================================
  // CATEGORY FROM HOME
  // ==========================================================

  useEffect(() => {
    const category = route?.params?.category;

    if (!category) return;

    const normalized = String(
      category
    ).toLowerCase();

    const valid = CATEGORIES.some(
      (item) => item.id === normalized
    );

    setSelectedCategory(
      valid ? normalized : 'all'
    );
  }, [route?.params?.category]);

  // ==========================================================
  // FETCH EVENTS
  // ==========================================================

  const fetchEvents = useCallback(
    async (isRefresh = false) => {
      const currentRequest = ++requestId.current;

      if (!isRefresh) {
        setLoading(true);
      }

      setError('');

      try {
        // IMPORTANT:
        // The keyword is sent to the backend.
        // Ticketmaster searches its provider catalogue.
        // We no longer filter only downloaded events.

        const response = await getEvents({
          city: city.trim() || 'Johannesburg',
          country,
          category: selectedCategory,
          keyword: appliedKeyword.trim(),
          pages: EVENT_PAGES,
        });

        const items = Array.isArray(response?.items)
          ? response.items
          : [];

        const normalized = items.map(normalizeEvent);

        const uniqueEvents =
          removeDuplicateEvents(normalized);

        if (currentRequest !== requestId.current) {
          return;
        }

        setEvents(uniqueEvents);

        setSearchRadius(
          response?.searchMode === 'radius'
            ? response?.radiusKm || null
            : null
        );

        setIsPartial(!!response?.partial);

        console.log(
          '[Community] Live event discovery:',
          {
            city,
            keyword: appliedKeyword,
            category: selectedCategory,
            searchMode: response?.searchMode,
            radiusKm: response?.radiusKm,
            providerPerformances:
              response?.totalPerformances,
            providerDuplicatesRemoved:
              response?.duplicatesRemoved,
            providerTotalElements:
              response?.providerTotalElements,
            pagesFetched:
              response?.pagesFetched,
            uniqueEvents: uniqueEvents.length,
          }
        );
      } catch (err) {
        console.error(
          '[Community] Explore fetch error:',
          err
        );

        if (currentRequest === requestId.current) {
          setEvents([]);
          setSearchRadius(null);
          setIsPartial(false);

          setError(
            err?.message ||
              'Unable to load events.'
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
      country,
      selectedCategory,
      appliedKeyword,
    ]
  );

  useEffect(() => {
    if (!initialized) return;

    fetchEvents();

    return () => {
      requestId.current += 1;
    };
  }, [initialized, fetchEvents]);

  // ==========================================================
  // SEARCH
  // ==========================================================

  const search = useCallback(async () => {
    const query = searchText.trim();

    if (!query) {
      if (
        searchMode === 'event' &&
        appliedKeyword
      ) {
        setAppliedKeyword('');
        Keyboard.dismiss();
        return;
      }

      searchInputRef.current?.focus();
      return;
    }

    Keyboard.dismiss();

    if (searchMode === 'city') {
      setCity(query);
      setCountry('');
      setSearchText('');
      setAppliedKeyword('');

      try {
        await AsyncStorage.multiSet([
          [CITY_KEY, query],
          [COUNTRY_KEY, ''],
        ]);
      } catch (err) {
        console.warn(
          '[Community] Save city error:',
          err
        );
      }
    } else {
      // Triggers a new backend request using keyword.
      setAppliedKeyword(query);
    }
  }, [
    searchText,
    searchMode,
    appliedKeyword,
  ]);

  const clearSearch = useCallback(() => {
    setSearchText('');

    if (searchMode === 'event') {
      setAppliedKeyword('');
    }
  }, [searchMode]);

  const changeSearchMode = useCallback((value) => {
    Keyboard.dismiss();
    setSearchMode(value);
    setSearchText('');

    if (value === 'city') {
      setAppliedKeyword('');
    }
  }, []);

  // ==========================================================
  // USE MY LOCATION
  // ==========================================================

  const useMyLocation = useCallback(async () => {
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

      const places =
        await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

      const place = places?.[0];

      const detectedCity =
        place?.city ||
        place?.subregion ||
        place?.region ||
        '';

      const detectedCountry =
        place?.isoCountryCode || '';

      if (!detectedCity) {
        throw new Error(
          'Could not determine your city.'
        );
      }

      const locationChanged =
        detectedCity !== city ||
        detectedCountry !== country ||
        !!appliedKeyword;

      setCity(detectedCity);
      setCountry(detectedCountry);
      setSearchText('');
      setAppliedKeyword('');
      setSearchMode('city');

      await AsyncStorage.multiSet([
        [CITY_KEY, detectedCity],
        [COUNTRY_KEY, detectedCountry],
      ]);

      if (!locationChanged) {
        setLoading(false);
      }
    } catch (err) {
      console.warn(
        '[Community] Location error:',
        err
      );

      Alert.alert(
        'Location unavailable',
        'Please search by city instead.'
      );

      setLoading(false);
    }
  }, [city, country, appliedKeyword]);

  // ==========================================================
  // FAVORITES
  // ==========================================================

  const toggleFavorite = useCallback((event) => {
    const previous = favoritesRef.current;

    const exists = previous.some(
      (item) => favoriteMatches(item, event)
    );

    const updated = exists
      ? previous.filter(
          (item) => !favoriteMatches(item, event)
        )
      : [...previous, event];

    favoritesRef.current = updated;
    setFavorites(updated);

    const operation = mutationQueue.current
      .catch(() => {})
      .then(async () => {
        const raw = await AsyncStorage.getItem(
          FAVORITES_KEY
        );

        const parsed = raw
          ? JSON.parse(raw)
          : [];

        const current = Array.isArray(parsed)
          ? parsed
          : [];

        const alreadySaved = current.some(
          (item) => favoriteMatches(item, event)
        );

        const next = alreadySaved
          ? current.filter(
              (item) => !favoriteMatches(item, event)
            )
          : [...current, event];

        await AsyncStorage.setItem(
          FAVORITES_KEY,
          JSON.stringify(next)
        );
      });

    mutationQueue.current = operation.catch(
      (err) => {
        console.error(
          '[Community] Favorite save error:',
          err
        );

        Alert.alert(
          'Could not save event',
          'Please try again.'
        );

        loadFavorites();
      }
    );
  }, [loadFavorites]);

  // ==========================================================
  // REFRESH
  // ==========================================================

  const refreshEvents = useCallback(() => {
    setRefreshing(true);
    fetchEvents(true);
  }, [fetchEvents]);

  const savedKeys = useMemo(
    () => new Set(favorites.map(eventKey)),
    [favorites]
  );

  // ==========================================================
  // EMPTY STATE
  // ==========================================================

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
          />

          <Text style={styles.emptyDescription}>
            Finding events across the city...
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
            (
              appliedKeyword
                ? `No matching events found for "${appliedKeyword}" in ${city}. Try another keyword or category.`
                : 'Try another city, category or search term.'
            )}
        </Text>

        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            if (appliedKeyword && !error) {
              setAppliedKeyword('');
              setSearchText('');
            } else {
              fetchEvents();
            }
          }}
        >
          <Text style={styles.retryText}>
            {appliedKeyword && !error
              ? 'Clear search'
              : 'Try again'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ==========================================================
  // MAIN SCREEN
  // ==========================================================

  return (
    <View style={styles.container}>
      <FlatList
        data={loading ? [] : events}
        keyExtractor={(item) => eventKey(item)}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            isFavorite={
              savedKeys.has(eventKey(item)) ||
              favorites.some(
                (favorite) =>
                  favoriteMatches(favorite, item)
              )
            }
            onPress={() =>
              navigation.navigate('EventDetail', {
                event: item,
              })
            }
            onFavorite={() =>
              toggleFavorite(item)
            }
          />
        )}

        ListHeaderComponent={
          <ExploreHeader
            city={city}
            searchText={searchText}
            setSearchText={setSearchText}
            searchMode={searchMode}
            onChangeSearchMode={changeSearchMode}
            onSearch={search}
            onClearSearch={clearSearch}
            onUseMyLocation={useMyLocation}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            loading={loading}
            resultCount={events.length}
            searchInputRef={searchInputRef}
            searchRadius={searchRadius}
            isPartial={isPartial}
            appliedKeyword={appliedKeyword}
          />
        }

        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 110,
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

// ============================================================
// STYLES
// ============================================================

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
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 20,
  },

  cityText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },

  radiusBadge: {
    backgroundColor: '#261A35',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginLeft: 5,
  },

  radiusText: {
    color: '#D8B4FE',
    fontSize: 10,
    fontWeight: '700',
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

  partialText: {
    color: '#D8B4FE',
    fontSize: 12,
    marginTop: 7,
    lineHeight: 18,
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

  performanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },

  performanceText: {
    color: '#C99BFF',
    fontSize: 12,
    fontWeight: '600',
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
