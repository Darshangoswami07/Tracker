import { createDrawerNavigator } from '@react-navigation/drawer';
import { useUserStore } from '../store/userStore';
import type { MainDrawerParamList } from './types';
import AppDrawerContent from './AppDrawerContent';
import { AdminStack } from './AdminStack';
import { UnsupportedRoleScreen } from '../screens/common/UnsupportedRoleScreen';

const Drawer = createDrawerNavigator<MainDrawerParamList>();

/**
 * Role-aware drawer. The "Home" screen is the active role's native stack.
 * Only admin/super_admin have a dashboard in this app; any other role (e.g.
 * an account created by an admin for internal records only) sees a fallback
 * screen since there is no mobile experience for it.
 */
export function AppDrawer() {
  const role = useUserStore((state) => state.user?.role);

  const Screen = getStackForRole(role);

  return (
    <Drawer.Navigator
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        overlayColor: 'rgba(17, 24, 39, 0.35)',
        drawerStyle: { width: 300 },
        swipeEdgeWidth: 48,
      }}
    >
      <Drawer.Screen name="Home" component={Screen} />
    </Drawer.Navigator>
  );
}

/** Maps a role to the navigation stack that powers its dashboard. */
const getStackForRole = (role?: string) => {
  switch (role) {
    case 'admin':
    case 'super_admin':
      return AdminStack;
    default:
      return UnsupportedRoleScreen;
  }
};