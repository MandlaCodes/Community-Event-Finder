import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ImageBackground,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import bgImage from '../assets/pexels-apasaric-2078008.jpg';

export default function EventsScreen({ navigation }) {
  const [events, setEvents] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const EVENTBRITE_TOKEN = 'UTNNU4G2UEU6URNF2BBP'; // Your token

  // Load favorites every time screen is focused
  useFocusEffect(
    useCallback(() => {
      const loadFavorites = async () => {
        const favs = await AsyncStorage.getItem('favorites');
        setFavorites(favs ? JSON.parse(favs) : []);
      };
      loadFavorites();
    }, [])
  );

  // Fetch nearby events using coordinates
  const fetchEvents = async () => {
    setLoading(true);
    try {
      // Ask for location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        setLoading(false);
        return;
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      // Fetch from Eventbrite
      const response = await fetch(
        `https://www.eventbriteapi.com/v3/events/search/?location.latitude=${latitude}&location.longitude=${longitude}&token=${EVENTBRITE_TOKEN}&sort_by=date`
      );
      const data = await response.json();

      if (!data.events) {
        console.error('No events found or invalid token.');
        setEvents([]);
        setLoading(false);
        return;
      }

      // Pick a random subset (max 10 events)
      const shuffled = data.events.sort(() => 0.5 - Math.random());
      const formattedEvents = shuffled.slice(0, 10).map(e => ({
        id: e.id,
        title: e.name?.text || 'Untitled Event',
        date: e.start?.local || 'Unknown Date',
        location: e.venue?.address?.localized_address_display || 'Unknown Location',
      }));

      setEvents(formattedEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // Toggle favorite
  const toggleFavorite = async (event) => {
    let updatedFavorites = [...favorites];
    const exists = favorites.find(fav => fav.id === event.id);

    if (exists) {
      updatedFavorites = updatedFavorites.filter(fav => fav.id !== event.id);
    } else {
      updatedFavorites.push(event);
    }

    await AsyncStorage.setItem('favorites', JSON.stringify(updatedFavorites));
    setFavorites(updatedFavorites);
  };

  // Event card
  const EventCard = ({ event }) => {
    const isFavorite = favorites.some(fav => fav.id === event.id);
    const heartScale = useRef(new Animated.Value(1)).current;

    const handleToggle = () => {
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 1.5, duration: 150, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
      toggleFavorite(event);
    };

    return (
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
        <TouchableOpacity
          style={styles.detailsButton}
          onPress={() => navigation.navigate('EventDetail', { event })}
        >
          <Text style={styles.detailsText}>See Details</Text>
        </TouchableOpacity>
      </BlurView>
    );
  };

  return (
    <ImageBackground source={bgImage} style={styles.container} resizeMode="cover">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>Nearby Events</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#00d4ff" style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <EventCard event={item} />}
            contentContainerStyle={{ paddingBottom: 30, paddingTop: 10 }}
          />
        )}
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
  },
  backButton: {
    marginTop: 50,
    marginLeft: 10,
  },
  header: {
    marginTop: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 1,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 1.5,
    borderColor: '#fff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginRight: 10,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#00d4ff',
    marginBottom: 12,
  },
  detailsButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#00d4ff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  detailsText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
