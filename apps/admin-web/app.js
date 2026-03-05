import { config, auth, admin } from '../shared/api.js';
config.setBaseUrl('http://localhost:5100');
const e = React.createElement;
function App() {
  const [screen, setScreen] = React.useState('login');
  const [user, setUser] = React.useState(null);
  const [plans, setPlans] = React.useState([]);
  const [form, setForm] = React.useState({ name: '', price: '', duration_days: '', max_pickups: '', description: '' });
  const [metrics, setMetrics] = React.useState({ todayOrders: 0, awaiting: 0, processing: 0, ready: 0, delivered: 0 });
  const login = async () => {
    const res = await auth.login({ phone_number: '09000000000', password: 'admin' }).catch(() => null);
    if (res) { setUser(res.user); setScreen('dashboard'); loadPlans(); }
  };
  const loadPlans = async () => { const list = await admin.listPlans().catch(() => []); setPlans(list); };
  const submitPlan = async () => {
    const payload = { name: form.name, price: Number(form.price), duration_days: Number(form.duration_days), max_pickups: Number(form.max_pickups), description: form.description };
    await admin.createPlan(payload).catch(() => null);
    setForm({ name: '', price: '', duration_days: '', max_pickups: '', description: '' });
    loadPlans();
  };
  if (screen === 'login') {
    return e('div', { className: 'container' },
      e('div', { className: 'card' },
        e('h2', null, 'Head Admin Login'),
        e('button', { className: 'btn', onClick: login }, 'Login Demo Admin')
      )
    );
  }
  if (screen === 'dashboard') {
    return e('div', { className: 'container' },
      e('div', { className: 'card' }, e('h2', null, 'Plan Management'),
        e('div', { className: 'row' },
          e('input', { placeholder: 'Name', value: form.name, onChange: (ev) => setForm({ ...form, name: ev.target.value }) }),
          e('input', { placeholder: 'Price', value: form.price, onChange: (ev) => setForm({ ...form, price: ev.target.value }) })
        ),
        e('div', { className: 'row' },
          e('input', { placeholder: 'Duration Days', value: form.duration_days, onChange: (ev) => setForm({ ...form, duration_days: ev.target.value }) }),
          e('input', { placeholder: 'Max Pickups', value: form.max_pickups, onChange: (ev) => setForm({ ...form, max_pickups: ev.target.value }) })
        ),
        e('textarea', { placeholder: 'Description', value: form.description, onChange: (ev) => setForm({ ...form, description: ev.target.value }) }),
        e('div', { style: { marginTop: 12 } }, e('button', { className: 'btn', onClick: submitPlan }, 'Create'))
      ),
      e('div', { className: 'card' },
        e('h2', null, 'Plans'),
        e('div', null, plans.map(p => e('div', { key: p.plan_id, className: 'row-between' }, e('div', null, `${p.name} • ₦${p.price}`), e('div', null, `${p.duration_days}d • ${p.max_pickups} pickups`))))
      )
    );
  }
  return e('div', null);
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
