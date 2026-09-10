import { useEffect } from 'react';
import { AuthStack } from './AuthStack';
import { AppDrawer } from './AppDrawer';
import { SplashScreen } from '../screens/SplashScreen';
import { sessionEvents } from '../services/sessionEvents';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/userStore';
import { startupTrace } from '../utils/startupTrace';

startupTrace.mark('RootNavigator:module-loaded');

export const RootNavigator = () => {
  const status = useAuthStore((state) => state.status);
  const clearSession = useAuthStore((state) => state.clearSession);
  const user = useUserStore((state) => state.user);

  useEffect(() => sessionEvents.onExpired(clearSession), [clearSession]);

  startupTrace.mark('RootNavigator:render', { status, hasUser: Boolean(user) });

  if (status === 'idle' || status === 'validating') {
    return <SplashScreen />;
  }

  if (status === 'unauthenticated') {
    startupTrace.mark('RootNavigator:render->AuthStack', { reason: 'unauthenticated' });
    return <AuthStack />;
  }

  if (!user) {
    startupTrace.mark('RootNavigator:render->AuthStack', { reason: 'no-user' });
    return <AuthStack />;
  }

  startupTrace.mark('RootNavigator:render->AppDrawer');
  return <AppDrawer />;
};