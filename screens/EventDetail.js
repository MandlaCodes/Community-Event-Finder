import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ImageBackground, StyleSheet, Pressable, Animated, Alert, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const C = { bg: '#0B0A10', panel: '#17161F', purple: '#A855F7', text: '#F7F7FA', muted: '#B6B3C0' };
const fallback = require('../assets/pexels-apasaric-2078008.jpg');
const imageOf = e => e?.image || e?.imageUrl || e?.images?.[0]?.url || e?._embedded?.attractions?.[0]?.images?.[0]?.url;
const dateOf = e => e?.date || e?.dates?.start?.localDate;
const timeOf = e => e?.time || e?.dates?.start?.localTime;
const venueOf = e => e?.location || e?._embedded?.venues?.[0]?.name;
const cityOf = e => e?._embedded?.venues?.[0]?.city?.name;
const priceOf = e => e?.priceRanges?.[0]?.min != null ? `From ${e.priceRanges[0].currency || ''} ${e.priceRanges[0].min}` : (e?.price || null);
function readableDate(value) { if (!value) return 'Date to be confirmed'; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function InfoLine({ icon, children }) { return <View style={s.infoLine}><Ionicons name={icon} color="#D6D1E2" size={21}/><Text style={s.infoText}>{children}</Text></View>; }
export default function EventDetail({ route, navigation }) {
  const event = route.params?.event || {};
  const insets = useSafeAreaInsets();
  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const image = imageOf(event);
  const title = event.title || event.name || 'Event details';
  const venue = [venueOf(event), cityOf(event)].filter(Boolean).join(', ') || 'Venue to be confirmed';
  const date = readableDate(dateOf(event));
  const time = timeOf(event);
  const price = priceOf(event);
  const ticketUrl = event.url || event.ticketUrl || event.ticket_url || null;
  const description = event.description || event.info || event.pleaseNote || event.promoter?.description || 'More information about this event will be available from the organizer.';

  useEffect(() => { let active = true; (async () => { try { const raw = await AsyncStorage.getItem('favorites'); const list = raw ? JSON.parse(raw) : []; if (active) setIsFavorite(Array.isArray(list) && list.some(item => String(item.id) === String(event.id))); } catch (error) { console.warn('Could not load saved events', error); } })(); return () => { active = false; }; }, [event.id]);
  const toggleFavorite = async () => {
    if (saving) return; setSaving(true);
    try {
      const raw = await AsyncStorage.getItem('favorites'); const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      const exists = list.some(item => String(item.id) === String(event.id));
      const updated = exists ? list.filter(item => String(item.id) !== String(event.id)) : [...list, event];
      await AsyncStorage.setItem('favorites', JSON.stringify(updated)); setIsFavorite(!exists);
      Animated.sequence([Animated.spring(scale, { toValue: 1.22, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, useNativeDriver: true })]).start();
    } catch (error) { Alert.alert('Could not save event', 'Please try again.'); } finally { setSaving(false); }
  };
  const openTickets = async () => { if (!ticketUrl) return; try { const supported = await Linking.canOpenURL(ticketUrl); if (supported) await Linking.openURL(ticketUrl); else Alert.alert('Link unavailable', 'The ticket link could not be opened.'); } catch { Alert.alert('Link unavailable', 'Please try again later.'); } };
  const share = async () => { try { await Share.share({ message: `${title}${ticketUrl ? `\n${ticketUrl}` : ''}` }); } catch {} };
  return <View style={s.container}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 35 }}>
      <View style={s.hero}>
        <ImageBackground source={image ? { uri: image } : fallback} style={StyleSheet.absoluteFillObject} resizeMode="cover">
          <LinearGradient colors={['rgba(8,7,13,0.55)', 'rgba(8,7,13,0.02)', C.bg]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFillObject}/>
        </ImageBackground>
        <View style={[s.topActions, { top: insets.top + 10 }]}>
          <Pressable accessibilityLabel="Back" style={s.circle} onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={25} color="white"/></Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable accessibilityLabel="Save event" style={s.circle} disabled={saving} onPress={toggleFavorite}><Animated.View style={{ transform: [{ scale }] }}><Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={24} color={isFavorite ? '#FF75B0' : 'white'}/></Animated.View></Pressable>
            <Pressable accessibilityLabel="Share event" style={s.circle} onPress={share}><Ionicons name="share-outline" size={22} color="white"/></Pressable>
          </View>
        </View>
      </View>
      <View style={s.sheet}>
        <View style={s.handle}/>
        <Text style={s.title}>{title}</Text>
        <View style={s.infoBlock}>
          <InfoLine icon="calendar-outline">{date}{time ? ` · ${time.slice(0,5)}` : ''}</InfoLine>
          <InfoLine icon="location-outline">{venue}</InfoLine>
          {price ? <InfoLine icon="ticket-outline">{price}</InfoLine> : null}
        </View>
        <View style={s.actionRow}>
          <Pressable style={[s.ticketButton, !ticketUrl && s.disabled]} disabled={!ticketUrl} onPress={openTickets}><Text style={s.ticketText}>{ticketUrl ? 'Get Tickets' : 'Tickets unavailable'}</Text>{ticketUrl ? <Ionicons name="open-outline" color="white" size={19}/> : null}</Pressable>
          <Pressable style={s.bookmark} onPress={toggleFavorite} disabled={saving}><Ionicons name={isFavorite ? 'bookmark' : 'bookmark-outline'} size={25} color={isFavorite ? C.purple : C.text}/></Pressable>
        </View>
        <Text style={s.sectionTitle}>About</Text>
        <Text style={s.description}>{description}</Text>
        <View style={s.divider}/>
        <Text style={s.sectionTitle}>Event Details</Text>
        <InfoLine icon="musical-notes-outline">{event.classifications?.[0]?.genre?.name || event.category || 'Event'}</InfoLine>
        {event.ageRestrictions?.legalAgeEnforced ? <InfoLine icon="people-outline">Age restrictions may apply</InfoLine> : null}
        <View style={s.divider}/>
        <Pressable style={s.moreButton} onPress={share}><Ionicons name="share-social-outline" size={20} color={C.purple}/><Text style={s.moreText}>Share this event</Text><Ionicons name="chevron-forward" size={18} color={C.muted}/></Pressable>
      </View>
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg }, hero: { height: 410, backgroundColor: '#241A30' },
  topActions: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }, circle: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(30,27,40,0.72)', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 33, borderTopRightRadius: 33, marginTop: -40, paddingHorizontal: 27, paddingTop: 12, minHeight: 520 },
  handle: { width: 46, height: 5, borderRadius: 3, backgroundColor: '#595663', alignSelf: 'center', marginBottom: 30 },
  title: { color: C.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.1, lineHeight: 41, marginBottom: 24 },
  infoBlock: { gap: 16 }, infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 }, infoText: { color: '#E6E3EC', fontSize: 15, lineHeight: 23, flex: 1 },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 30, marginBottom: 36 }, ticketButton: { flex: 1, backgroundColor: C.purple, borderRadius: 17, height: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, disabled: { backgroundColor: '#393441' }, ticketText: { color: 'white', fontSize: 16, fontWeight: '700' }, bookmark: { width: 57, height: 56, borderRadius: 17, borderWidth: 1, borderColor: '#393541', alignItems: 'center', justifyContent: 'center', backgroundColor: '#22202A' },
  sectionTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.6, marginBottom: 16 }, description: { color: '#C8C4D0', fontSize: 15, lineHeight: 24 }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#3A3743', marginVertical: 30 }, moreButton: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 8 }, moreText: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600' },
});