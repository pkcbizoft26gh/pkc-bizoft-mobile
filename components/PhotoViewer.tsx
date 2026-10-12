import React, { useEffect, useRef } from 'react'
import { Dimensions, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/theme'

export type ViewerPhoto = { id: string; url: string; label: string }

/** Full-screen photos: swipe left and right between them, tap anywhere or the cross to close. */
export function PhotoViewer({
  photos,
  startIndex,
  onClose,
}: {
  photos: ViewerPhoto[]
  startIndex: number | null
  onClose: () => void
}) {
  const scroller = useRef<ScrollView>(null)
  const { width, height } = Dimensions.get('window')

  useEffect(() => {
    if (startIndex === null) return
    const timer = setTimeout(() => scroller.current?.scrollTo({ x: startIndex * width, animated: false }), 50)
    return () => clearTimeout(timer)
  }, [startIndex, width])

  return (
    <Modal visible={startIndex !== null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {photos.map(photo => (
            <Pressable key={photo.id} onPress={onClose} style={{ width, height }}>
              <Image source={{ uri: photo.url }} style={{ width, height: height * 0.8, marginTop: height * 0.1 }} resizeMode="contain" />
              <Text style={styles.label}>{photo.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable onPress={onClose} hitSlop={14} accessibilityRole="button" accessibilityLabel="Close photo" style={styles.close}>
          <Ionicons name="close" size={28} color={colors.white} />
        </Pressable>
        {photos.length > 1 ? <Text style={styles.hint}>Swipe to see the other photo</Text> : null}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  close: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  hint: { position: 'absolute', bottom: 40, alignSelf: 'center', color: colors.muted, fontSize: 13 },
})
