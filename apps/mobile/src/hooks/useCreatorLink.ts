import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { parseCreatorLink } from '../lib/creator';

/** URLs already routed (the launch URL stays returned by getInitialURL for the whole session). */
const handled = new Set<string>();

/**
 * Routes creator profile links (aurafit://c/<handle>, or https://<site>/c/<handle> when the OS opens the
 * app for it) to `onHandle`, from a cold start and while running. Same pattern as useSquadJoinLink.
 */
export function useCreatorLink(onHandle: (handle: string) => void): void {
  const cb = useRef(onHandle);
  cb.current = onHandle;

  useEffect(() => {
    const route = (url: string | null) => {
      const handle = parseCreatorLink(url);
      if (!handle || !url || handled.has(url)) return;
      handled.add(url);
      cb.current(handle);
    };
    Linking.getInitialURL().then(route).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      handled.delete(url);
      route(url);
    });
    return () => sub.remove();
  }, []);
}
