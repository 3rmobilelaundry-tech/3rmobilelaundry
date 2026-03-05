const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  console.log('Building config...');
  const envWithMode = {
    ...env,
    mode: 'production',
  };
  
  const config = await createExpoWebpackConfigAsync(envWithMode, argv);
  config.stats = 'verbose';
  
  // Disable minimization
  if (config.optimization) {
    config.optimization.minimize = false;
  }
  
  // Remove potentially problematic plugins
  const pluginsToRemove = [
    'WebpackBar',
    'CleanWebpackPlugin',
    'FaviconWebpackPlugin',
    'ApplePwaWebpackPlugin',
    'ChromeIconsWebpackPlugin',
    'ExpoPwaManifestWebpackPlugin'
  ];

  if (config.plugins) {
    config.plugins = config.plugins.filter(p => !pluginsToRemove.includes(p.constructor.name));
    console.log('Plugins:', config.plugins.map(p => p.constructor.name));
  }

  config.output.publicPath = '/user/';

  return config;
};
