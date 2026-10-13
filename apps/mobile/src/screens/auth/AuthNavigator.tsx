import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { LoginScreen } from './LoginScreen';
import { SignupScreen } from './SignupScreen';
import { WelcomeScreen } from './WelcomeScreen';

type Route = { name: 'welcome' } | { name: 'login' } | { name: 'signup' } | { name: 'forgot'; email: string };

/** Tiny stack navigator for the signed-out flow; the Android back button pops the stack. */
export function AuthNavigator() {
  const [stack, setStack] = useState<Route[]>([{ name: 'welcome' }]);
  const route = stack[stack.length - 1];

  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  /** Jump to a sibling screen without growing the stack (e.g. Login ↔ Sign up). */
  const replace = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length <= 1) return false; // let the OS handle it (exit app)
      pop();
      return true;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  switch (route.name) {
    case 'login':
      return (
        <LoginScreen
          onBack={pop}
          onForgot={(email) => push({ name: 'forgot', email })}
          onSignup={() => replace({ name: 'signup' })}
        />
      );
    case 'signup':
      return <SignupScreen onBack={pop} onLogin={() => replace({ name: 'login' })} />;
    case 'forgot':
      return <ForgotPasswordScreen initialEmail={route.email} onBack={pop} />;
    default:
      return <WelcomeScreen onLogin={() => push({ name: 'login' })} onSignup={() => push({ name: 'signup' })} />;
  }
}
