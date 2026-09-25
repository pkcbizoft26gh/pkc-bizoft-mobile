import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setHasSession(!!data.session);
        setChecking(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // The root _layout.tsx already shows the splash screen while it
  // does its own session check, so this screen renders nothing
  // while briefly re-checking — there's no visible flash.
  if (checking) {
    return null;
  }

  return hasSession ? (
    <Redirect href="/(tabs)" />
  ) : (
    <Redirect href="/login" />
  );
}