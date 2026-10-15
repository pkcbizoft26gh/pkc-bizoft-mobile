import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { VideoView, useVideoPlayer } from 'expo-video'
import { colors, radii } from '@/constants/theme'
import { GlassCard } from './GlassCard'

// Same 25 second story as the web home page ("11:47 PM. Which would you tap?"),
// streamed from the web app so the APK does not grow. Nothing downloads until Play is tapped.
const BASE = process.env.EXPO_PUBLIC_API_URL || 'https://sme-systems-webapp.vercel.app'
const SRC = `${BASE}/media/pkc-promo-vertical.mp4`
const POSTER = `${BASE}/media/pkc-promo-vertical.jpg`

function Player() {
  const player = useVideoPlayer(SRC, (p) => {
    p.loop = true
    p.play()
  })
  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls
    />
  )
}

export function PromoVideoCard() {
  const [started, setStarted] = useState(false)
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.kicker}>A SHORT STORY</Text>
      <Text style={styles.title}>11:47 PM. Which would you tap?</Text>
      <Text style={styles.lead}>Thesis due at midnight. The Wi-Fi dies. Watch what Prinx does.</Text>
      <View style={styles.frame}>
        {started ? (
          <Player />
        ) : (
          <Pressable
            style={styles.play}
            onPress={() => setStarted(true)}
            accessibilityRole="button"
            accessibilityLabel="Play the 25 second story"
          >
            <Ionicons name="play-circle" size={64} color={colors.accent} />
            <Text style={styles.playLabel}>Play</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.note}>An illustrated, fictional story.</Text>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 14 },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 },
  lead: { color: colors.muted, fontSize: 13, marginTop: 4 },
  frame: {
    marginTop: 12,
    alignSelf: 'center',
    width: '70%',
    aspectRatio: 9 / 16,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: '#000'
  },
  video: { width: '100%', height: '100%' },
  play: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playLabel: { color: colors.text, fontWeight: '700', marginTop: 4 },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 8 }
})
