import { useNavigation, DrawerActions, CommonActions } from '@react-navigation/native';
import { useUserStore } from '../store/userStore';

/**
 * Maps a role to the authenticated home screen. Used as the fallback target
 * when a screen has no prior history to go back to.
 */
export const getHomeScreenForRole = (role?: string): string => {
  switch (role) {
    case 'admin':
    case 'super_admin':
    default:
      return 'AdminDashboard';
  }
};

/**
 * Navigation helpers used by screens inside the role-aware drawer stack.
 * Dashboards render these from the app drawer shell, so screens dispatch
 * drawer actions and navigate to the shared Notifications screen.
 */
export const useAppNav = () => {
  const navigation = useNavigation();
  const role = useUserStore((state) => state.user?.role);

  const openDrawer = () => navigation.dispatch(DrawerActions.openDrawer());
  const closeDrawer = () => navigation.dispatch(DrawerActions.closeDrawer());
  const goToNotifications = () =>
    navigation.navigate('Notifications' as never);

  /**
   * Navigates to a screen inside the role's navigation stack. Typed loosely
   * because the drawer shell exposes the nested role stack to *all* roles,
   * so the concrete route names cannot be statically verified here.
   */
  const navigate = (screen: string, params?: Record<string, unknown> | undefined) => {
    navigation.dispatch(
      CommonActions.navigate('Home', {
        screen,
        params: params as unknown as object | undefined,
      }),
    );
  };

  /**
   * Safe "back": pops the history when the stack has a previous screen;
   * otherwise lands on the authenticated user's dashboard. Preserves the
   * original navigation history when it exists.
   */
  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate(getHomeScreenForRole(role) as never);
    }
  };

  return { navigation, role, openDrawer, closeDrawer, goToNotifications, goBack, navigate };
};