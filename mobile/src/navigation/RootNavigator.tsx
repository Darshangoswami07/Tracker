import { useEffect } from 'react';
import { AuthStack } from './AuthStack';
import { AppDrawer } from './AppDrawer';
import { SplashScreen } from '../screens/SplashScreen';
import { sessionEvents } from '../services/sessionEvents';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/userStore';

export const RootNavigator = () => {
  const status = useAuthStore((state) => state.status);
  const clearSession = useAuthStore((state) => state.clearSession);
  const user = useUserStore((state) => state.user);

  useEffect(() => sessionEvents.onExpired(clearSession), [clearSession]);

  if (status === 'idle' || status === 'validating') {
    return <SplashScreen />;
  }

  if (status === 'unauthenticated') {
    return <AuthStack />;
  }

  if (!user) {
    return <AuthStack />;
  }

  return <AppDrawer />;
};