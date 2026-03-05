import { config, auth, admin } from './api.js';
config.setBaseUrl('http://localhost:5100');
const e = React.createElement;

// Admin credentials for testing
const ADMIN_CREDENTIALS = {
  phone: '08069090488',
  password: 'admin123'
};

function App() {
  const [screen, setScreen] = React.useState('staffLogin');
  const [user, setUser] = React.useState(null);
  const [plans, setPlans] = React.useState([]);
  const [form, setForm] = React.useState({ name: '', price: '', duration_days: '', max_pickups: '', description: '' });
  const [staffForm, setStaffForm] = React.useState({ phone: '', password: '' });
  const [adminForm, setAdminForm] = React.useState({ phone: '', password: '' });
  const [metrics, setMetrics] = React.useState({ todayOrders: 0, awaiting: 0, processing: 0, ready: 0, delivered: 0 });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  
  const staffLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await auth.login({ phone_number: staffForm.phone, password: staffForm.password }).catch((err) => null);
      if (res) { 
        setUser(res.user); 
        setScreen('dashboard'); 
        loadPlans(); 
        setStaffForm({ phone: '', password: '' });
      } else {
        setError('Invalid credentials. Please try again.');
      }
    } catch (err) {
      setError('Login failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };
  
  const adminLogin = async () => {
    setLoading(true);
    setError('');
    try {
      // Check if it's the hardcoded admin account
      if (adminForm.phone === ADMIN_CREDENTIALS.phone && adminForm.password === ADMIN_CREDENTIALS.password) {
        // Set admin user directly for demo
        setUser({ 
          user_id: 'admin_001', 
          phone_number: adminForm.phone, 
          full_name: 'Head Admin',
          role: 'admin'
        }); 
        setScreen('dashboard'); 
        loadPlans();
        setAdminForm({ phone: '', password: '' });
        return;
      }
      
      // Try to authenticate through backend API
      const res = await auth.login({ phone_number: adminForm.phone, password: adminForm.password }).catch(() => null);
      if (res) { 
        setUser(res.user); 
        setScreen('dashboard'); 
        loadPlans(); 
        setAdminForm({ phone: '', password: '' });
      } else {
        setError('Invalid admin credentials.');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  const loadPlans = async () => { const list = await admin.listPlans().catch(() => []); setPlans(list); };
  const submitPlan = async () => {
    const payload = { name: form.name, price: Number(form.price), duration_days: Number(form.duration_days), max_pickups: Number(form.max_pickups), description: form.description };
    await admin.createPlan(payload).catch(() => null);
    setForm({ name: '', price: '', duration_days: '', max_pickups: '', description: '' });
    loadPlans();
  };
  const logout = () => {
    setUser(null);
    setStaffForm({ phone: '', password: '' });
    setAdminForm({ phone: '', password: '' });
    setError('');
    setScreen('staffLogin');
  };

  if (screen === 'staffLogin') {
    return e('div', { className: 'login-container' },
      e('div', { className: 'login-card' },
        e('h2', null, 'Staff Login'),
        e('p', { className: 'subtitle' }, 'Enter your credentials to continue'),
        error && e('div', { style: { color: '#EF4444', marginBottom: '16px', padding: '12px', backgroundColor: '#FEE2E2', borderRadius: '8px', fontSize: '14px' } }, error),
        e('div', { className: 'form-group' },
          e('label', null, 'Phone Number'),
          e('input', { type: 'text', placeholder: '08012345678', value: staffForm.phone, onChange: (ev) => setStaffForm({ ...staffForm, phone: ev.target.value }), disabled: loading })
        ),
        e('div', { className: 'form-group' },
          e('label', null, 'Password'),
          e('input', { type: 'password', placeholder: 'Enter your password', value: staffForm.password, onChange: (ev) => setStaffForm({ ...staffForm, password: ev.target.value }), disabled: loading })
        ),
        e('button', { className: 'btn', onClick: staffLogin, disabled: loading }, loading ? 'Logging in...' : 'Login'),
        e('button', { className: 'btn btn-secondary', onClick: () => { setAdminForm({ phone: '', password: '' }); setError(''); setScreen('adminLogin'); }, disabled: loading }, 'Admin Login')
      )
    );
  }

  if (screen === 'adminLogin') {
    return e('div', { className: 'login-container' },
      e('div', { className: 'login-card' },
        e('h2', null, 'Head Admin Login'),
        e('p', { className: 'subtitle' }, 'Admin access only'),
        error && e('div', { style: { color: '#EF4444', marginBottom: '16px', padding: '12px', backgroundColor: '#FEE2E2', borderRadius: '8px', fontSize: '14px' } }, error),
        e('div', { className: 'form-group' },
          e('label', null, 'Phone Number'),
          e('input', { type: 'text', placeholder: '08069090488', value: adminForm.phone, onChange: (ev) => setAdminForm({ ...adminForm, phone: ev.target.value }), disabled: loading })
        ),
        e('div', { className: 'form-group' },
          e('label', null, 'Password'),
          e('input', { type: 'password', placeholder: 'Enter your password', value: adminForm.password, onChange: (ev) => setAdminForm({ ...adminForm, password: ev.target.value }), disabled: loading })
        ),
        e('button', { className: 'btn', onClick: adminLogin, disabled: loading }, loading ? 'Logging in...' : 'Login'),
        e('button', { className: 'btn btn-secondary', onClick: () => { setStaffForm({ phone: '', password: '' }); setError(''); setScreen('staffLogin'); }, disabled: loading }, 'Back to Staff Login')
      )
    );
  }
  if (screen === 'dashboard') {
    return e('div', { className: 'dashboard-container' },
      e('div', { className: 'dashboard-header' },
        e('h1', null, '3R Laundry Admin Dashboard'),
        e('button', { className: 'btn logout-btn', onClick: logout }, 'Logout')
      ),
      e('div', { className: 'card' },
        e('h3', null, 'Welcome, ' + (user?.full_name || 'Admin')),
        e('p', null, 'Role: ' + (user?.role?.toUpperCase() || 'ADMIN'))
      ),
      e('div', { className: 'card' }, 
        e('h3', null, 'Plan Management'),
        e('div', { className: 'row' },
          e('input', { placeholder: 'Name', value: form.name, onChange: (ev) => setForm({ ...form, name: ev.target.value }) }),
          e('input', { placeholder: 'Price', value: form.price, onChange: (ev) => setForm({ ...form, price: ev.target.value }) })
        ),
        e('div', { className: 'row' },
          e('input', { placeholder: 'Duration Days', value: form.duration_days, onChange: (ev) => setForm({ ...form, duration_days: ev.target.value }) }),
          e('input', { placeholder: 'Max Pickups', value: form.max_pickups, onChange: (ev) => setForm({ ...form, max_pickups: ev.target.value }) })
        ),
        e('textarea', { placeholder: 'Description', value: form.description, onChange: (ev) => setForm({ ...form, description: ev.target.value }) }),
        e('button', { className: 'btn', onClick: submitPlan, style: { marginTop: '12px' } }, 'Create Plan')
      ),
      e('div', { className: 'card' },
        e('h3', null, 'Plans'),
        plans.length === 0 ? 
          e('p', { style: { color: '#64748B' } }, 'No plans available') :
          e('div', null, plans.map(p => e('div', { key: p.plan_id, className: 'row-between' }, 
            e('div', null, e('strong', null, p.name), e('br', null), '₦' + p.price), 
            e('div', null, p.duration_days + ' days • ' + p.max_pickups + ' pickups')
          )))
      )
    );
  }
  return e('div', null);
}
ReactDOM.createRoot(document.getElementById('root')).render(e(App));
