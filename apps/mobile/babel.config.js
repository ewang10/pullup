module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Monorepo fix: babel-preset-expo auto-detects expo-router via require.resolve,
      // which fails when expo-router is in apps/mobile/node_modules but
      // babel-preset-expo is hoisted to root node_modules.
      // Explicitly include the plugin so process.env.EXPO_ROUTER_APP_ROOT is transformed.
      require('babel-preset-expo/build/expo-router-plugin').expoRouterBabelPlugin,
    ],
  };
};
