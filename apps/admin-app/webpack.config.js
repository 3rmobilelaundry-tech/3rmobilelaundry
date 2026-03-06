const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  console.log('Starting Webpack Config...');
  const config = await createExpoWebpackConfigAsync(env, argv);
  console.log('Output Path:', config.output.path);
  
  config.output.publicPath = '/admin/';
  
  config.resolve.fallback = {
    ...config.resolve.fallback,
    crypto: false,
  };
  
  return config;
};
