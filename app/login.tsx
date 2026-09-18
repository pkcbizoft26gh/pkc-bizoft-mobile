import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { supabase } from '../lib/supabase';

const COLORS = {
  background: '#020914',
  background2: '#061525',
  card: '#081827',
  cardBorder: '#15324A',
  cyan: '#22D3EE',
  cyanBright: '#67E8F9',
  cyanDark: '#0E7490',
  blue: '#2563EB',
  white: '#F8FAFC',
  text: '#E2E8F0',
  muted: '#8DA4B8',
  input: '#061321',
  inputBorder: '#18344B',
  danger: '#FB7185',
  success: '#34D399',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const logoAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoAnim, {
        toValue: 1,
        friction: 7,
        tension: 45,
        useNativeDriver: true,
      }),

      Animated.spring(cardAnim, {
        toValue: 1,
        friction: 8,
        tension: 45,
        delay: 120,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),

        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [cardAnim, glowAnim, logoAnim]);

  const handleLogin = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setErrorMessage('Please enter your email and password.');
      return;
    }

    if (!cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      // --------------------------------------------------
      // STEP 1: AUTHENTICATE USER
      // --------------------------------------------------
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (authError) {
        setErrorMessage(authError.message);
        return;
      }

      const user = authData.user;

      if (!user) {
        setErrorMessage(
          'Login succeeded, but no user account was returned.',
        );
        return;
      }

      // --------------------------------------------------
      // STEP 2: GET USER ROLE FROM PROFILES TABLE
      // --------------------------------------------------
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Profile lookup error:', profileError);

        await supabase.auth.signOut();

        setErrorMessage(
          'Unable to load your account role. Please try again.',
        );
        return;
      }

      // --------------------------------------------------
      // STEP 3: MAKE SURE A PROFILE EXISTS
      // --------------------------------------------------
      if (!profile) {
        await supabase.auth.signOut();

        setErrorMessage(
          'Your account profile could not be found. Please contact support.',
        );
        return;
      }

      // --------------------------------------------------
      // STEP 4: VALIDATE ROLE
      // --------------------------------------------------
      const role = profile.role;

      if (role !== 'customer' && role !== 'technician') {
        await supabase.auth.signOut();

        setErrorMessage(
          'Your account does not have a valid user role.',
        );
        return;
      }

      // --------------------------------------------------
      // STEP 5: REDIRECT BASED ON ROLE
      // --------------------------------------------------
      setSuccessMessage('Login successful.');

      // Small delay so the success message can briefly appear.
      setTimeout(() => {
        if (role === 'technician') {
          // Technician dashboard
          router.replace('/technician');
        } else {
          // Customer dashboard
          router.replace('/(tabs)/customer');
        }
      }, 350);
    } catch (error) {
      console.error('Login error:', error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const goToSignup = () => {
    router.push('/signup');
  };

  const cardTranslateY = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [45, 0],
  });

  const logoTranslateY = logoAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-25, 0],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.12],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.42],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Animated background */}
      <View pointerEvents="none" style={styles.backgroundLayer}>
        <Animated.View
          style={[
            styles.glowOne,
            {
              transform: [{ scale: glowScale }],
              opacity: glowOpacity,
            },
          ]}
        />

        <Animated.View
          style={[
            styles.glowTwo,
            {
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        <View style={styles.gridLineOne} />
        <View style={styles.gridLineTwo} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View
            style={[
              styles.logoSection,
              {
                opacity: logoAnim,
                transform: [
                  { translateY: logoTranslateY },
                  { scale: logoAnim },
                ],
              },
            ]}
          >
            <View style={styles.logoGlow} />

            <View style={styles.logoContainer}>
              <Image
                source={require('../assets/images/pkc-transparent.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.brand}>PKC BIZOFT</Text>

            <Text style={styles.tagline}>
              BUSINESS MANAGEMENT PLATFORM
            </Text>
          </Animated.View>

          {/* Login card */}
          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardAnim,
                transform: [{ translateY: cardTranslateY }],
              },
            ]}
          >
            <View style={styles.cardAccent} />

            <View style={styles.headingRow}>
              <View>
                <Text style={styles.title}>Welcome back</Text>

                <Text style={styles.subtitle}>
                  Sign in to continue to your account
                </Text>
              </View>

              <View style={styles.lockIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={22}
                  color={COLORS.cyan}
                />
              </View>
            </View>

            {/* Error */}
            {errorMessage ? (
              <View style={styles.messageBoxError}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={COLORS.danger}
                />

                <Text style={styles.errorText}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* Success */}
            {successMessage ? (
              <View style={styles.messageBoxSuccess}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color={COLORS.success}
                />

                <Text style={styles.successText}>
                  {successMessage}
                </Text>
              </View>
            ) : null}

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>
                EMAIL ADDRESS
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={COLORS.muted}
                  style={styles.inputIcon}
                />

                <TextInput
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setErrorMessage('');
                  }}
                  placeholder="you@example.com"
                  placeholderTextColor="#587086"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  style={styles.input}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  PASSWORD
                </Text>
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={COLORS.muted}
                  style={styles.inputIcon}
                />

                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setErrorMessage('');
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor="#587086"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  style={styles.input}
                  editable={!loading}
                  onSubmitEditing={handleLogin}
                />

                <Pressable
                  onPress={() =>
                    setShowPassword((value) => !value)
                  }
                  style={styles.eyeButton}
                  hitSlop={10}
                  disabled={loading}
                >
                  <Ionicons
                    name={
                      showPassword
                        ? 'eye-off-outline'
                        : 'eye-outline'
                    }
                    size={21}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>
            </View>

            {/* Login */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.loginButton,
                pressed &&
                  !loading &&
                  styles.buttonPressed,
                loading && styles.buttonDisabled,
              ]}
            >
              <View style={styles.buttonShine} />

              {loading ? (
                <View style={styles.loadingContent}>
                  <ActivityIndicator
                    size="small"
                    color="#001018"
                  />

                  <Text style={styles.loadingText}>
                    SIGNING IN...
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.loginButtonText}>
                    SIGN IN
                  </Text>

                  <View style={styles.arrowCircle}>
                    <Ionicons
                      name="arrow-forward"
                      size={17}
                      color={COLORS.white}
                    />
                  </View>
                </>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.divider} />

              <Text style={styles.dividerText}>
                OR
              </Text>

              <View style={styles.divider} />
            </View>

            {/* Signup */}
            <View style={styles.signupRow}>
              <Text style={styles.signupText}>
                Don't have an account?
              </Text>

              <Pressable
                onPress={goToSignup}
                disabled={loading}
                hitSlop={8}
              >
                <Text style={styles.signupLink}>
                  Create an account
                </Text>
              </Pressable>
            </View>
          </Animated.View>

          <Text style={styles.footerText}>
            SECURE • FAST • BUILT FOR BUSINESS
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  keyboardContainer: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'ios' ? 55 : 40,
    paddingBottom: 30,
    justifyContent: 'center',
  },

  backgroundLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },

  glowOne: {
    position: 'absolute',
    width: 390,
    height: 390,
    borderRadius: 195,
    backgroundColor: COLORS.cyanDark,
    top: -210,
    right: -180,
  },

  glowTwo: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: '#102A56',
    bottom: -190,
    left: -190,
    opacity: 0.42,
  },

  gridLineOne: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#0C2639',
    left: '18%',
    opacity: 0.25,
  },

  gridLineTwo: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#0C2639',
    right: '18%',
    opacity: 0.18,
  },

  logoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },

  logoGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: COLORS.cyan,
    opacity: 0.08,
  },

  logoContainer: {
    width: 125,
    height: 125,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logo: {
    width: 115,
    height: 115,
  },

  brand: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginTop: 2,
  },

  tagline: {
    color: COLORS.cyan,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.1,
    marginTop: 6,
  },

  card: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 22,
    overflow: 'hidden',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 18,
    },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 15,
  },

  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 28,
    right: 28,
    height: 2,
    backgroundColor: COLORS.cyan,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },

  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 23,
  },

  title: {
    color: COLORS.white,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  subtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 19,
  },

  lockIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    backgroundColor: '#062738',
    borderWidth: 1,
    borderColor: '#12455B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  messageBoxError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2B101A',
    borderWidth: 1,
    borderColor: '#5E1F31',
    borderRadius: 13,
    padding: 12,
    marginBottom: 16,
    gap: 9,
  },

  errorText: {
    flex: 1,
    color: '#FDA4AF',
    fontSize: 13,
    lineHeight: 18,
  },

  messageBoxSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#06271F',
    borderWidth: 1,
    borderColor: '#115B49',
    borderRadius: 13,
    padding: 12,
    marginBottom: 16,
    gap: 9,
  },

  successText: {
    flex: 1,
    color: '#6EE7B7',
    fontSize: 13,
  },

  field: {
    marginBottom: 17,
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  label: {
    color: '#9FB4C7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
    marginBottom: 8,
  },

  inputWrapper: {
    height: 56,
    backgroundColor: COLORS.input,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  inputIcon: {
    marginLeft: 16,
  },

  input: {
    flex: 1,
    height: '100%',
    color: COLORS.white,
    fontSize: 15,
    paddingHorizontal: 12,
  },

  eyeButton: {
    width: 50,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  loginButton: {
    height: 58,
    borderRadius: 16,
    backgroundColor: COLORS.cyan,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,

    shadowColor: COLORS.cyan,
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.24,
    shadowRadius: 13,
    elevation: 7,
  },

  buttonShine: {
    position: 'absolute',
    width: 120,
    height: 100,
    backgroundColor: '#FFFFFF',
    opacity: 0.07,
    transform: [{ rotate: '20deg' }],
    left: -40,
  },

  loginButtonText: {
    color: '#00141B',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.7,
  },

  loadingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },

  loadingText: {
    color: '#00141B',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  arrowCircle: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#073B4C',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  buttonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },

  buttonDisabled: {
    opacity: 0.65,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 21,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#163047',
  },

  dividerText: {
    color: '#60798D',
    fontSize: 10,
    fontWeight: '800',
    marginHorizontal: 12,
    letterSpacing: 1,
  },

  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  signupText: {
    color: COLORS.muted,
    fontSize: 13,
  },

  signupLink: {
    color: COLORS.cyanBright,
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 5,
  },

  footerText: {
    color: '#456174',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.6,
    textAlign: 'center',
    marginTop: 22,
  },
});