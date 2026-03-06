import { config, auth, admin } from './api.js';
config.setBaseUrl('http://localhost:5100');
const e = React.createElement;

// helper regex
const PHONE_REGEX = /^0(70|80|81|90|91)\d{8}$/;
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

function App() {
  const [route, setRoute] = React.useState(window.location.pathname);
  const [user, setUser] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (token) {
      config.setAuthToken(token);
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          localStorage.removeItem('user');
        }
      }
    }
  }, []);

  React.useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      setRoute(path);
    }
  };

  const handleLogout = () => {
    setUser(null);
    config.setAuthToken('');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const redirectDashboard = (u) => {
    if (!u) return;
    let rolePath = u.role === 'head_admin' ? 'head-admin' : u.role;
    navigate(`/dashboard/${rolePath}`);
  };

  React.useEffect(() => {
    if (user && ['/', '/welcome', '/login', '/signup'].includes(route)) {
      redirectDashboard(user);
    }
  }, [user, route]);

  const handleLogin = async ({ phone, password }) => {
    setLoading(true);
    setError('');
    try {
      const res = await auth.login({ phone_number: phone, password });
      const u = res.user || {};
      setUser(u);
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(u));
      config.setAuthToken(res.token);
      redirectDashboard(u);
    } catch (err) {
      setError(err?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async ({ name, phone, email, role, password }) => {
    setLoading(true);
    setError('');
    try {
      const res = await auth.register({ full_name: name, phone_number: phone, email, password, role });
      if (res.token) {
        const u = res.user || {};
        setUser(u);
        localStorage.setItem('token', res.token);
        localStorage.setItem('user', JSON.stringify(u));
        config.setAuthToken(res.token);
        redirectDashboard(u);
      } else {
        setError('Signup successful, please verify your email before logging in.');
        navigate('/login');
      }
    } catch (err) {
      setError(err?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  if (route === '/' || route === '/welcome') {
    return e(Welcome, { navigate });
  }
  if (route === '/login') {
    return e(Login, { onLogin: handleLogin, loading, error, navigate });
  }
  if (route === '/signup') {
    return e(SignUp, { onSignup: handleSignup, loading, error, navigate });
  }
  if (route.startsWith('/dashboard')) {
    return e(Dashboard, { user, logout: handleLogout, navigate });
  }
  return e('div', null, '404 - Page not found');
}

function Welcome({ navigate }) {
  return e('div', { className: 'login-container' },
    e('div', { className: 'login-card' },
      e('h2', null, '3R Mobile Laundry Admin'),
      e('div', { className: 'button-group' },
        e('button', { className: 'btn', onClick: () => navigate('/login') }, 'Login'),
        e('button', { className: 'btn btn-secondary', onClick: () => navigate('/signup') }, 'Sign Up')
      )
    )
  );
}

function Login({ onLogin, loading, error, navigate }) {
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [fieldError, setFieldError] = React.useState('');

  const submit = () => {
    if (!phone || !password) {
      setFieldError('Phone number and password are required');
      return;
    }
    if (!PHONE_REGEX.test(phone)) {
      setFieldError('Enter a valid Nigerian phone number');
      return;
    }
    setFieldError('');
    onLogin({ phone, password });
  };

  return e('div', { className: 'login-container' },
    e('div', { className: 'login-card' },
      e('h2', null, 'Login'),
      e('p', { className: 'subtitle' }, 'Enter your credentials to continue'),
      (error || fieldError) && e('div', { style: { color: '#EF4444', marginBottom: '16px', padding: '12px', backgroundColor: '#FEE2E2', borderRadius: '8px', fontSize: '14px' } }, error || fieldError),
      e('div', { className: 'form-group' },
        e('label', null, 'Phone Number'),
        e('input', { type: 'text', placeholder: '08012345678', value: phone, onChange: (ev) => setPhone(ev.target.value), disabled: loading })
      ),
      e('div', { className: 'form-group' },
        e('label', null, 'Password'),
        e('div', { style: { position: 'relative' } },
          e('input', { type: showPassword ? 'text' : 'password', placeholder: 'Enter your password', value: password, onChange: (ev) => setPassword(ev.target.value), disabled: loading }),
          e('span', { onClick: () => setShowPassword(!showPassword), style: { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#64748B' } }, showPassword ? '🙈' : '👁')
        )
      ),
      e('button', { className: 'btn', onClick: submit, disabled: loading }, loading ? 'Logging in...' : 'Login'),
      e('button', { className: 'btn btn-secondary', onClick: () => navigate('/signup'), disabled: loading }, 'Sign Up')
    )
  );
}

function SignUp({ onSignup, loading, error, navigate }) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('head_admin');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [fieldError, setFieldError] = React.useState('');

  const submit = () => {
    if (!name || !phone || !email || !role || !password || !confirm) {
      setFieldError('All fields are required');
      return;
    }
    if (!PHONE_REGEX.test(phone)) {
      setFieldError('Enter a valid Nigerian phone number');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      setFieldError('Enter a valid email address');
      return;
    }
    if (password.length < 6) {
      setFieldError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setFieldError('Passwords do not match');
      return;
    }
    setFieldError('');
    onSignup({ name, phone, email, role, password });
  };

  return e('div', { className: 'login-container' },
    e('div', { className: 'login-card' },
      e('h2', null, 'Sign Up'),
      e('p', { className: 'subtitle' }, 'Create an account'),
      (error || fieldError) && e('div', { style: { color: '#EF4444', marginBottom: '16px', padding: '12px', backgroundColor: '#FEE2E2', borderRadius: '8px', fontSize: '14px' } }, error || fieldError),
      e('div', { className: 'form-group' },
        e('label', null, 'Name'),
        e('input', { type: 'text', placeholder: 'Your full name', value: name, onChange: (ev) => setName(ev.target.value), disabled: loading })
      ),
      e('div', { className: 'form-group' },
        e('label', null, 'Phone Number'),
        e('input', { type: 'text', placeholder: '08012345678', value: phone, onChange: (ev) => setPhone(ev.target.value), disabled: loading })
      ),
      e('div', { className: 'form-group' },
        e('label', null, 'Email'),
        e('input', { type: 'text', placeholder: 'you@example.com', value: email, onChange: (ev) => setEmail(ev.target.value), disabled: loading })
      ),
      e('div', { className: 'form-group' },
        e('label', null, 'Role'),
        e('select', { value: role, onChange: (ev) => setRole(ev.target.value), disabled: loading },
          e('option', { value: 'head_admin' }, 'Head Admin'),
          e('option', { value: 'washer' }, 'Washer'),
          e('option', { value: 'receptionist' }, 'Receptionist'),
          e('option', { value: 'rider' }, 'Rider')
        )
      ),
      e('div', { className: 'form-group' },
        e('label', null, 'Password'),
        e('div', { style: { position: 'relative' } },
          e('input', { type: showPassword ? 'text' : 'password', placeholder: 'Create a password', value: password, onChange: (ev) => setPassword(ev.target.value), disabled: loading }),
          e('span', { onClick: () => setShowPassword(!showPassword), style: { position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#64748B' } }, showPassword ? '🙈' : '👁')
        )
      ),
      e('div', { className: 'form-group' },
        e('label', null, 'Confirm Password'),
        e('input', { type: showPassword ? 'text' : 'password', placeholder: 'Repeat password', value: confirm, onChange: (ev) => setConfirm(ev.target.value), disabled: loading })
      ),
      e('button', { className: 'btn', onClick: submit, disabled: loading }, loading ? 'Signing up...' : 'Sign Up'),
      e('button', { className: 'btn btn-secondary', onClick: () => navigate('/login'), disabled: loading }, 'Already have an account')
    )
  );
}

function Dashboard({ user, logout, navigate }) {
  const [plans, setPlans] = React.useState([]);
  const [form, setForm] = React.useState({ name: '', price: '', duration_days: '', max_pickups: '', description: '' });

  React.useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    loadPlans();
  }, [user]);

  const loadPlans = async () => {
    const list = await admin.listPlans().catch(() => []);
    setPlans(list);
  };
  const submitPlan = async () => {
    const payload = { name: form.name, price: Number(form.price), duration_days: Number(form.duration_days), max_pickups: Number(form.max_pickups), description: form.description };
    await admin.createPlan(payload).catch(() => null);
    setForm({ name: '', price: '', duration_days: '', max_pickups: '', description: '' });
    loadPlans();
  };

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

ReactDOM.createRoot(document.getElementById('root')).render(e(App));
