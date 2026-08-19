import { useUserStore } from '../store/userStore';
import { AdminTabs } from './AdminTabs';
import { UnsupportedRoleScreen } from '../screens/common/UnsupportedRoleScreen';

/**
 * Role-aware app shell. Admin/super_admin land on the bottom-tab navigator;
 * any other role (e.g. an account created by an admin for internal records
 * only) sees a fallback screen since there is no mobile experience for it.
 */
export function AppDrawer() {
  const role = useUserStore((state) => state.user?.role);

  const Shell = getShellForRole(role);

  return <Shell />;
}

/** Maps a role to the navigation shell that powers its home experience. */
const getShellForRole = (role?: string) => {
  switch (role) {
    case 'admin':
    case 'super_admin':
      return AdminTabs;
    default:
      return UnsupportedRoleScreen;
  }
};
