import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function EventCard({ event, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.card}>
      <Text style={styles.title}>{event.title}</Text>
      <Text>{event.date} | {event.location}</Text>
      <Text>{event.category}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, marginBottom: 12, backgroundColor: '#f1f1f1', borderRadius: 8 },
  title: { fontSize: 18, fontWeight: 'bold' },
});
