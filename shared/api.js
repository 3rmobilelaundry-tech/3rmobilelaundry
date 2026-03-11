let BASE_URL = process.env.BASE_URL || 'http://localhost:5100';
let AUTH_TOKEN = '';
const setBaseUrl = (u) => { BASE_URL = u; };
const setAuthToken = (t) => { AUTH_TOKEN = t || ''; };
const req = async (method, path, body) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (AUTH_TOKEN) opts.headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE_URL}${path}`, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('api_error'), { status: r.status, data: j });
  return j;
};
export const auth = {
  register: (payload) => req('POST', '/auth/register', payload),
  login: async (payload) => {
    const res = await req('POST', '/auth/login', payload);
    setAuthToken(res.token);
    return res;
  }
};
export const student = {
  getPlans: () => req('GET', '/student/plans'),
  getSubscription: (user_id) => req('GET', `/student/subscription?user_id=${user_id}`),
  subscribe: (user_id, plan_id) => req('POST', '/student/subscribe', { user_id, plan_id }),
  getOrders: (user_id) => req('GET', `/student/orders?user_id=${user_id}`),
  bookPickup: (payload) => req('POST', '/student/book', payload),
  getConfig: () => req('GET', '/student/config'),
};
export const admin = {
  listPlans: () => req('GET', '/admin/plans'),
  createPlan: (payload) => req('POST', '/admin/plans', payload),
  updatePlan: (id, payload) => req('PUT', `/admin/plans/${id}`, payload),
  deletePlan: (id) => req('DELETE', `/admin/plans/${id}`),
  getOrders: (status) => req('GET', `/admin/orders${status ? `?status=${status}` : ''}`),
  updateOrderStatus: (id, status) => req('PUT', `/admin/orders/${id}`, { status }),
};
export const config = { setBaseUrl, setAuthToken };
