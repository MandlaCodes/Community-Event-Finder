
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';

import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  Pressable,
  Animated,
  Alert,
  Linking,
  Share,
  ActivityIndicator,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { apiImage } from '../lib/communityApi';

const C = {
  bg: '#0B0A10',
  panel: '#17161F',
  purple: '#A855F7',
  text: '#F7F7FA',
  muted: '#B6B3C0',
};

const FAVORITES_KEY = 'favorites';

const fallback = require('../assets/pexels-apasaric-2078008.jpg');

// Resolve images exactly like HomeScreen.
function getImageUrl(event) {
  if (!event) return null;

  const candidates = [
    event.image,
    event.imageUrl,
    event.image_url,
    event.images,
    event.thumbnail,
    event.photo,
    event._embedded?.attractions?.[0]?.images,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const url = apiImage(candidate);

      if (
        typeof url === 'string' &&
        /^https?:\/\//i.test(url)
      ) {
        return url;
      }
    } catch (error) {
      console.warn(
        '[Community] EventDetail image error:',
        error?.message
      );
    }
  }

  return null;
}

function dateOf(event) {
  return (
    event?.rawDate ||
    event?.dates?.start?.localDate ||
    event?.date ||
    null
  );
}

function timeOf(event) {
  return (
    event?.rawTime ||
    event?.time ||
    event?.dates?.start?.localTime ||
    null
  );
}

function venueOf(event) {
  return (
    event?.location ||
    event?._embedded?.venues?.[0]?.name ||
    null
  );
}

function cityOf(event) {
  return (
    event?.city ||
    event?._embedded?.venues?.[0]?.city?.name ||
    null
  );
}

function priceOf(event) {
  const min =
    event?.priceMin ??
    event?.priceRanges?.[0]?.min;

  const max =
    event?.priceMax ??
    event?.priceRanges?.[0]?.max;

  const currency =
    event?.currency ||
    event?.priceRanges?.[0]?.currency ||
    '';

  if (min != null) {
    const formatPrice = (value) => {
      const amount = Number(value);

      if (!Number.isFinite(amount)) {
        return String(value);
      }

      return amount.toLocaleString('en-ZA', {
        maximumFractionDigits: 2,
      });
    };

    if (max != null && Number(max) > Number(min)) {
      return `${currency} ${formatPrice(min)} – ${formatPrice(max)}`.trim();
    }

    return `From ${currency} ${formatPrice(min)}`.trim();
  }

  return event?.price || null;
}

function readableDate(value) {
  if (!value) return 'Date to be confirmed';

  const match = String(value).match(
    /\d{4}-\d{2}-\d{2}/
  );

  if (!match) return String(value);

  const date = new Date(`${match[0]}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function readableTime(value) {
  if (!value) return null;

  const match = String(value).match(
    /^(\d{2}):(\d{2})/
  );

  if (!match) return String(value);

  const hours = Number(match[1]);
  const minutes = match[2];

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${minutes} ${period}`;
}

function getItemKey(item) {
  return `${item?.kind || 'event'}:${String(item?.id || '')}`;
}

function InfoLine({ icon, children }) {
  return (
    <View style={s.infoLine}>
      <Ionicons
        name={icon}
        color="#D6D1E2"
        size={21}
      />

      <Text style={s.infoText}>
        {children}
      </Text>
    </View>
  );
}

function EventHero({ event, insets, navigation, isFavorite, saving, toggleFavorite, share, scale }) {
  const imageUrl = getImageUrl(event);

  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
  }, [imageUrl]);

  useEffect(() => {
    if (__DEV__) {
      console.log('[Community] EventDetail artwork:', {
        title: event?.title || event?.name,
        originalImage: event?.image,
        resolvedUrl: imageUrl,
      });
    }
  }, [event?.title, event?.name, event?.image, imageUrl]);

  const showRemoteImage = !!imageUrl && !imageFailed;

  return (
    <View style={s.hero}>
      <Image
        source={
          showRemoteImage
            ? { uri: imageUrl }
            : fallback
        }
        style={s.heroImage}
        resizeMode="cover"
        onLoad={() => {
          setImageLoaded(true);
        }}
        onError={(error) => {
          if (showRemoteImage) {
            console.warn(
              '[Community] EventDetail image failed:',
              event?.title || event?.name,
              imageUrl,
              error?.nativeEvent?.error
            );

            setImageFailed(true);
            setImageLoaded(false);
          }
        }}
      />

      {showRemoteImage && !imageLoaded && (
        <View style={s.imageLoader}>
          <ActivityIndicator
            color={C.purple}
            size="large"
          />
        </View>
      )}

      <LinearGradient
        colors={[
          'rgba(8,7,13,0.55)',
          'rgba(8,7,13,0.02)',
          C.bg,
        ]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />

      <View
        style={[
          s.topActions,
          { top: insets.top + 10 },
        ]}
      >
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          style={s.circle}
          onPress={() => navigation.goBack()}
        >
          <Ionicons
            name="chevron-back"
            size={25}
            color="white"
          />
        </Pressable>

        <View style={s.topRightActions}>
          <Pressable
            accessibilityLabel={
              isFavorite
                ? 'Remove saved event'
                : 'Save event'
            }
            accessibilityRole="button"
            style={s.circle}
            disabled={saving}
            onPress={toggleFavorite}
          >
            <Animated.View
              style={{
                transform: [{ scale }],
              }}
            >
              <Ionicons
                name={
                  isFavorite
                    ? 'heart'
                    : 'heart-outline'
                }
                size={24}
                color={
                  isFavorite
                    ? '#FF75B0'
                    : 'white'
                }
              />
            </Animated.View>
          </Pressable>

          <Pressable
            accessibilityLabel="Share event"
            accessibilityRole="button"
            style={s.circle}
            onPress={share}
          >
            <Ionicons
              name="share-outline"
              size={22}
              color="white"
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function EventDetail({
  route,
  navigation,
}) {
  const event = route.params?.event || {};
  const insets = useSafeAreaInsets();

  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);

  const scale = useRef(
    new Animated.Value(1)
  ).current;

  const title =
    event.title ||
    event.name ||
    'Event details';

  const venueName = venueOf(event);
  const eventCity = cityOf(event);

  const venue = [
    venueName,
    eventCity &&
    eventCity.toLowerCase() !==
      String(venueName || '').toLowerCase()
      ? eventCity
      : null,
  ]
    .filter(Boolean)
    .join(', ') || 'Venue to be confirmed';

  const date = readableDate(dateOf(event));
  const time = readableTime(timeOf(event));
  const price = priceOf(event);

  const ticketUrl =
    event.url ||
    event.ticketUrl ||
    event.ticket_url ||
    null;

  const description =
    event.description ||
    event.info ||
    event.pleaseNote ||
    event.promoter?.description ||
    'More information about this event will be available from the organizer.';

  const category =
    event.genre ||
    event.classifications?.[0]?.genre?.name ||
    event.category ||
    'Event';

  const eventKey = getItemKey(event);

  // Refresh favorite status whenever this screen gains focus.
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadFavorite = async () => {
        try {
          const raw = await AsyncStorage.getItem(
            FAVORITES_KEY
          );

          const parsed = raw
            ? JSON.parse(raw)
            : [];

          const list = Array.isArray(parsed)
            ? parsed
            : [];

          const exists = list.some(
            (item) => getItemKey(item) === eventKey
          );

          if (active) {
            setIsFavorite(exists);
          }
        } catch (error) {
          console.warn(
            '[Community] Could not load saved events:',
            error
          );
        }
      };

      loadFavorite();

      return () => {
        active = false;
      };
    }, [eventKey])
  );

  const toggleFavorite = async () => {
    if (saving) return;

    setSaving(true);

    try {
      const raw = await AsyncStorage.getItem(
        FAVORITES_KEY
      );

      const parsed = raw
        ? JSON.parse(raw)
        : [];

      const list = Array.isArray(parsed)
        ? parsed
        : [];

      const exists = list.some(
        (item) => getItemKey(item) === eventKey
      );

      const updated = exists
        ? list.filter(
            (item) => getItemKey(item) !== eventKey
          )
        : [...list, event];

      await AsyncStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(updated)
      );

      setIsFavorite(!exists);

      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.22,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    } catch (error) {
      Alert.alert(
        'Could not save event',
        'Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const openTickets = async () => {
    if (!ticketUrl) return;

    try {
      const supported =
        await Linking.canOpenURL(ticketUrl);

      if (supported) {
        await Linking.openURL(ticketUrl);
      } else {
        Alert.alert(
          'Link unavailable',
          'The ticket link could not be opened.'
        );
      }
    } catch (error) {
      Alert.alert(
        'Link unavailable',
        'Please try again later.'
      );
    }
  };

  const share = async () => {
    try {
      await Share.share({
        message:
          `${title}` +
          (ticketUrl ? `\n${ticketUrl}` : ''),
      });
    } catch (error) {
      console.warn(
        '[Community] Could not share event:',
        error
      );
    }
  };

  return (
    <View style={s.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom:
            Math.max(insets.bottom, 20) + 35,
        }}
      >
        <EventHero
          event={event}
          insets={insets}
          navigation={navigation}
          isFavorite={isFavorite}
          saving={saving}
          toggleFavorite={toggleFavorite}
          share={share}
          scale={scale}
        />

        <View style={s.sheet}>
          <View style={s.handle} />

          <Text style={s.title}>
            {title}
          </Text>

          <View style={s.infoBlock}>
            <InfoLine icon="calendar-outline">
              {date}
              {time ? ` · ${time}` : ''}
            </InfoLine>

            <InfoLine icon="location-outline">
              {venue}
            </InfoLine>

            {price ? (
              <InfoLine icon="ticket-outline">
                {price}
              </InfoLine>
            ) : null}
          </View>

          <View style={s.actionRow}>
            <Pressable
              style={[
                s.ticketButton,
                !ticketUrl && s.disabled,
              ]}
              disabled={!ticketUrl}
              onPress={openTickets}
              accessibilityRole="button"
            >
              <Text style={s.ticketText}>
                {ticketUrl
                  ? 'Get Tickets'
                  : 'Tickets unavailable'}
              </Text>

              {ticketUrl ? (
                <Ionicons
                  name="open-outline"
                  color="white"
                  size={19}
                />
              ) : null}
            </Pressable>

            <Pressable
              style={s.bookmark}
              onPress={toggleFavorite}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={
                isFavorite
                  ? 'Remove bookmark'
                  : 'Bookmark event'
              }
            >
              <Ionicons
                name={
                  isFavorite
                    ? 'bookmark'
                    : 'bookmark-outline'
                }
                size={25}
                color={
                  isFavorite
                    ? C.purple
                    : C.text
                }
              />
            </Pressable>
          </View>

          <Text style={s.sectionTitle}>
            About
          </Text>

          <Text style={s.description}>
            {description}
          </Text>

          <View style={s.divider} />

          <Text style={s.sectionTitle}>
            Event Details
          </Text>

          <InfoLine icon="musical-notes-outline">
            {category}
          </InfoLine>

          {!!event.address && (
            <InfoLine icon="navigate-outline">
              {event.address}
            </InfoLine>
          )}

          {event.ageRestrictions?.legalAgeEnforced ? (
            <InfoLine icon="people-outline">
              Age restrictions may apply
            </InfoLine>
          ) : null}

          <View style={s.divider} />

          <Pressable
            style={s.moreButton}
            onPress={share}
          >
            <Ionicons
              name="share-social-outline"
              size={20}
              color={C.purple}
            />

            <Text style={s.moreText}>
              Share this event
            </Text>

            <Ionicons
              name="chevron-forward"
              size={18}
              color={C.muted}
            />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  hero: {
    height: 410,
    backgroundColor: '#241A30',
    overflow: 'hidden',
  },

  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },

  imageLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  topActions: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },

  topRightActions: {
    flexDirection: 'row',
    gap: 10,
  },

  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(30,27,40,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 33,
    borderTopRightRadius: 33,
    marginTop: -40,
    paddingHorizontal: 27,
    paddingTop: 12,
    minHeight: 520,
  },

  handle: {
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#595663',
    alignSelf: 'center',
    marginBottom: 30,
  },

  title: {
    color: C.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.1,
    lineHeight: 41,
    marginBottom: 24,
  },

  infoBlock: {
    gap: 16,
  },

  infoLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },

  infoText: {
    color: '#E6E3EC',
    fontSize: 15,
    lineHeight: 23,
    flex: 1,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 30,
    marginBottom: 36,
  },

  ticketButton: {
    flex: 1,
    backgroundColor: C.purple,
    borderRadius: 17,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },

  disabled: {
    backgroundColor: '#393441',
  },

  ticketText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },

  bookmark: {
    width: 57,
    height: 56,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#393541',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22202A',
  },

  sectionTitle: {
    color: C.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginBottom: 16,
  },

  description: {
    color: '#C8C4D0',
    fontSize: 15,
    lineHeight: 24,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#3A3743',
    marginVertical: 30,
  },

  moreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 8,
  },

  moreText: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
