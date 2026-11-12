
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';

import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  TextInput,
  Keyboard,
  Alert,
  ScrollView,
  ImageBackground,
} from 'react-native';

import {
  NavigationContainer,
  DarkTheme,
} from '@react-navigation/native';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './screens/HomeScreen';
import EventsScreen from './screens/EventsScreen';
import FavoritesScreen from './screens/FavoritesScreen';
import EventDetail from './screens/EventDetail';

const Stack = createNativeStackNavigator();

const ONBOARDING_KEY = '@community_onboarding_v2';
const CITY_KEY = '@community_selected_city';

const bgImage = require('./assets/pexels-apasaric-2078008.jpg');

const C = {
  bg: '#09090E',
  panel: '#171720',
  purple: '#A855F7',
  white: '#F7F7FA',
  muted: '#A4A3B1',
  border: '#2B2A35',
};

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: C.purple,
    background: C.bg,
    card: C.panel,
    text: C.white,
    border: C.border,
  },
};

const TABS = [
  {
    route: 'Home',
    label: 'Discover',
    icon: 'home-outline',
    active: 'home',
  },
  {
    route: 'Events',
    label: 'Explore',
    icon: 'search-outline',
    active: 'search',
  },
  {
    route: 'Favorites',
    label: 'Saved',
    icon: 'heart-outline',
    active: 'heart',
  },
  {
    route: 'Profile',
    label: 'Profile',
    icon: 'person-outline',
    active: 'person',
  },
];

function Brand({ subtitle }) {
  return (
    <View>
      <Text style={s.brand}>
        Community
        <Text style={{ color: C.purple }}>.</Text>
      </Text>

      {subtitle ? (
        <Text style={s.sub}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

function Loading() {
  return (
    <View style={s.loadingContainer}>
      <ImageBackground
        source={bgImage}
        resizeMode="cover"
        style={StyleSheet.absoluteFillObject}
      >
        <LinearGradient
          colors={[
            'rgba(9,9,14,0.70)',
            'rgba(9,9,14,0.97)',
          ]}
          style={StyleSheet.absoluteFillObject}
        />
      </ImageBackground>

      <View style={s.loadingContent}>
        <View style={s.loadingIcon}>
          <Ionicons
            name="sparkles"
            size={36}
            color={C.white}
          />
        </View>

        <Brand subtitle="Your city. Your next story." />

        <ActivityIndicator
          color={C.purple}
          style={{ marginTop: 35 }}
        />
      </View>
    </View>
  );
}

function Welcome({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      <ImageBackground
        source={bgImage}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            'rgba(9,9,14,0.38)',
            'rgba(9,9,14,0.62)',
            'rgba(9,9,14,0.98)',
          ]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </ImageBackground>

      <View
        style={[
          s.welcomeContent,
          {
            paddingTop: insets.top + 35,
            paddingBottom: insets.bottom + 35,
          },
        ]}
      >
        <Brand subtitle="Events. Experiences. Your City." />

        <View style={s.welcomeBottom}>
          <View style={s.welcomeBadge}>
            <Ionicons
              name="sparkles"
              size={14}
              color="#DFB8FF"
            />

            <Text style={s.welcomeBadgeText}>
              DISCOVER WHAT'S NEXT
            </Text>
          </View>

          <Text style={s.headline}>
            Go out.
            {'\n'}
            Discover.
            {'\n'}
            <Text style={{ color: '#C279FF' }}>
              Experience.
            </Text>
          </Text>

          <Text style={s.body}>
            Discover concerts, festivals, sports and
            unforgettable experiences in your city.
          </Text>

          <Pressable
            style={s.button}
            onPress={() =>
              navigation.navigate('LocationSetup')
            }
          >
            <Text style={s.buttonText}>
              Get started
            </Text>

            <Ionicons
              name="arrow-forward"
              color="#FFFFFF"
              size={20}
            />
          </Pressable>

          <Text style={s.welcomeFooter}>
            YOUR CITY. YOUR COMMUNITY.
          </Text>
        </View>
      </View>
    </View>
  );
}

function LocationSetup({ onComplete }) {
  const insets = useSafeAreaInsets();

  const [city, setCity] = useState('Johannesburg');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    if (busy) return;

    const selectedCity = city.trim();

    if (!selectedCity) {
      Alert.alert(
        'Choose a city',
        'Enter the city you want to explore.'
      );
      return;
    }

    Keyboard.dismiss();
    setBusy(true);

    try {
      await onComplete(selectedCity);
    } catch (error) {
      console.error('Onboarding error:', error);

      Alert.alert(
        'Unable to continue',
        'Please try again.'
      );

      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          s.locationContent,
          {
            paddingTop: insets.top + 45,
            paddingBottom: insets.bottom + 30,
          },
        ]}
      >
        <View style={s.locationIcon}>
          <Ionicons
            name="location"
            size={35}
            color={C.purple}
          />
        </View>

        <Text style={s.locationKicker}>
          PERSONALIZE YOUR EXPERIENCE
        </Text>

        <Text style={s.locationHeadline}>
          Where are you
          {'\n'}
          exploring?
        </Text>

        <Text style={s.locationDescription}>
          Choose a city to discover events, concerts,
          festivals and experiences happening nearby.
        </Text>

        <Text style={s.inputLabel}>
          YOUR CITY
        </Text>

        <View style={s.inputContainer}>
          <Ionicons
            name="location-outline"
            size={21}
            color={C.purple}
          />

          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Enter your city"
            placeholderTextColor={C.muted}
            style={s.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={finish}
          />
        </View>

        <Text style={s.locationHint}>
          You can change your city anytime in Explore.
        </Text>

        <View style={{ flex: 1, minHeight: 60 }} />

        <Pressable
          style={[
            s.button,
            busy && { opacity: 0.7 },
          ]}
          disabled={busy}
          onPress={finish}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={s.buttonText}>
                Continue to Discover
              </Text>

              <Ionicons
                name="arrow-forward"
                size={20}
                color="#FFFFFF"
              />
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function TabBar({ navigation, active }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        s.tabBar,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          height:
            60 + Math.max(insets.bottom, 10),
        },
      ]}
    >
      {TABS.map((tab) => {
        const selected = active === tab.route;

        return (
          <Pressable
            key={tab.route}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{
              selected,
            }}
            style={s.tab}
            onPress={() => {
              if (!selected) {
                navigation.navigate(tab.route);
              }
            }}
          >
            <Ionicons
              name={
                selected
                  ? tab.active
                  : tab.icon
              }
              size={23}
              color={
                selected
                  ? C.purple
                  : '#B4B2BD'
              }
            />

            <Text
              style={[
                s.tabLabel,
                selected && {
                  color: C.purple,
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabScreen({
  navigation,
  route,
  component: Component,
}) {
  return (
    <View style={s.tabContainer}>
      <View style={{ flex: 1 }}>
        <Component
          navigation={navigation}
          route={route}
        />
      </View>

      <TabBar
        navigation={navigation}
        active={route.name}
      />
    </View>
  );
}

function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        s.profileContainer,
        {
          paddingTop: insets.top + 35,
        },
      ]}
    >
      <Text style={s.profileEyebrow}>
        YOUR COMMUNITY
      </Text>

      <Text style={s.profileTitle}>
        Profile
      </Text>

      <View style={s.profileCard}>
        <View style={s.profileAvatar}>
          <Ionicons
            name="person-outline"
            size={34}
            color={C.purple}
          />
        </View>

        <Text style={s.profileCardTitle}>
          Welcome to Community.
        </Text>

        <Text style={s.profileDescription}>
          Discover experiences, explore your city
          and save events you don't want to miss.
        </Text>

        <Pressable
          style={s.profileButton}
          onPress={() =>
            navigation.navigate('Favorites')
          }
        >
          <Ionicons
            name="heart-outline"
            size={20}
            color={C.white}
          />

          <Text style={s.profileButtonText}>
            Your saved events
          </Text>

          <Ionicons
            name="chevron-forward"
            size={18}
            color={C.muted}
          />
        </Pressable>
      </View>

      <Text style={s.profileFooter}>
        COMMUNITY 2.0
      </Text>
    </View>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function initialize() {
      try {
        const value = await AsyncStorage.getItem(
          ONBOARDING_KEY
        );

        if (mounted.current) {
          setOnboarded(value === 'true');
        }
      } catch (error) {
        console.warn(
          'Unable to restore onboarding:',
          error
        );
      } finally {
        if (mounted.current) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted.current = false;
    };
  }, []);

  const completeOnboarding = useCallback(
    async (selectedCity) => {
      await AsyncStorage.multiSet([
        [CITY_KEY, selectedCity],
        [ONBOARDING_KEY, 'true'],
      ]);

      setOnboarded(true);
    },
    []
  );

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor={C.bg}
      />

      {loading ? (
        <Loading />
      ) : (
        <NavigationContainer theme={theme}>
          <Stack.Navigator
            key={onboarded ? 'main' : 'intro'}
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              contentStyle: {
                backgroundColor: C.bg,
              },
            }}
          >
            {!onboarded ? (
              <>
                <Stack.Screen
                  name="Welcome"
                  component={Welcome}
                />

                <Stack.Screen name="LocationSetup">
                  {(props) => (
                    <LocationSetup
                      {...props}
                      onComplete={completeOnboarding}
                    />
                  )}
                </Stack.Screen>
              </>
            ) : (
              <>
                <Stack.Screen name="Home">
                  {(props) => (
                    <TabScreen
                      {...props}
                      component={HomeScreen}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen name="Events">
                  {(props) => (
                    <TabScreen
                      {...props}
                      component={EventsScreen}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen name="Favorites">
                  {(props) => (
                    <TabScreen
                      {...props}
                      component={FavoritesScreen}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen name="Profile">
                  {(props) => (
                    <TabScreen
                      {...props}
                      component={ProfileScreen}
                    />
                  )}
                </Stack.Screen>

                <Stack.Screen
                  name="EventDetail"
                  component={EventDetail}
                  options={{
                    animation: 'slide_from_right',
                  }}
                />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  loadingContainer: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingContent: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },

  loadingIcon: {
    width: 85,
    height: 85,
    borderRadius: 26,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },

  brand: {
    color: C.white,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.7,
  },

  sub: {
    color: C.muted,
    fontSize: 14,
    marginTop: 5,
  },

  welcomeContent: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },

  welcomeBottom: {
    paddingBottom: 10,
  },

  welcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(168,85,247,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.32)',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 8,
    marginBottom: 25,
  },

  welcomeBadgeText: {
    color: '#DFB8FF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },

  headline: {
    color: C.white,
    fontSize: 49,
    lineHeight: 56,
    letterSpacing: -1.8,
    fontWeight: '800',
  },

  body: {
    color: '#D0CDD8',
    fontSize: 16,
    lineHeight: 25,
    marginTop: 20,
    marginBottom: 32,
  },

  button: {
    backgroundColor: C.purple,
    borderRadius: 18,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  welcomeFooter: {
    color: '#A6A1B1',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 27,
  },

  locationContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },

  locationIcon: {
    width: 80,
    height: 80,
    borderRadius: 25,
    backgroundColor: '#251733',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },

  locationKicker: {
    color: C.purple,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.7,
    marginBottom: 16,
  },

  locationHeadline: {
    color: C.white,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -1.5,
    fontWeight: '800',
  },

  locationDescription: {
    color: C.muted,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 20,
    marginBottom: 40,
  },

  inputLabel: {
    color: '#D8D5DF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 12,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    backgroundColor: C.panel,
    borderRadius: 17,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderColor: C.border,
  },

  input: {
    flex: 1,
    color: C.white,
    fontSize: 16,
    marginLeft: 12,
    height: '100%',
  },

  locationHint: {
    color: C.muted,
    fontSize: 13,
    marginTop: 13,
  },

  tabContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111117',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#34323D',
    paddingTop: 10,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
  },

  tabLabel: {
    color: '#B4B2BD',
    fontSize: 10,
    fontWeight: '600',
  },

  profileContainer: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: 24,
  },

  profileEyebrow: {
    color: C.purple,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 9,
  },

  profileTitle: {
    color: C.white,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1.5,
    marginBottom: 30,
  },

  profileCard: {
    backgroundColor: C.panel,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },

  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#291B39',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 23,
  },

  profileCardTitle: {
    color: C.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  profileDescription: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 27,
  },

  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#282332',
    borderRadius: 15,
    padding: 17,
    gap: 12,
  },

  profileButtonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },

  profileFooter: {
    color: '#77717F',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 35,
  },
});
