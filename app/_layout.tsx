import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  Text,
  Animated,
  Easing,
} from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [loading, setLoading] = useState(true);

  // Main logo animation
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;

  // Brand text animation
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const brandTranslateY = useRef(new Animated.Value(12)).current;

  // Subtitle animation
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(8)).current;

  // Glow animation
  const glowOpacity = useRef(new Animated.Value(0.15)).current;
  const glowScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    let mounted = true;

    const initializeApp = async () => {
      try {
        await supabase.auth.getSession();
      } catch (error) {
        console.error('Startup session check error:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeApp();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Auth changes are handled by the individual screens.
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      return;
    }

    // Logo entrance
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),

      Animated.timing(glowOpacity, {
        toValue: 0.9,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.spring(glowScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Brand name appears shortly after logo
    const brandTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(brandTranslateY, {
          toValue: 0,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 350);

    // Subtitle appears after brand
    const subtitleTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(subtitleTranslateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 700);

    // Subtle continuous glow pulse
    const glowPulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 1,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),

          Animated.timing(glowScale, {
            toValue: 1.08,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),

        Animated.parallel([
          Animated.timing(glowOpacity, {
            toValue: 0.55,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),

          Animated.timing(glowScale, {
            toValue: 1,
            duration: 1100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const glowTimer = setTimeout(() => {
      glowPulse.start();
    }, 850);

    return () => {
      clearTimeout(brandTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(glowTimer);
      glowPulse.stop();
    };
  }, [
    loading,
    logoOpacity,
    logoScale,
    brandOpacity,
    brandTranslateY,
    subtitleOpacity,
    subtitleTranslateY,
    glowOpacity,
    glowScale,
  ]);

  if (loading) {
    return (
      <View style={styles.startup}>
        <View style={styles.logoContainer}>
          <Animated.View
            style={[
              styles.glow,
              {
                opacity: glowOpacity,
                transform: [
                  {
                    scale: glowScale,
                  },
                ],
              },
            ]}
          />

          <Animated.View
            style={{
              opacity: logoOpacity,
              transform: [
                {
                  scale: logoScale,
                },
              ],
            }}
          >
            <Image
              source={require('../assets/images/pkc-transparent.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.brandContainer,
            {
              opacity: brandOpacity,
              transform: [
                {
                  translateY: brandTranslateY,
                },
              ],
            },
          ]}
        >
          <Text style={styles.brandName}>PKC BIZOFT</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.subtitleContainer,
            {
              opacity: subtitleOpacity,
              transform: [
                {
                  translateY: subtitleTranslateY,
                },
              ],
            },
          ]}
        >
          <Text style={styles.subtitle}>
            BUSINESS MANAGEMENT PLATFORM
          </Text>
        </Animated.View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color="#00E5FF"
          />

          <Text style={styles.loadingText}>
            Loading...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: {
          backgroundColor: '#050B14',
        },
      }}
    >
      <Stack.Screen
        name="login"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="signup"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    backgroundColor: '#050B14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  logoContainer: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  logo: {
    width: 125,
    height: 125,
  },

  glow: {
    position: 'absolute',
    width: 135,
    height: 135,
    borderRadius: 68,
    backgroundColor: 'rgba(0, 229, 255, 0.10)',
    shadowColor: '#00E5FF',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.9,
    shadowRadius: 35,
    elevation: 20,
  },

  brandContainer: {
    marginTop: 18,
    alignItems: 'center',
  },

  brandName: {
    color: '#EAF7FF',
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: 3.2,
    textAlign: 'center',
  },

  subtitleContainer: {
    marginTop: 9,
    alignItems: 'center',
  },

  subtitle: {
    color: '#8195A8',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    textAlign: 'center',
  },

  loadingContainer: {
    position: 'absolute',
    bottom: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 8,
    color: '#5F758A',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
  },
});