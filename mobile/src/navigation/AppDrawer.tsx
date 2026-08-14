import { createDrawerNavigator } from '@react-navigation/drawer';
import { useUserStore } from '../store/userStore';
import type { MainDrawerParamList } from './types';
import AppDrawerContent from './AppDrawerContent';
import { AdminStack } from './AdminStack';
import { BusinessStack } from './BusinessStack';
import { CustomerStack } from './CustomerStack';
import { DriverStack } from './DriverStack';
import { EmployeeStack } from './EmployeeStack';

const Drawer = createDrawerNavigator<MainDrawerParamList>();

/**
 * Role-aware drawer. The "Home" screen is the active role's native stack, so
 * every role keeps its own navigation flow behind a shared drawer shell with
 * a role-specific menu (see drawerMenu.ts). If the role has no dedicated
 * shell it falls back to the employee stack.
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
    case 'dispatcher':
      return EmployeeStack;
    case 'employee':
      return EmployeeStack;
    case 'driver':
      return DriverStack;
    case 'business':
    case 'business_owner':
      return BusinessStack;
    case 'customer':
    default:
      return CustomerStack;
  }
};