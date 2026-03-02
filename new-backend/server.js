const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 5100;

const send = (res, code, data) => {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
};

const parseBody = (req) =>
  new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });

// In-memory data
const tokens = new Map(); // token -> user
const users = []; // { user_id, full_name, phone_number, password, role, student_id, school, hostel_address }
const plans = [
  { plan_id: 1, name: 'Basic Plan', price: 5000, duration_days: 30, max_pickups: 4, description: '4 Pickups / Month' },
  { plan_id: 2, name: 'Standard Plan', price: 12000, duration_days: 30, max_pickups: 8, description: '8 Pickups / Month' },
  { plan_id: 3, name: 'Premium Plan', price: 20000, duration_days: 30, max_pickups: 12, description: '12 Pickups / Month' },
];
const subscriptions = []; // { subscription_id, user_id, plan_id, start_date, end_date, remaining_pickups, status }
const orders = []; // { order_id, user_id, pickup_date, pickup_time_slot, clothes_count, extra_clothes, status, notes }
const invites = []; // { invite_id, role, phone_number, token, status, expires_at }
const auditLogs = []; // { actor_user_id, action, entity_type, entity_id, details, created_at }

let nextIds = { user: 1, subscription: 1, order: 1, invite: 1 };

const randToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const now = () => new Date().toISOString();

const requireAuth = (req) => {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  return tokens.get(m[1]) || null;
};

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  try {
    if (req.method === 'OPTIONS') {
      return send(res, 204, {});
    }
    // Health
    if (req.method === 'GET' && pathname === '/health') {
      return send(res, 200, { ok: true, ts: now() });
    }

    // Auth
    if (req.method === 'POST' && pathname === '/auth/register') {
      const body = await parseBody(req);
      const role = body.role || 'student';
      const user = {
        user_id: nextIds.user++,
        full_name: body.full_name || 'User',
        phone_number: body.phone_number,
        password: body.password,
        role,
        student_id: body.student_id || null,
        school: body.school || null,
        hostel_address: body.hostel_address || null,
      };
      if (!user.phone_number || !user.password) return send(res, 400, { error: 'missing_credentials' });
      if (users.find((u) => u.phone_number === user.phone_number)) return send(res, 409, { error: 'exists' });
      users.push(user);
      return send(res, 201, { user });
    }

    if (req.method === 'POST' && pathname === '/auth/login') {
      const body = await parseBody(req);
      const u = users.find((x) => x.phone_number === body.phone_number && x.password === body.password);
      if (!u) return send(res, 401, { error: 'invalid_credentials' });
      const token = randToken();
      tokens.set(token, u);
      return send(res, 200, { token, user: u });
    }

    // Student
    if (req.method === 'GET' && pathname === '/student/plans') {
      return send(res, 200, plans);
    }

    if (req.method === 'GET' && pathname === '/student/subscription') {
      const user_id = Number(query.user_id);
      const sub = subscriptions.find((s) => s.user_id === user_id) || null;
      if (!sub) return send(res, 200, null);
      const plan = plans.find((p) => p.plan_id === sub.plan_id) || null;
      return send(res, 200, { ...sub, Plan: plan });
    }

    if (req.method === 'POST' && pathname === '/student/subscribe') {
      const me = requireAuth(req);
      if (!me || me.role !== 'student') return send(res, 403, { error: 'forbidden' });
      const body = await parseBody(req);
      const plan = plans.find((p) => p.plan_id === body.plan_id);
      if (!plan) return send(res, 404, { error: 'plan_not_found' });
      const start = new Date();
      const end = new Date();
      end.setDate(start.getDate() + plan.duration_days);
      const existing = subscriptions.find((s) => s.user_id === me.user_id);
      if (existing) {
        existing.plan_id = plan.plan_id;
        existing.start_date = start.toISOString();
        existing.end_date = end.toISOString();
        existing.remaining_pickups = plan.max_pickups;
        existing.status = 'active';
        return send(res, 200, existing);
      }
      const sub = {
        subscription_id: nextIds.subscription++,
        user_id: me.user_id,
        plan_id: plan.plan_id,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        remaining_pickups: plan.max_pickups,
        status: 'active',
      };
      subscriptions.push(sub);
      return send(res, 201, sub);
    }

    if (req.method === 'GET' && pathname === '/student/orders') {
      const user_id = Number(query.user_id);
      const mine = orders.filter((o) => o.user_id === user_id);
      return send(res, 200, mine);
    }

    if (req.method === 'POST' && pathname === '/student/book') {
      const me = requireAuth(req);
      if (!me || me.role !== 'student') return send(res, 403, { error: 'forbidden' });
      const body = await parseBody(req);
      if (!body.pickup_date || !body.pickup_time_slot || !body.clothes_count) return send(res, 400, { error: 'invalid' });
      const order = {
        order_id: nextIds.order++,
        user_id: me.user_id,
        pickup_date: body.pickup_date,
        pickup_time_slot: body.pickup_time_slot,
        clothes_count: body.clothes_count,
        extra_clothes: body.extra_clothes || 0,
        status: 'awaiting_pickup',
        notes: body.notes || null,
      };
      orders.push(order);
      const code_value = 'PK' + Math.random().toString(36).substring(2, 8).toUpperCase();
      return send(res, 201, { order, code: { code_value, type: 'pickup' } });
    }

    // Admin
    if (req.method === 'GET' && pathname === '/admin/plans') {
      const me = requireAuth(req);
      if (!me || me.role !== 'admin') return send(res, 403, { error: 'forbidden' });
      return send(res, 200, plans);
    }
    if (req.method === 'POST' && pathname === '/admin/plans') {
      const me = requireAuth(req);
      if (!me || me.role !== 'admin') return send(res, 403, { error: 'forbidden' });
      const body = await parseBody(req);
      const plan = {
        plan_id: plans.length ? Math.max(...plans.map((p) => p.plan_id)) + 1 : 1,
        name: body.name,
        price: body.price,
        duration_days: body.duration_days,
        max_pickups: body.max_pickups,
        description: body.description || '',
      };
      plans.push(plan);
      auditLogs.push({ actor_user_id: me.user_id, action: 'create', entity_type: 'plan', entity_id: String(plan.plan_id), details: JSON.stringify(body), created_at: now() });
      return send(res, 201, plan);
    }
    if (req.method === 'PUT' && pathname.startsWith('/admin/plans/')) {
      const me = requireAuth(req);
      if (!me || me.role !== 'admin') return send(res, 403, { error: 'forbidden' });
      const id = Number(pathname.split('/').pop());
      const body = await parseBody(req);
      const plan = plans.find((p) => p.plan_id === id);
      if (!plan) return send(res, 404, { error: 'plan_not_found' });
      Object.assign(plan, body);
      auditLogs.push({ actor_user_id: me.user_id, action: 'update', entity_type: 'plan', entity_id: String(id), details: JSON.stringify(body), created_at: now() });
      return send(res, 200, plan);
    }
    if (req.method === 'DELETE' && pathname.startsWith('/admin/plans/')) {
      const me = requireAuth(req);
      if (!me || me.role !== 'admin') return send(res, 403, { error: 'forbidden' });
      const id = Number(pathname.split('/').pop());
      const idx = plans.findIndex((p) => p.plan_id === id);
      if (idx === -1) return send(res, 404, { error: 'plan_not_found' });
      plans.splice(idx, 1);
      auditLogs.push({ actor_user_id: me.user_id, action: 'delete', entity_type: 'plan', entity_id: String(id), details: '{}', created_at: now() });
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/admin/orders') {
      const me = requireAuth(req);
      if (!me || !['rider', 'washer', 'receptionist', 'admin'].includes(me.role)) return send(res, 403, { error: 'forbidden' });
      const status = query.status || '';
      const list = status ? orders.filter((o) => o.status === status) : orders.slice();
      return send(res, 200, list);
    }
    if (req.method === 'PUT' && pathname.startsWith('/admin/orders/')) {
      const me = requireAuth(req);
      if (!me || !['washer', 'receptionist', 'admin'].includes(me.role)) return send(res, 403, { error: 'forbidden' });
      const id = Number(pathname.split('/').pop());
      const body = await parseBody(req);
      const order = orders.find((o) => o.order_id === id);
      if (!order) return send(res, 404, { error: 'order_not_found' });
      if (body.status) order.status = body.status;
      return send(res, 200, order);
    }

    // Default 404
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    return send(res, 500, { error: 'server_error', message: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`New backend running on ${PORT}`);
});
