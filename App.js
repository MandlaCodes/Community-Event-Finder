import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ImageBackground, StyleSheet } from 'react-native';

// Screens
import HomeScreen from './screens/HomeScreen';
import EventsScreen from './screens/EventsScreen';
import EventDetail from './screens/EventDetail';
import FavoritesScreen from './screens/FavoritesScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <ImageBackground
      source={require('./assets/pexels-apasaric-2078008.jpg')} // ✅ fixed path
      style={styles.background}
      resizeMode="cover"
    >
      <NavigationContainer detachInactiveScreens={false}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'fade',

            contentStyle: { backgroundColor: 'transparent' }, // ✅ so bg shows through
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Events" component={EventsScreen} />
          <Stack.Screen name="EventDetail" component={EventDetail} />
          <Stack.Screen name="Favorites" component={FavoritesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
});
