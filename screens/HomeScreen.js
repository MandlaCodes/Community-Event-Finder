import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Animated,
  ActivityIndicator
} from 'react-native';
import { BlurView } from 'expo-blur';
import bgImage from '../assets/pexels-apasaric-2078008.jpg';

export default function HomeScreen({ navigation }) {
  const [loading, setLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideDiscover = useRef(new Animated.Value(20)).current;
  const slideFavorites = useRef(new Animated.Value(20)).current;

  const scaleDiscover = useRef(new Animated.Value(1)).current;
  const scaleFavorites = useRef(new Animated.Value(1)).current;

  const opacityDiscover = useRef(new Animated.Value(1)).current;
  const opacityFavorites = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }).start();
      Animated.spring(slideDiscover, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(slideFavorites, { toValue: 0, useNativeDriver: true, delay: 100 }).start();
    }
  }, [loading]);

  const onPressIn = (scale, opacity) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.85, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const onPressOut = (scale, opacity) => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const Button = ({ onPress, text, borderColor, scale, opacity, slideY }) => (
    <Animated.View style={{ transform: [{ scale }, { translateY: slideY }], width: '75%', marginVertical: 10, opacity }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        onPressIn={() => onPressIn(scale, opacity)}
        onPressOut={() => onPressOut(scale, opacity)}
      >
        <BlurView intensity={80} tint="dark" style={[styles.button, { borderColor }]}>
          <Text style={styles.buttonText}>{text}</Text>
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  );

  if (loading) {
    return (
      <ImageBackground source={bgImage} style={styles.container} resizeMode="cover">
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#00d4ff" />
          <Text style={styles.loaderText}>Mandla's Event Finder...</Text>
        </View>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={bgImage} style={styles.container} resizeMode="cover">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Text style={styles.title}>Community Event Finder</Text>
        <Text style={styles.subtitle}>Discover free local events happening near you</Text>

        <Button
          onPress={() => navigation.navigate('Events')}
          text="Discover Events"
          borderColor="#00d4ff"
          scale={scaleDiscover}
          opacity={opacityDiscover}
          slideY={slideDiscover}
        />

        <Button
          onPress={() => navigation.navigate('Favorites')}
          text="View Favorites"
          borderColor="#28ff85"
          scale={scaleFavorites}
          opacity={opacityFavorites}
          slideY={slideFavorites}
        />
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 40,
    textAlign: 'center',
    lineHeight: 25,
    letterSpacing: 0.5,
  },
  loaderText: {
    color: '#fff',
    marginTop: 20,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 1,
  },
});
