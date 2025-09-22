import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ImageBackground,
  TextInput,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import bgImage from '../assets/pexels-apasaric-2078008.jpg';

export default function EventsScreen({ navigation }) {
  const [searchResults, setSearchResults] = useState([]);
  const [nearbyEvents, setNearbyEvents] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const TICKETMASTER_API_KEY = '9AhAHDIpubrVsyrOEKlXsvGYkpLEo5rL';

  useFocusEffect(
    useCallback(() => {
      const loadFavorites = async () => {
        const favs = await AsyncStorage.getItem('favorites');
        setFavorites(favs ? JSON.parse(favs) : []);
      };
      loadFavorites();
    }, [])
  );

  // Format date + time
  const formatDateTime = (dateStr, timeStr) => {
    if (!dateStr) return 'Unknown Date';
    let time = timeStr || '';
    if (time.endsWith(':00')) time = time.slice(0, -3);
    return time ? `${dateStr} ${time}` : dateStr;
  };

  const fetchEvents = async (city = null, lat = null, long = null) => {
    setLoading(true);
    try {
      let url = '';
      if (city) {
        url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&city=${encodeURIComponent(city)}&size=20`;
      } else if (lat && long) {
        url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&latlong=${lat},${long}&radius=50&unit=km&size=20`;
      } else {
        // Default worldwide events
        url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&size=20`;
      }

      const response = await fetch(url);
      const data = await response.json();
      const fetchedEvents = data._embedded?.events || [];

      const formattedEvents = fetchedEvents.map((e) => {
        const date = e.dates?.start?.localDate || '';
        let time = e.dates?.start?.localTime || '';
        if (time.endsWith(':00')) time = time.slice(0, -3);
        return {
          id: e.id,
          title: e.name,
          date: time ? `${date} ${time}` : date,
          location: e._embedded?.venues?.[0]?.name || 'Unknown Venue',
          image: e.images?.[0]?.url || null,
        };
      });

      if (city) {
        setSearchResults(formattedEvents);
      } else {
        setNearbyEvents(formattedEvents);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
      if (city) setSearchResults([]);
      else setNearbyEvents([]);
    } finally {
      setLoading(false);
      setSearchLoading(false);
      setRefreshing(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }
  };

  const fetchSearchEvents = async (city) => {
    if (!city.trim()) {
      setSearchResults([]);
      setSearchTriggered(true);
      return;
    }
    setSearchLoading(true);
    setSearchTriggered(true);
    try {
      await fetchEvents(city);
      // If no results, fallback to nearby events
      if (searchResults.length === 0) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          fetchEvents(null, location.coords.latitude, location.coords.longitude);
        } else {
          fetchEvents();
        }
      }
    } catch (err) {
      console.error('Error fetching search events:', err);
      setSearchResults([]);
      fetchEvents();
    }
  };

  // Load initial nearby events
  useEffect(() => {
    const loadInitialEvents = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          fetchEvents(null, location.coords.latitude, location.coords.longitude);
        } else {
          fetchEvents(); // Worldwide events
        }
      } catch {
        fetchEvents(); // Fallback
      }
    };
    loadInitialEvents();
  }, []);

  const toggleFavorite = async (event) => {
    let updatedFavorites = [...favorites];
    const exists = favorites.find((fav) => fav.id === event.id);
    if (exists) {
      updatedFavorites = updatedFavorites.filter((fav) => fav.id !== event.id);
    } else {
      updatedFavorites.push(event);
    }
    await AsyncStorage.setItem('favorites', JSON.stringify(updatedFavorites));
    setFavorites(updatedFavorites);
  };

  const EventCard = ({ event }) => {
    const isFavorite = favorites.some((fav) => fav.id === event.id);
    const heartScale = useRef(new Animated.Value(1)).current;

    const handleToggle = () => {
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 1.5, duration: 150, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      toggleFavorite(event);
    };

    return (
      <ImageBackground
        source={event.image ? { uri: event.image } : null}
        style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 15 }}
      >
        <BlurView intensity={80} tint="dark" style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{event.title}</Text>
            <TouchableOpacity onPress={handleToggle}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <Ionicons name="heart" size={28} color={isFavorite ? '#ff4d6d' : '#fff'} />
              </Animated.View>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardSubtitle}>{event.date} • {event.location}</Text>
          <TouchableOpacity style={styles.detailsButton} onPress={() => navigation.navigate('EventDetail', { event })}>
            <Text style={styles.detailsText}>See Details</Text>
          </TouchableOpacity>
        </BlurView>
      </ImageBackground>
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (searchTriggered && searchText.trim() !== '') {
      await fetchSearchEvents(searchText);
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        fetchEvents(null, location.coords.latitude, location.coords.longitude);
      } else {
        fetchEvents();
      }
    }
  };

  return (
    <ImageBackground source={bgImage} style={styles.container} resizeMode="cover">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Search Events</Text>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter city"
              placeholderTextColor="#aaa"
              value={searchText}
              onChangeText={setSearchText}
            />
            <TouchableOpacity onPress={() => fetchSearchEvents(searchText)}>
              <Ionicons name="search" size={24} color="#00d4ff" />
            </TouchableOpacity>
          </View>
        </View>

        {(loading || searchLoading) ? (
          <ActivityIndicator size="large" color="#00d4ff" style={{ marginTop: 50 }} />
        ) : (
          <View style={{ flex: 1 }}>
            {searchTriggered && searchResults.length > 0 && (
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>
                Events in {searchText.trim()}
              </Text>
            )}

            {searchTriggered && searchResults.length === 0 && nearbyEvents.length > 0 && (
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>
                Nearby Events
              </Text>
            )}

            <FlatList
              data={searchTriggered && searchResults.length > 0 ? searchResults : nearbyEvents}
              keyExtractor={(item, index) => item.id?.toString() || index.toString()}
              renderItem={({ item }) => <EventCard event={item} />}
              contentContainerStyle={{ paddingBottom: 120, paddingTop: 10 }}
              refreshing={refreshing}
              onRefresh={onRefresh}
              ListEmptyComponent={() => (
                <View style={{ marginTop: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18 }}>No events found</Text>
                </View>
              )}
            />
          </View>
        )}
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', padding: 20 },
  backButton: { marginTop: Platform.OS === 'ios' ? 60 : 40, marginLeft: 10 },
  header: { marginTop: 10, marginBottom: 20, alignItems: 'center', width: '100%' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center', letterSpacing: 1 },
  searchContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: 'center', marginTop: 15, width: '100%' },
  searchInput: { color: '#fff', flex: 1, height: 40, paddingHorizontal: 8 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.5)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', flex: 1, marginRight: 10 },
  cardSubtitle: { fontSize: 14, color: '#00d4ff', marginBottom: 12 },
  detailsButton: { alignSelf: 'flex-start', backgroundColor: '#00d4ff', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12 },
  detailsText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
