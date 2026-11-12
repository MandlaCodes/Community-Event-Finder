
import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getEvents,
  getPlaces,
  askCommunity,
  apiImage,
} from '../lib/communityApi';

const C = {
  bg: '#09090E',
  card: '#191820',
  purple: '#A855F7',
  white: '#FAF8FF',
  muted: '#A6A0B0',
  border: '#302B39',
};

const CITY_KEY = '@community_selected_city';
const COUNTRY_KEY = '@community_selected_country';
const NAME_KEY = '@community_display_name';
const FAVORITES_KEY = 'favorites';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.76, 330);
const CACHE_MS = 5 * 60 * 1000;

// Enable when your backend has a working places provider.
const PLACES_ENABLED = false;

const moods = [
  {
    icon: 'wine-outline',
    title: 'Dinner dates',
    subtitle: 'Something romantic',
    query: 'Plan a romantic dinner date',
  },
  {
    icon: 'moon-outline',
    title: "Tonight's vibes",
    subtitle: 'Make tonight count',
    query: 'What should I do tonight?',
  },
  {
    icon: 'musical-notes-outline',
    title: 'Live music',
    subtitle: 'Feel the atmosphere',
    query: 'Find live music near me',
  },
  {
    icon: 'sparkles-outline',
    title: 'Surprise me',
    subtitle: 'Try something new',
    query: 'Surprise me with a fun experience',
  },
];

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';

  return 'Good evening';
}

function formatDate(item) {
  const raw = item?.rawDate || item?.date;

  if (!raw) return 'Date to be announced';

  const datePart = String(raw).match(
    /\d{4}-\d{2}-\d{2}/
  )?.[0];

  if (!datePart) return String(raw);

  const date = new Date(`${datePart}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(raw);
  }

  const formatted = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const time = item?.rawTime;

  if (!time) return formatted;

  const match = String(time).match(/^(\d{2}):(\d{2})/);

  if (!match) return formatted;

  const hours = Number(match[1]);
  const minutes = match[2];

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return `${formatted} · ${displayHour}:${minutes} ${period}`;
}

function normalizeImage(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    const images = value
      .map((entry) => {
        if (typeof entry === 'string') {
          return { url: entry, width: 0 };
        }

        return {
          url: entry?.url || entry?.uri || entry?.src,
          width: Number(entry?.width) || 0,
        };
      })
      .filter((entry) => entry.url);

    images.sort((a, b) => b.width - a.width);

    return normalizeImage(images[0]?.url);
  }

  if (typeof value === 'object') {
    return normalizeImage(
      value.url || value.uri || value.src
    );
  }

  if (typeof value !== 'string') return null;

  const url = value.trim();

  if (!/^https?:\/\//i.test(url)) return null;

  return url;
}

function getImageUrl(item) {
  const candidates = [
    item?.image,
    item?.imageUrl,
    item?.image_url,
    item?.images,
    item?.thumbnail,
    item?.photo,
  ];

  for (const candidate of candidates) {
    const direct = normalizeImage(candidate);

    if (direct) return direct;

    try {
      const transformed = apiImage(candidate);
      const normalized = normalizeImage(transformed);

      if (normalized) return normalized;
    } catch {
      // Try the next image source.
    }
  }

  return null;
}

function groupEvents(items) {
  const grouped = new Map();

  for (const item of items || []) {
    if (!item?.id || !item?.title) continue;

    const title = String(item.title)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    const venue = String(item.location || item.city || '')
      .trim()
      .toLowerCase();

    const key = `${title}|${venue}`;

    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...item,
        kind: 'event',
        performanceCount: 1,
      });

      continue;
    }

    existing.performanceCount += 1;

    const currentDate = String(
      item.rawDate || item.date || ''
    );

    const existingDate = String(
      existing.rawDate || existing.date || ''
    );

    if (
      currentDate &&
      (!existingDate || currentDate < existingDate)
    ) {
      const count = existing.performanceCount;

      grouped.set(key, {
        ...item,
        kind: 'event',
        performanceCount: count,
      });
    } else if (!getImageUrl(existing) && getImageUrl(item)) {
      existing.image = item.image;
      existing.images = item.images;
    }
  }

  return [...grouped.values()].sort((a, b) => {
    const dateA = String(a.rawDate || a.date || '');
    const dateB = String(b.rawDate || b.date || '');

    return dateA.localeCompare(dateB);
  });
}

function EventArtwork({ item, style }) {
  const imageUrl = getImageUrl(item);

  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [imageUrl]);

  return (
    <View style={[styles.artwork, style]}>
      <LinearGradient
        colors={['#30223F', '#18131F', '#101016']}
        style={StyleSheet.absoluteFillObject}
      />

      {imageUrl && !failed ? (
        <>
          {!loaded && (
            <ActivityIndicator
              color={C.purple}
              style={styles.imageLoader}
            />
          )}

          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <View style={styles.imageFallback}>
          <Ionicons
            name="ticket-outline"
            size={42}
            color="#7C638E"
          />

          <Text style={styles.fallbackText}>
            Discover something unforgettable
          </Text>
        </View>
      )}

      <LinearGradient
        colors={[
          'rgba(9,9,14,0.08)',
          'rgba(9,9,14,0.12)',
          'rgba(9,9,14,0.92)',
        ]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

function ExperienceCard({
  item,
  saved,
  onSave,
  onOpen,
  featured = false,
}) {
  return (
    <Pressable
      onPress={onOpen}
      style={[
        styles.eventCard,
        featured && styles.featuredCard,
      ]}
    >
      <EventArtwork
        item={item}
        style={
          featured
            ? styles.featuredArtwork
            : styles.standardArtwork
        }
      />

      <View style={styles.categoryPill}>
        <Ionicons
          name={
            item.kind === 'place'
              ? 'location-outline'
              : 'ticket-outline'
          }
          size={12}
          color="white"
        />

        <Text style={styles.categoryText}>
          {item.kind === 'place'
            ? 'EXPERIENCE'
            : 'LIVE EVENT'}
        </Text>
      </View>

      <Pressable
        style={styles.saveButton}
        onPress={onSave}
        hitSlop={10}
      >
        <Ionicons
          name={saved ? 'heart' : 'heart-outline'}
          size={22}
          color={saved ? '#FF6A91' : 'white'}
        />
      </Pressable>

      <View style={styles.eventOverlay}>
        <View style={styles.dateRow}>
          <Ionicons
            name="calendar-outline"
            size={13}
            color="#E6C7FF"
          />

          <Text style={styles.eventDate}>
            {item.kind === 'place'
              ? item.category || 'Explore'
              : formatDate(item)}
          </Text>
        </View>

        <Text
          style={[
            styles.eventTitle,
            featured && styles.featuredTitle,
          ]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        <View style={styles.venueRow}>
          <Ionicons
            name="location-outline"
            size={13}
            color="#DDD4E6"
          />

          <Text
            style={styles.eventVenue}
            numberOfLines={1}
          >
            {item.location ||
              item.city ||
              'Location to be announced'}
          </Text>
        </View>

        {item.performanceCount > 1 && (
          <Text style={styles.performancesText}>
            {item.performanceCount} performances listed
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function SectionHeading({ title, subtitle, onSeeAll }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>

        {!!subtitle && (
          <Text style={styles.sectionSubtitle}>
            {subtitle}
          </Text>
        )}
      </View>

      {onSeeAll && (
        <Pressable
          onPress={onSeeAll}
          style={styles.seeAllButton}
        >
          <Text style={styles.seeAll}>See all</Text>

          <Ionicons
            name="arrow-forward"
            size={14}
            color="#D0A0FF"
          />
        </Pressable>
      )}
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [city, setCity] = useState('Johannesburg');
  const [country, setCountry] = useState('');
  const [name, setName] = useState('there');

  const [events, setEvents] = useState([]);
  const [places, setPlaces] = useState([]);
  const [saved, setSaved] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);

  const [editingCity, setEditingCity] = useState(false);
  const [cityDraft, setCityDraft] = useState('');

  const cache = useRef({
    key: null,
    timestamp: 0,
    events: [],
    places: [],
  });

  const requestId = useRef(0);
  const savedRef = useRef([]);

  const groupedEvents = useMemo(
    () => groupEvents(events),
    [events]
  );

  const candidates = useMemo(
    () => [
      ...groupedEvents.slice(0, 16),
      ...places.slice(0, 10),
    ],
    [groupedEvents, places]
  );

  const updateSaved = useCallback((items) => {
    savedRef.current = items;
    setSaved(items);
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      const currentRequest = ++requestId.current;

      if (isRefresh) {
        setRefreshing(true);
      }

      try {
        const [
          savedCity,
          savedCountry,
          savedName,
          favorites,
        ] = await Promise.all([
          AsyncStorage.getItem(CITY_KEY),
          AsyncStorage.getItem(COUNTRY_KEY),
          AsyncStorage.getItem(NAME_KEY),
          AsyncStorage.getItem(FAVORITES_KEY),
        ]);

        if (currentRequest !== requestId.current) return;

        const targetCity = savedCity?.trim() || 'Johannesburg';
        const targetCountry = savedCountry?.trim() || '';

        setCity(targetCity);
        setCountry(targetCountry);
        setName(savedName?.trim() || 'there');

        try {
          const parsed = JSON.parse(favorites || '[]');

          updateSaved(Array.isArray(parsed) ? parsed : []);
        } catch {
          updateSaved([]);
        }

        const key = `${targetCity}|${targetCountry}`;

        const validCache =
          !isRefresh &&
          cache.current.key === key &&
          Date.now() - cache.current.timestamp < CACHE_MS;

        if (validCache) {
          setEvents(cache.current.events);
          setPlaces(cache.current.places);
          setError('');
          setLoading(false);
          return;
        }

        if (!isRefresh) setLoading(true);

        setError('');

        const results = await Promise.allSettled([
          getEvents({
            city: targetCity,
            country: targetCountry,
            pages: 3,
          }),
          ...(PLACES_ENABLED
            ? [
                getPlaces({
                  city: targetCity,
                  country: targetCountry,
                  category: 'restaurants',
                }),
                getPlaces({
                  city: targetCity,
                  country: targetCountry,
                  category: 'activities',
                }),
              ]
            : []),
        ]);

        if (currentRequest !== requestId.current) return;

        const eventResult = results[0];

        const nextEvents =
          eventResult.status === 'fulfilled'
            ? eventResult.value?.items || []
            : [];

        const nextPlaces = [];

        if (PLACES_ENABLED) {
          for (const result of results.slice(1)) {
            if (result.status === 'fulfilled') {
              nextPlaces.push(...(result.value?.items || []));
            }
          }
        }

        const uniquePlaces = [
          ...new Map(
            nextPlaces.map((place) => [
              String(place.id),
              place,
            ])
          ).values(),
        ];

        setEvents(nextEvents);
        setPlaces(uniquePlaces);

        if (eventResult.status === 'rejected') {
          setError(
            'Live events are temporarily unavailable. Pull down to retry.'
          );
        } else {
          cache.current = {
            key,
            timestamp: Date.now(),
            events: nextEvents,
            places: uniquePlaces,
          };
        }
      } catch (err) {
        if (currentRequest === requestId.current) {
          setError(
            err?.message ||
              'Unable to load experiences right now.'
          );
        }
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [updateSaved]
  );

  useFocusEffect(
    useCallback(() => {
      load();

      return () => {
        requestId.current += 1;
      };
    }, [load])
  );

  const toggleSaved = useCallback(
    async (item) => {
      const previous = savedRef.current;

      const exists = previous.some(
        (entry) => String(entry.id) === String(item.id)
      );

      const next = exists
        ? previous.filter(
            (entry) =>
              String(entry.id) !== String(item.id)
          )
        : [...previous, item];

      updateSaved(next);

      try {
        await AsyncStorage.setItem(
          FAVORITES_KEY,
          JSON.stringify(next)
        );
      } catch {
        updateSaved(previous);

        Alert.alert(
          'Could not save',
          'Please try again.'
        );
      }
    },
    [updateSaved]
  );

  const ask = useCallback(
    async (prompt) => {
      const text = String(prompt || message).trim();

      if (!text || asking) return;

      setMessage(text);
      setAsking(true);
      setAnswer('');

      try {
        const result = await askCommunity({
          message: text,
          city,
          country,
          candidates,
        });

        setAnswer(
          result?.answer ||
            'I could not find a recommendation right now.'
        );
      } catch (err) {
        setAnswer(
          err?.message ||
            'Community AI is temporarily unavailable.'
        );
      } finally {
        setAsking(false);
      }
    },
    [message, asking, city, country, candidates]
  );

  const saveCity = useCallback(async () => {
    const next = cityDraft.trim();

    if (!next) return;

    try {
      await AsyncStorage.multiSet([
        [CITY_KEY, next],
        [COUNTRY_KEY, ''],
      ]);

      setCity(next);
      setEditingCity(false);
      setAnswer('');

      cache.current.timestamp = 0;

      load(true);
    } catch {
      Alert.alert(
        'Unable to update city',
        'Please try again.'
      );
    }
  }, [cityDraft, load]);

  const openEvent = useCallback(
    (item) => {
      navigation.navigate('EventDetail', {
        event: item,
      });
    },
    [navigation]
  );

  const renderSection = (
    title,
    subtitle,
    items,
    featured = false
  ) => {
    if (!items.length) return null;

    return (
      <View style={styles.section}>
        <SectionHeading
          title={title}
          subtitle={subtitle}
          onSeeAll={() => navigation.navigate('Events')}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalContent}
        >
          {items.slice(0, 12).map((item) => (
            <View
              key={`${item.kind}-${item.id}`}
              style={{
                width: featured
                  ? CARD_WIDTH + 16
                  : CARD_WIDTH,
              }}
            >
              <ExperienceCard
                item={item}
                featured={featured}
                saved={saved.some(
                  (entry) =>
                    String(entry.id) === String(item.id)
                )}
                onSave={() => toggleSaved(item)}
                onOpen={() => openEvent(item)}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  };

  const dinnerPlaces = places.filter((item) =>
    /restaurant|dining|food/i.test(
      String(item.category || '')
    )
  );

  const otherPlaces = places.filter(
    (item) =>
      !dinnerPlaces.some(
        (place) => String(place.id) === String(item.id)
      )
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 14,
        paddingBottom: 45,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={C.purple}
        />
      }
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            setCityDraft(city);
            setEditingCity(!editingCity);
          }}
          style={styles.locationButton}
        >
          <Text style={styles.overline}>
            DISCOVERING IN
          </Text>

          <View style={styles.locationRow}>
            <Ionicons
              name="location"
              size={17}
              color={C.purple}
            />

            <Text
              style={styles.city}
              numberOfLines={1}
            >
              {city}
              {country ? `, ${country}` : ''}
            </Text>

            <Ionicons
              name="chevron-down"
              size={14}
              color={C.muted}
            />
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Profile')}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>
            {name === 'there'
              ? 'C'
              : name.charAt(0).toUpperCase()}
          </Text>
        </Pressable>
      </View>

      {editingCity && (
        <View style={styles.cityEditor}>
          <TextInput
            style={styles.cityInput}
            placeholder="Enter a city, e.g. Tokyo"
            placeholderTextColor={C.muted}
            value={cityDraft}
            onChangeText={setCityDraft}
            onSubmitEditing={saveCity}
            autoCapitalize="words"
            returnKeyType="done"
          />

          <Pressable onPress={saveCity}>
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.intro}>
        <Text style={styles.hello}>
          {getGreeting()}, {name}.
        </Text>

        <Text style={styles.headline}>
          Your city.{'\n'}
          <Text style={styles.headlineAccent}>
            Your next story.
          </Text>
        </Text>

        <Text style={styles.introSub}>
          Great experiences are closer than you think.
        </Text>
      </View>

      <View style={styles.aiBox}>
        <LinearGradient
          colors={['#2B1C3D', '#1C1726']}
          style={styles.aiGradient}
        >
          <View style={styles.aiTopRow}>
            <View style={styles.aiIcon}>
              <Ionicons
                name="sparkles"
                color="#E9D5FF"
                size={19}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.aiEyebrow}>
                YOUR PERSONAL CITY GUIDE
              </Text>

              <Text style={styles.aiTitle}>
                Ask Community AI
              </Text>
            </View>

            <View style={styles.aiStatus}>
              <View style={styles.aiStatusDot} />
              <Text style={styles.aiStatusText}>
                AI
              </Text>
            </View>
          </View>

          <Text style={styles.aiDescription}>
            Tell me your mood, budget or who you're
            going with. I'll help you find a plan.
          </Text>

          <View style={styles.aiInputContainer}>
            <TextInput
              style={styles.aiInput}
              value={message}
              onChangeText={setMessage}
              placeholder="A fun date night this weekend..."
              placeholderTextColor="#9F95AC"
              multiline
            />

            <Pressable
              style={[
                styles.aiSend,
                asking && { opacity: 0.6 },
              ]}
              disabled={asking}
              onPress={() => ask()}
            >
              {asking ? (
                <ActivityIndicator color="white" />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={21}
                  color="white"
                />
              )}
            </Pressable>
          </View>

          {!!answer && (
            <View style={styles.aiAnswerBox}>
              <Text style={styles.aiAnswer}>
                {answer}
              </Text>
            </View>
          )}
        </LinearGradient>
      </View>

      <View style={styles.moods}>
        {moods.map((mood) => (
          <Pressable
            key={mood.title}
            style={styles.mood}
            onPress={() => ask(mood.query)}
          >
            <View style={styles.moodIcon}>
              <Ionicons
                name={mood.icon}
                size={21}
                color="#D8B4FE"
              />
            </View>

            <Text style={styles.moodTitle}>
              {mood.title}
            </Text>

            <Text style={styles.moodSubtitle}>
              {mood.subtitle}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && !events.length ? (
        <View style={styles.loading}>
          <ActivityIndicator
            color={C.purple}
            size="large"
          />

          <Text style={styles.loadingText}>
            Finding the best of {city}...
          </Text>
        </View>
      ) : (
        <>
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color="#FFB4B4"
              />

              <Text style={styles.errorText}>
                {error}
              </Text>
            </View>
          )}

          {groupedEvents.length > 0 && (
            <>
              {renderSection(
                'Happening soon',
                'The moments worth going out for',
                groupedEvents.slice(0, 12),
                true
              )}

              {renderSection(
                'More to discover',
                'Your next favourite experience',
                groupedEvents.slice(12)
              )}
            </>
          )}

          {dinnerPlaces.length > 0 &&
            renderSection(
              'Dinner date ideas',
              'Good food, great company',
              dinnerPlaces
            )}

          {otherPlaces.length > 0 &&
            renderSection(
              'Explore your city',
              'Go somewhere new',
              otherPlaces
            )}

          {!groupedEvents.length &&
            !places.length && (
              <View style={styles.emptyState}>
                <Ionicons
                  name="compass-outline"
                  size={38}
                  color={C.purple}
                />

                <Text style={styles.emptyTitle}>
                  Nothing to show just yet
                </Text>

                <Text style={styles.emptyDescription}>
                  Try another city or pull down to
                  refresh live experiences.
                </Text>
              </View>
            )}
        </>
      )}

      <View style={styles.footer}>
        <Ionicons
          name="sparkles-outline"
          size={17}
          color={C.purple}
        />

        <Text style={styles.footerText}>
          More experiences. More memories.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  header: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  locationButton: {
    flex: 1,
    marginRight: 15,
  },

  overline: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: C.muted,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
  },

  city: {
    color: C.white,
    fontSize: 16,
    fontWeight: '800',
    maxWidth: '75%',
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#42235B',
    borderWidth: 1,
    borderColor: '#8D52B7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: 'white',
    fontSize: 19,
    fontWeight: '900',
  },

  cityEditor: {
    marginHorizontal: 22,
    marginTop: 16,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  cityInput: {
    color: 'white',
    height: 52,
    flex: 1,
  },

  applyText: {
    color: '#D0A0FF',
    fontWeight: '800',
  },

  intro: {
    paddingHorizontal: 22,
    marginTop: 34,
    marginBottom: 27,
  },

  hello: {
    color: '#D2C9DD',
    fontSize: 15,
    fontWeight: '600',
  },

  headline: {
    color: C.white,
    fontSize: 39,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: -1.6,
    marginTop: 10,
  },

  headlineAccent: {
    color: '#C084FC',
  },

  introSub: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },

  aiBox: {
    marginHorizontal: 22,
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#50345F',
  },

  aiGradient: {
    padding: 19,
  },

  aiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  aiIcon: {
    width: 41,
    height: 41,
    borderRadius: 14,
    backgroundColor: '#563574',
    alignItems: 'center',
    justifyContent: 'center',
  },

  aiEyebrow: {
    color: '#CBA9E6',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  aiTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 3,
  },

  aiStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#39264B',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },

  aiStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C084FC',
  },

  aiStatusText: {
    color: '#E9D5FF',
    fontSize: 11,
    fontWeight: '800',
  },

  aiDescription: {
    color: '#CFC3DA',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 17,
    marginBottom: 16,
  },

  aiInputContainer: {
    backgroundColor: '#110F18',
    borderWidth: 1,
    borderColor: '#4A3A56',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },

  aiInput: {
    color: 'white',
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    fontSize: 14,
    paddingTop: 10,
    paddingBottom: 8,
    textAlignVertical: 'top',
  },

  aiSend: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },

  aiAnswerBox: {
    marginTop: 16,
    backgroundColor: 'rgba(10,8,16,0.45)',
    borderRadius: 15,
    padding: 15,
  },

  aiAnswer: {
    color: '#EDE5F4',
    fontSize: 14,
    lineHeight: 22,
  },

  moods: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 11,
    marginTop: 22,
    marginBottom: 34,
  },

  mood: {
    width: '48%',
    minHeight: 116,
    backgroundColor: C.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
  },

  moodIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#30213F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },

  moodTitle: {
    color: C.white,
    fontSize: 13,
    fontWeight: '800',
  },

  moodSubtitle: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },

  section: {
    marginBottom: 33,
  },

  sectionHeading: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 17,
    gap: 12,
  },

  sectionTitle: {
    color: C.white,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.7,
  },

  sectionSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 5,
  },

  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  seeAll: {
    color: '#D0A0FF',
    fontSize: 13,
    fontWeight: '800',
  },

  horizontalContent: {
    paddingHorizontal: 22,
    gap: 14,
  },

  eventCard: {
    height: 345,
    backgroundColor: C.card,
    borderRadius: 23,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },

  featuredCard: {
    height: 390,
  },

  artwork: {
    ...StyleSheet.absoluteFillObject,
  },

  standardArtwork: {
    height: 345,
  },

  featuredArtwork: {
    height: 390,
  },

  imageLoader: {
    ...StyleSheet.absoluteFillObject,
    alignSelf: 'center',
    top: '40%',
  },

  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
  },

  fallbackText: {
    color: '#A58DB7',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },

  categoryPill: {
    position: 'absolute',
    top: 15,
    left: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(12,10,17,0.75)',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },

  categoryText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  saveButton: {
    position: 'absolute',
    top: 13,
    right: 13,
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: 'rgba(12,10,17,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  eventOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 18,
  },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 9,
  },

  eventDate: {
    color: '#E9D5FF',
    fontSize: 12,
    fontWeight: '800',
  },

  eventTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 25,
  },

  featuredTitle: {
    fontSize: 24,
    lineHeight: 29,
  },

  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },

  eventVenue: {
    color: '#DDD4E6',
    fontSize: 12,
    flex: 1,
  },

  performancesText: {
    color: '#C9B2D8',
    fontSize: 11,
    marginTop: 9,
  },

  loading: {
    alignItems: 'center',
    paddingVertical: 65,
    gap: 17,
  },

  loadingText: {
    color: C.muted,
    fontSize: 13,
  },

  errorBox: {
    marginHorizontal: 22,
    marginBottom: 22,
    backgroundColor: '#2C1924',
    borderRadius: 14,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  errorText: {
    color: '#FFB4B4',
    fontSize: 12,
    flex: 1,
  },

  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 35,
    paddingVertical: 55,
  },

  emptyTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 17,
  },

  emptyDescription: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 9,
  },

  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
  },

  footerText: {
    color: C.muted,
    fontSize: 12,
  },
});
