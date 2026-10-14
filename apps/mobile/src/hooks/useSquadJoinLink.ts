import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { parseSquadJoinLink } from '@aurafit/shared';

/** URLs already routed (the launch URL stays returned by getInitialURL for the whole session). */
const handled = new Set<string>();

/**
 * Routes squad invite links (aurafit://join/<CODE>, or https://<site>/join/<CODE> when the OS opens
 * the app for it) to `onJoinCode`, both from a cold start and while running.
 */
export function useSquadJoinLink(onJoinCode: (code: string) => void): void {
  const cb = useRef(onJoinCode);
  cb.current = onJoinCode;

  useEffect(() => {
    const handle = (url: string | null) => {
      const code = parseSquadJoinLink(url);
      if (!code || !url || handled.has(url)) return;
      handled.add(url);
      cb.current(code);
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      // A link tapped again later is a new intent: allow it to route again.
      handled.delete(url);
      handle(url);
    });
    return () => sub.remove();
  }, []);
}
