import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ImageBackground, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import bgImage from '../assets/pexels-apasaric-2078008.jpg';

export default function FavoritesScreen({ navigation }) {
  const [favorites, setFavorites] = useState([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isFocused = useIsFocused();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (isFocused) {
      loadFavorites();
    }
  }, [isFocused]);

  const loadFavorites = async () => {
    try {
      const favs = await AsyncStorage.getItem('favorites');
      if (favs) setFavorites(JSON.parse(favs));
      else setFavorites([]);
    } catch (error) {
      console.log(error);
    }
  };

  const removeFavorite = async (event) => {
    const updatedFavs = favorites.filter(fav => fav.id !== event.id);
    setFavorites(updatedFavs);
    await AsyncStorage.setItem('favorites', JSON.stringify(updatedFavs));
  };

  const EventCard = ({ event }) => (
    <BlurView intensity={80} tint="dark" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{event.title}</Text>
        <TouchableOpacity onPress={() => removeFavorite(event)}>
          <Ionicons name="heart" size={24} color="#ff4d6d" />
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

  return (
    <ImageBackground source={bgImage} style={styles.container} resizeMode="cover">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>My Favorites</Text>
        </View>

        {favorites.length === 0 ? (
          <Text style={styles.emptyText}>You have no favorite events yet.</Text>
        ) : (
          <FlatList
            data={favorites}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
  },
  header: {
    marginTop: 120, // Added spacing from top/back arrow
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#ccc',
    fontSize: 18,
    marginTop: 40,
    textAlign: 'center',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 15,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 10,
  },
  detailsButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#00d4ff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  detailsText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
