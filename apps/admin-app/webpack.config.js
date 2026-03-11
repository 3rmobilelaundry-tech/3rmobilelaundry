const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  console.log('Starting Webpack Config...');
  const config = await createExpoWebpackConfigAsync(env, argv);
  console.log('Output Path:', config.output.path);
  
  config.output.publicPath = '/';
  
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: false,
  };

  // alias missing icon module to expo vector icons to satisfy dynamic require
  config.resolve.alias = {
    ...config.resolve.alias,
    '@react-native-vector-icons/material-design-icons': require.resolve('@expo/vector-icons/MaterialCommunityIcons'),
  };
  
  return config;
};
