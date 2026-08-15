const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite's web backend ships a compiled WebAssembly worker
// (`wa-sqlite/wa-sqlite.wasm`). Metro resolves `.wasm` files as static assets
// so they are served as a URL, otherwise web bundling fails with
// "Unable to resolve ./wa-sqlite/wa-sqlite.wasm".
config.resolver.assetExts.push('wasm');

module.exports = config;