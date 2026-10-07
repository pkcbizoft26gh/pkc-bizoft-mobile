import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
  Text,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { ConnectionProvider } from '../lib/connection';
import { OfflineModal } from '../components/OfflineModal';
import { UpdatePrompt } from '../components/UpdatePrompt';
import { AlertHost } from '../components/AppAlert';
import { BiometricGate } from '../components/BiometricGate';

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const STARTUP_TIMEOUT_MS = 10000;
const TIMEOUT_MESSAGE = 'STARTUP_TIMEOUT';

// The connection provider and offline popup wrap the whole app, so the popup
// appears over every screen (splash, login, tabs) whenever the connection drops.
export default function RootLayout() {
  return (
    <ConnectionProvider>
      <RootNavigator />
      <OfflineModal />
      <UpdatePrompt />
      <AlertHost />
      <BiometricGate />
    </ConnectionProvider>
  );
}

function RootNavigator() {
  // Keep every screen below the phone's status bar / camera cutout. The bottom
  // inset is handled per screen (tab bar, login, signup) so it is not doubled.
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);

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

  const checkSession = useCallback(async () => {
    setLoading(true);
    setStartupError(null);

    try {
      await withTimeout(
        supabase.auth.getSession(),
        STARTUP_TIMEOUT_MS,
        TIMEOUT_MESSAGE,
      );
      setStartupError(null);
    } catch (error: any) {
      console.error('Startup session check error:', error);

      const isTimeout = error?.message === TIMEOUT_MESSAGE;

      setStartupError(
        isTimeout
          ? "This is taking longer than expected. Please check your internet connection and try again."
          : 'A connection to the internet is required to use PKC BIZOFT. Please check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Auth changes are handled by the individual screens.
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [checkSession]);

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

  if (startupError) {
    return (
      <View style={styles.startup}>
        <View style={styles.errorIconWrap}>
          <Ionicons
            name="cloud-offline-outline"
            size={40}
            color="#FB7185"
          />
        </View>

        <Text style={styles.errorTitle}>
          Connection Required
        </Text>

        <Text style={styles.errorMessage}>
          {startupError}
        </Text>

        <Pressable
          onPress={checkSession}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.retryButtonPressed,
          ]}
        >
          <Ionicons
            name="refresh"
            size={17}
            color="#001018"
          />
          <Text style={styles.retryButtonText}>
            Try Again
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.appRoot, { paddingTop: insets.top }]}>
    <StatusBar style="light" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: '#050B14',
  },

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

  errorIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#2B101A',
    borderWidth: 1,
    borderColor: '#5E1F31',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },

  errorTitle: {
    color: '#EAF7FF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },

  errorMessage: {
    color: '#8195A8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 28,
  },

  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: '#22D3EE',
  },

  retryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  retryButtonText: {
    color: '#001018',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});