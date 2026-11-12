
import React, { useEffect, useRef } from 'react';

import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Animated,
  Easing,
  ActivityIndicator,
  StatusBar,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const bgImage = require('../assets/pexels-apasaric-2078008.jpg');

const COLORS = {
  background: '#09090E',
  purple: '#A855F7',
  white: '#FFFFFF',
  muted: '#B8B5C2',
};

const ONBOARDING_KEY = '@community_onboarding_v2';

export default function SplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    let timeoutId;

    const entrance = Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 850,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 850,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),
    ]);

    entrance.start();

    async function initializeApp() {
      let destination = 'Welcome';

      try {
        const completed = await AsyncStorage.getItem(
          ONBOARDING_KEY
        );

        if (completed === 'true') {
          destination = 'Home';
        }
      } catch (error) {
        console.warn(
          'Unable to restore onboarding status:',
          error
        );
      }

      timeoutId = setTimeout(() => {
        if (!mounted.current) return;

        navigation.replace(destination);
      }, 1800);
    }

    initializeApp();

    return () => {
      mounted.current = false;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      entrance.stop();
    };
  }, [navigation, fadeAnim, slideAnim, scaleAnim]);

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={COLORS.background}
      />

      <ImageBackground
        source={bgImage}
        style={styles.background}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            'rgba(9,9,14,0.55)',
            'rgba(9,9,14,0.76)',
            'rgba(9,9,14,0.97)',
          ]}
          locations={[0, 0.48, 1]}
          style={styles.overlay}
        >
          <Animated.View
            style={[
              styles.centerContent,
              {
                opacity: fadeAnim,
                transform: [
                  { translateY: slideAnim },
                  { scale: scaleAnim },
                ],
              },
            ]}
          >
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={['#B96BFF', '#8038E9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoBackground}
              >
                <Ionicons
                  name="sparkles"
                  size={42}
                  color="#FFFFFF"
                />
              </LinearGradient>

              <View style={styles.logoGlow} />
            </View>

            <Text style={styles.brand}>
              Community
              <Text style={styles.brandDot}>.</Text>
            </Text>

            <Text style={styles.tagline}>
              Your city. Your next story.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.description}>
              Discover extraordinary experiences
              happening around you.
            </Text>
          </Animated.View>

          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + 30 },
            ]}
          >
            <ActivityIndicator
              size="small"
              color={COLORS.purple}
            />

            <Text style={styles.loadingText}>
              FINDING YOUR NEXT EXPERIENCE
            </Text>

            <Text style={styles.footerBrand}>
              COMMUNITY 2.0
            </Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  background: {
    flex: 1,
  },

  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  centerContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: -30,
  },

  logoContainer: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 27,
  },

  logoBackground: {
    width: 92,
    height: 92,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.purple,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
    zIndex: 2,
  },

  logoGlow: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 35,
    backgroundColor: COLORS.purple,
    opacity: 0.12,
    transform: [{ scale: 1.25 }],
  },

  brand: {
    color: COLORS.white,
    fontSize: 43,
    fontWeight: '800',
    letterSpacing: -2,
    textAlign: 'center',
  },

  brandDot: {
    color: COLORS.purple,
  },

  tagline: {
    color: '#E7D6F8',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 11,
    textAlign: 'center',
  },

  divider: {
    width: 44,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.purple,
    marginTop: 30,
    marginBottom: 25,
  },

  description: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 290,
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
  },

  loadingText: {
    color: '#C9C3D0',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.7,
  },

  footerBrand: {
    color: '#77717F',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 15,
  },
});
