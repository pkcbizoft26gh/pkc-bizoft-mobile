import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors } from '../constants/theme'

export type SectionTab<K extends string> = { key: K; label: string; count?: number }

// Pill row that splits a long screen into sections. Scrolls sideways when
// the labels do not fit on small phones.
export function SectionTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: SectionTab<K>[]
  value: K
  onChange: (key: K) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.wrap}
    >
      {tabs.map((t) => {
        const on = t.key === value
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{t.label}</Text>
            {t.count ? (
              <View style={[styles.badge, on && styles.badgeOn]}>
                <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{t.count}</Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, marginBottom: 14 },
  row: { gap: 8, paddingRight: 4 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardLight,
  },
  tabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  labelOn: { color: '#000' },
  badge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
  },
  badgeOn: { backgroundColor: 'rgba(0,0,0,0.18)' },
  badgeText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  badgeTextOn: { color: '#000' },
})
