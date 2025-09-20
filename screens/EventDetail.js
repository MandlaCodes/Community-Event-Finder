import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Animated,
  ScrollView
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import bgImage from '../assets/pexels-apasaric-2078008.jpg';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function EventDetail({ route, navigation }) {
  const { event } = route.params;
  const [isFavorite, setIsFavorite] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  // Check if the event is in favorites when screen loads
  useEffect(() => {
    const checkFavorite = async () => {
      const favs = await AsyncStorage.getItem('favorites');
      const favArray = favs ? JSON.parse(favs) : [];
      setIsFavorite(favArray.some(fav => fav.id === event.id));
    };
    checkFavorite();
  }, [event.id]);

  const toggleFavorite = async () => {
    const favs = await AsyncStorage.getItem('favorites');
    let favArray = favs ? JSON.parse(favs) : [];

    if (isFavorite) {
      // Remove from favorites
      favArray = favArray.filter(fav => fav.id !== event.id);
      setIsFavorite(false);
    } else {
      // Add to favorites
      favArray.push(event);
      setIsFavorite(true);

      // Heart pop animation
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 1.5, duration: 150, useNativeDriver: true }),
        Animated.timing(heartScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }

    await AsyncStorage.setItem('favorites', JSON.stringify(favArray));
  };

  return (
    <ImageBackground source={bgImage} style={styles.container} resizeMode="cover">
      <View style={styles.overlay}>
        {/* Back Button */}
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.subtitle}>{event.date} • {event.location}</Text>
          <Text style={styles.description}>{event.description}</Text>

          {/* Add/Remove Favorite Button */}
          <TouchableOpacity onPress={toggleFavorite} activeOpacity={0.8}>
            <Animated.View style={[styles.favoriteButton, { transform: [{ scale: heartScale }] }]}>
              <Ionicons
                name="heart"
                size={28}
                color={isFavorite ? '#ff4d6d' : '#fff'}
              />
              <Text style={styles.favoriteText}>
                {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </Text>
            </Animated.View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingTop: 50,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
  },
  content: {
    paddingTop: 80,
    paddingBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#00d4ff',
    marginBottom: 20,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  favoriteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  favoriteText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
  },
});
