import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO_INTRO_STORAGE_KEY, parseDemoIntroSeen } from '../lib/onboarding';

/** One-time demo-mode intro, remembered on this device. */
export function useDemoIntro() {
  const [loaded, setLoaded] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DEMO_INTRO_STORAGE_KEY)
      .catch(() => null)
      .then((raw) => {
        if (!active) return;
        setSeen(parseDemoIntroSeen(raw));
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const markSeen = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(DEMO_INTRO_STORAGE_KEY, '1').catch(() => {});
  }, []);

  return { loaded, seen, markSeen };
}
