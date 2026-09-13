import { registerRootComponent } from 'expo';

import { startupTrace } from './src/utils/startupTrace';
import App from './App';

startupTrace.mark('bundle:loaded');

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
