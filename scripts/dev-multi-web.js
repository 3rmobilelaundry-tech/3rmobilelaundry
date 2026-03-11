const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = __dirname;
const USER_APP_DIR = path.join(ROOT, '..', 'apps', 'student-web');
const ADMIN_APP_DIR = path.join(ROOT, '..', 'apps', 'admin-web');
const BACKEND_DIR = path.join(ROOT, '..', 'backend');
const CACHE_DIR = path.join(ROOT, '.expo-cache');

let USER_PORT = Number(process.env.USER_WEB_PORT) || 19006;
let ADMIN_PORT = Number(process.env.ADMIN_WEB_PORT) || 19007;
let BACKEND_PORT = Number(process.env.BACKEND_PORT) || 5001;
let PROXY_PORT = 5000;
const APP_HOST = process.env.APP_HOST || '127.0.0.1';
const PROXY_HOST = process.env.PROXY_HOST || '0.0.0.0';
const ALERT_LATENCY_MS = Number(process.env.ALERT_LATENCY_MS) || 1500;
const PROXY_SIGNATURE = 'dev-multi-web';
const SHUTDOWN_TOKEN = process.env.PROXY_SHUTDOWN_TOKEN || 'dev-multi-web';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isWindows = process.platform === 'win32';
const nodeCmd = isWindows ? 'node.exe' : 'node';
const USED_PORTS = new Set();
const STATUS = {
  user: 'starting',
  admin: 'starting',
  backend: 'starting',
  proxy: 'starting',
  lastCheck: null,
  ports: {},
  hosts: {},
  errors: [],
  latency: {},
  signature: PROXY_SIGNATURE
};

const ensureDir = (dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {}
};

const checkPortAvailable = (port, host) => new Promise((resolve) => {
  const tester = net.createServer();
  tester.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      resolve(false);
      return;
    }
    resolve(false);
  });
  tester.once('listening', () => {
    tester.close(() => resolve(true));
  });
  tester.listen(port, host);
});

const waitForPort = async (port, host, timeoutMs = 6000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const available = await checkPortAvailable(port, host);
    if (available) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
};

const resolvePort = async (name, preferred, used, host, maxOffset = 10) => {
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const candidate = preferred + offset;
    if (used.has(candidate)) continue;
    const available = await checkPortAvailable(candidate, host);
    if (available) {
      used.add(candidate);
      if (candidate !== preferred) {
        console.log(`[startup] ${name} port ${preferred} in use, using ${candidate} instead.`);
      }
      return candidate;
    }
  }
  throw new Error(`[startup] No available port for ${name} starting at ${preferred}`);
};

const fetchJson = (port, pathName) => new Promise((resolve) => {
  const req = http.request({ hostname: APP_HOST, port, path: pathName, method: 'GET', timeout: 1200 }, (res) => {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk.toString();
    });
    res.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
  });
  req.on('error', () => resolve(null));
  req.on('timeout', () => {
    try { req.destroy(); } catch {}
    resolve(null);
  });
  req.end();
});

const requestProxyShutdown = (port) => new Promise((resolve) => {
  const req = http.request({
    hostname: APP_HOST,
    port,
    path: `/__shutdown?token=${encodeURIComponent(SHUTDOWN_TOKEN)}`,
    method: 'POST',
    timeout: 1200
  }, (res) => {
    res.resume();
    resolve(res.statusCode && res.statusCode < 500);
  });
  req.on('error', () => resolve(false));
  req.on('timeout', () => {
    try { req.destroy(); } catch {}
    resolve(false);
  });
  req.end();
});

const ensureProxyPort = async () => {
  const available = await checkPortAvailable(PROXY_PORT, PROXY_HOST);
  if (available) return;
  const status = await fetchJson(PROXY_PORT, '/__status');
  if (status && status.signature === PROXY_SIGNATURE) {
    const shutdown = await requestProxyShutdown(PROXY_PORT);
    if (shutdown) {
      const freed = await waitForPort(PROXY_PORT, PROXY_HOST);
      if (freed) return;
    }
  }
  throw new Error(`[startup] Port ${PROXY_PORT} is already in use.`);
};

const prefixLines = (chunk, prefix) => {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/);
  return lines.map((line, index) => {
    if (line.length === 0 && index === lines.length - 1) return '';
    return `${prefix} ${line}`;
  }).join('\n');
};

const attachLogs = (child, name) => {
  if (LOG_LEVEL === 'silent') return;
  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      if (LOG_LEVEL !== 'error') {
        process.stdout.write(prefixLines(chunk, `[${name}]`) + '\n');
      }
    });
  }
  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      process.stderr.write(prefixLines(chunk, `[${name}]`) + '\n');
    });
  }
};

const setStatus = (name, value) => {
  STATUS[name] = value;
};

const recordError = (name, error) => {
  STATUS.errors.unshift({
    name,
    message: error && error.message ? error.message : String(error || 'unknown'),
    at: new Date().toISOString()
  });
  if (STATUS.errors.length > 30) STATUS.errors.length = 30;
};

const checkHttp = (port, targetPath = '/') => new Promise((resolve) => {
  const start = Date.now();
  const req = http.request({ hostname: APP_HOST, port, path: targetPath, method: 'GET' }, (res) => {
    res.resume();
    resolve({ ok: res.statusCode && res.statusCode < 500, statusCode: res.statusCode, durationMs: Date.now() - start });
  });
  req.on('error', () => resolve({ ok: false, statusCode: null, durationMs: Date.now() - start }));
  req.end();
});

const lastStatus = {
  user: null,
  admin: null,
  backend: null,
  proxy: null
};

const refreshStatus = async () => {
  const [userRes, adminRes, backendRes] = await Promise.all([
    checkHttp(USER_PORT, '/'),
    checkHttp(ADMIN_PORT, '/'),
    checkHttp(BACKEND_PORT, '/health')
  ]);
  STATUS.user = userRes.ok ? 'up' : 'down';
  STATUS.admin = adminRes.ok ? 'up' : 'down';
  STATUS.backend = backendRes.ok ? 'up' : 'down';
  STATUS.proxy = 'up';
  STATUS.lastCheck = new Date().toISOString();
  STATUS.ports = { user: USER_PORT, admin: ADMIN_PORT, backend: BACKEND_PORT, proxy: PROXY_PORT };
  STATUS.hosts = { app: APP_HOST, proxy: PROXY_HOST };
  STATUS.latency = {
    user: userRes.durationMs,
    admin: adminRes.durationMs,
    backend: backendRes.durationMs
  };
  if (userRes.durationMs > ALERT_LATENCY_MS) {
    console.log(`[alert] user latency ${userRes.durationMs}ms`);
  }
  if (adminRes.durationMs > ALERT_LATENCY_MS) {
    console.log(`[alert] admin latency ${adminRes.durationMs}ms`);
  }
  if (backendRes.durationMs > ALERT_LATENCY_MS) {
    console.log(`[alert] backend latency ${backendRes.durationMs}ms`);
  }
  if (lastStatus.user && lastStatus.user !== STATUS.user) {
    console.log(`[alert] user status changed: ${lastStatus.user} -> ${STATUS.user}`);
  }
  if (lastStatus.admin && lastStatus.admin !== STATUS.admin) {
    console.log(`[alert] admin status changed: ${lastStatus.admin} -> ${STATUS.admin}`);
  }
  if (lastStatus.backend && lastStatus.backend !== STATUS.backend) {
    console.log(`[alert] backend status changed: ${lastStatus.backend} -> ${STATUS.backend}`);
  }
  lastStatus.user = STATUS.user;
  lastStatus.admin = STATUS.admin;
  lastStatus.backend = STATUS.backend;
  lastStatus.proxy = STATUS.proxy;
  console.log(`[monitor] user:${STATUS.user} admin:${STATUS.admin} backend:${STATUS.backend} proxy:${STATUS.proxy}`);
};

const startWebpackServer = (appDir, port, name) => {
  const localScriptPath = path.join(appDir, 'scripts', 'start-web.js');
  const scriptPath = fs.existsSync(localScriptPath)
    ? localScriptPath
    : path.join(ADMIN_APP_DIR, 'scripts', 'start-web.js');
  const env = {
    ...process.env,
    PORT: String(port),
    PROJECT_ROOT: appDir,
    HOST: APP_HOST
  };
  const child = spawn(nodeCmd, [scriptPath], { cwd: path.dirname(scriptPath), env });
  attachLogs(child, name);
  return child;
};

const startBackendServer = () => {
  const serverPath = path.join(BACKEND_DIR, 'server.js');
  const env = {
    ...process.env,
    PORT: String(BACKEND_PORT),
    HOST: APP_HOST
  };
  const child = spawn(nodeCmd, [serverPath], { cwd: BACKEND_DIR, env });
  attachLogs(child, 'backend');
  return child;
};

const isApiPath = (url) => (
  url.startsWith('/auth') ||
  url.startsWith('/student') ||
  url.startsWith('/api') ||
  url.startsWith('/health') ||
  url.startsWith('/metrics') ||
  url.startsWith('/carousel') ||
  url.startsWith('/webhooks') ||
  url.startsWith('/uploads') ||
  url.startsWith('/socket.io')
);

const isAdminPath = (url) => url === '/admin' || url.startsWith('/admin/');
const isAdminWebPath = (url) => url === '/admin-web' || url.startsWith('/admin-web/');
const isUserPath = (url) => url === '/user' || url.startsWith('/user/');

const getTargetForUrl = (url) => {
  if (isAdminPath(url)) {
    return { port: ADMIN_PORT, path: url };
  }
  if (isUserPath(url)) {
    return { port: USER_PORT, path: url };
  }
  if (isAdminWebPath(url)) {
    return { port: ADMIN_PORT, path: url };
  }
  if (isApiPath(url)) {
    return { port: BACKEND_PORT, path: url };
  }
  return { port: USER_PORT, path: url };
};

let shutdownProxy = null;

const proxyRequest = (req, res) => {
  if ((req.url || '').startsWith('/__status')) {
    const payload = JSON.stringify(STATUS);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(payload);
    return;
  }
  if ((req.url || '').startsWith('/__shutdown')) {
    const urlObj = new URL(req.url, `http://${APP_HOST}`);
    const token = urlObj.searchParams.get('token');
    if (token !== SHUTDOWN_TOKEN) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Shutting down');
    if (shutdownProxy) {
      setTimeout(() => shutdownProxy(), 150);
    }
    return;
  }
  if (req.url === '/') {
    res.writeHead(302, { Location: '/user/' });
    res.end();
    return;
  }
  if (req.url === '/admin') {
    res.writeHead(302, { Location: '/admin/' });
    res.end();
    return;
  }
  if (req.url === '/user') {
    res.writeHead(302, { Location: '/user/' });
    res.end();
    return;
  }
  const { port, path: targetPath } = getTargetForUrl(req.url || '/');
  const options = {
    hostname: APP_HOST,
    port,
    path: targetPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${APP_HOST}:${port}`
    }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end(`Proxy error: ${err && err.message ? err.message : 'unknown error'}`);
  });
  req.pipe(proxyReq, { end: true });
};

const buildUpgradeRequest = (req, targetPath, targetPort) => {
  const headers = { ...req.headers, host: `${APP_HOST}:${targetPort}` };
  const headerLines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
  return `${req.method} ${targetPath} HTTP/1.1\r\n${headerLines.join('\r\n')}\r\n\r\n`;
};

const startProxy = () => {
  const server = http.createServer(proxyRequest);
  const listen = () => {
    server.listen(PROXY_PORT, PROXY_HOST);
  };
  server.on('upgrade', (req, socket, head) => {
    const { port, path: targetPath } = getTargetForUrl(req.url || '/');
    const targetSocket = net.connect(port, APP_HOST, () => {
      const request = buildUpgradeRequest(req, targetPath, port);
      targetSocket.write(request);
      targetSocket.write(head);
      targetSocket.pipe(socket);
      socket.pipe(targetSocket);
    });
    targetSocket.on('error', () => {
      socket.destroy();
    });
  });
  server.on('listening', () => {
    setStatus('proxy', 'up');
    console.log(`[proxy] Routing user app at http://${APP_HOST}:${PROXY_PORT}/user/`);
    console.log(`[proxy] Routing admin app at http://${APP_HOST}:${PROXY_PORT}/admin/`);
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      recordError('proxy', err);
      return;
    }
    recordError('proxy', err);
  });
  listen();
  return server;
};

const startManagedProcess = (name, startFn) => {
  const state = { child: null, attempts: 0 };
  const boot = () => {
    try {
      state.child = startFn();
      setStatus(name, 'up');
      state.child.on('exit', (code, signal) => {
        setStatus(name, 'down');
        recordError(name, new Error(`${name} exited: ${code || ''} ${signal || ''}`.trim()));
        state.attempts += 1;
        const delay = Math.min(15000, 1000 * state.attempts);
        setTimeout(boot, delay);
      });
      return state.child;
    } catch (error) {
      recordError(name, error);
      state.attempts += 1;
      const delay = Math.min(15000, 1000 * state.attempts);
      setTimeout(boot, delay);
      return null;
    }
  };
  return { boot, state };
};

const main = async () => {
  console.log('[startup] dev-multi-web starting...');
  ensureDir(CACHE_DIR);
  ensureDir(path.join(CACHE_DIR, '.expo'));
  ensureDir(path.join(CACHE_DIR, 'native-modules-cache'));
  ensureDir(path.join(CACHE_DIR, 'cache'));
  ensureDir(path.join(CACHE_DIR, 'expo-home'));
  await ensureProxyPort();
  USED_PORTS.add(PROXY_PORT);
  USER_PORT = await resolvePort('user-web', USER_PORT, USED_PORTS, APP_HOST);
  ADMIN_PORT = await resolvePort('admin-web', ADMIN_PORT, USED_PORTS, APP_HOST);
  BACKEND_PORT = await resolvePort('backend', BACKEND_PORT, USED_PORTS, APP_HOST);
  console.log('[startup] Ports ready:', [USER_PORT, ADMIN_PORT, BACKEND_PORT, PROXY_PORT].join(', '));
  const backendProc = startManagedProcess('backend', startBackendServer);
  const userProc = startManagedProcess('user', () => startWebpackServer(USER_APP_DIR, USER_PORT, 'user-web'));
  const adminProc = startManagedProcess('admin', () => startWebpackServer(ADMIN_APP_DIR, ADMIN_PORT, 'admin-web'));
  const backend = backendProc.boot();
  const user = userProc.boot();
  const admin = adminProc.boot();
  const proxy = startProxy();
  const monitor = setInterval(refreshStatus, 30000);
  await refreshStatus();
  const keepAlive = setInterval(() => {}, 1000);

  const shutdown = (signal) => {
    console.log(`[shutdown] Received signal: ${signal}`);
    try { clearInterval(keepAlive); } catch {}
    try { clearInterval(monitor); } catch {}
    try { proxy.close(); } catch {}
    try { backend && backend.kill(); } catch {}
    try { user && user.kill(); } catch {}
    try { admin && admin.kill(); } catch {}
    process.exit(0);
  };
  shutdownProxy = shutdown;

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => {});
};

main().catch((err) => {
  console.error('[startup] Failed to boot dev servers:', err);
  process.exit(1);
});
