import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import bgImage from '../assets/pexels-apasaric-2078008.jpg';

export default function SplashScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('Home'); // after 3 seconds go to Home
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <ImageBackground source={bgImage} style={styles.container} resizeMode="cover">
      <View style={styles.overlay}>
        <Text style={styles.loadingText}>Find an event in your area now</Text>
      </View>
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
  loadingText: {
    color: '#00d4ff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
