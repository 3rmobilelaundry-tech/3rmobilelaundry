const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

(async () => {
  const projectRoot = process.env.PROJECT_ROOT ? path.resolve(process.env.PROJECT_ROOT) : path.join(__dirname, '..');
  const env = { mode: 'development', platform: 'web', projectRoot };
  const argv = { mode: 'development' };
  const requireFromProject = createRequire(path.join(projectRoot, 'package.json'));
  const webpack = requireFromProject('webpack');
  const WebpackDevServer = requireFromProject('webpack-dev-server');
  const createExpoWebpackConfigAsync = requireFromProject('@expo/webpack-config');
  const customConfigPath = path.join(projectRoot, 'webpack.config.js');
  const config = fs.existsSync(customConfigPath)
    ? await require(customConfigPath)(env, argv)
    : await createExpoWebpackConfigAsync(env, argv);
  config.mode = 'development';
  if (!config.devServer) config.devServer = {};
  const port = process.env.PORT ? Number(process.env.PORT) : 19007;
  const host = process.env.HOST || '127.0.0.1';
  config.devServer.port = port;
  config.devServer.host = host;
  config.devServer.historyApiFallback = true;
  const compiler = webpack(config);
  const server = new WebpackDevServer(config.devServer, compiler);
  await server.start();
  console.log(`Admin app web dev server running on http://${host}:${port}/`);
})().catch((err) => {
  console.error('Failed to start admin web dev server:', err);
  process.exit(1);
});
