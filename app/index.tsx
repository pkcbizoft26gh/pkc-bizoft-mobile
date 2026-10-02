import { useCallback, useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

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

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(() => {
    let cancelled = false;

    setChecking(true);
    setError(null);

    withTimeout(
      supabase.auth.getSession(),
      STARTUP_TIMEOUT_MS,
      TIMEOUT_MESSAGE,
    )
      .then(({ data }) => {
        if (cancelled) return;
        setHasSession(!!data.session);
        setChecking(false);
      })
      .catch((err: any) => {
        if (cancelled) return;

        console.error('Index session check error:', err);

        const isTimeout = err?.message === TIMEOUT_MESSAGE;

        setError(
          isTimeout
            ? 'This is taking longer than expected. Please check your internet connection and try again.'
            : 'A connection to the internet is required to use PKC BIZOFT. Please check your connection and try again.',
        );
        setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = checkSession();
    return cleanup;
  }, [checkSession]);

  // The root _layout.tsx already shows the splash screen while it
  // does its own session check, so this screen renders nothing
  // while briefly re-checking — there's no visible flash.
  if (checking) {
    return null;
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorIconWrap}>
          <Ionicons
            name="cloud-offline-outline"
            size={40}
            color="#FB7185"
          />
        </View>

        <Text style={styles.title}>
          Connection Required
        </Text>

        <Text style={styles.message}>
          {error}
        </Text>

        <Pressable
          onPress={checkSession}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons
            name="refresh"
            size={17}
            color="#001018"
          />
          <Text style={styles.buttonText}>
            Try Again
          </Text>
        </Pressable>
      </View>
    );
  }

  return hasSession ? (
    <Redirect href="/(tabs)" />
  ) : (
    <Redirect href="/login" />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050B14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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

  title: {
    color: '#EAF7FF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'center',
  },

  message: {
    color: '#8195A8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 28,
  },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: '#22D3EE',
  },

  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  buttonText: {
    color: '#001018',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});