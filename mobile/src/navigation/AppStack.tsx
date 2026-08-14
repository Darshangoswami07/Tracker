import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../screens/app/DashboardScreen';
import { useAppTheme } from '../theme/useAppTheme';
import type { AppStackParamList } from './types';

const Stack = createNativeStackNavigator<AppStackParamList>();

/** Navigation stack shown while the user is authenticated. */
export const AppStack = () => {
  const { colors } = useAppTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Settings" component={DashboardScreen} />
    </Stack.Navigator>
  );
};