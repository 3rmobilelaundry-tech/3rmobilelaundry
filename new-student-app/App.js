import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { auth, student, config } from '../new-shared/api';
config.setBaseUrl('http://localhost:5100');
const Button = ({ title, onPress, disabled }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={{ backgroundColor: '#0EA5A8', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: disabled ? 0.6 : 1 }}>
    {disabled ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>{title}</Text>}
  </TouchableOpacity>
);
const Tile = ({ title, sub, color, onPress }) => (
  <TouchableOpacity onPress={onPress} style={{ flex: 1, backgroundColor: color || '#fff', borderRadius: 16, padding: 14, marginRight: 10 }}>
    <Text style={{ color: color ? '#fff' : '#111827', fontWeight: 'bold', marginTop: 6 }}>{title}</Text>
    {sub ? <Text style={{ color: color ? '#ECFEFF' : '#6B7280', fontSize: 12 }}>{sub}</Text> : null}
  </TouchableOpacity>
);
export default function App() {
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [orders, setOrders] = useState([]);
  const [navLock, setNavLock] = useState(false);
  const safeNav = (next) => { if (navLock) return; setNavLock(true); setScreen(next); setTimeout(() => setNavLock(false), 600); };
  const login = async () => {
    if (!phone || !password) return;
    setLoading(true);
    try {
      const { user: u } = await auth.login({ phone_number: phone, password });
      setUser(u);
      safeNav('home');
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const loadHome = async () => {
    if (!user) return;
    try {
      const p = await student.getPlans();
      setPlans(p);
      const s = await student.getSubscription(user.user_id);
      setSubscription(s);
      const o = await student.getOrders(user.user_id);
      setOrders(o);
    } catch {}
  };
  if (screen === 'login') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#F8FAFC' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>Student Login</Text>
        <TextInput style={{ borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: '#fff' }} placeholder="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextInput style={{ borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: '#fff' }} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Login" onPress={login} disabled={loading} />
      </View>
    );
  }
  if (screen === 'home') {
    loadHome();
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 16 }}>
        {subscription ? (
          <View style={{ backgroundColor: '#0EA5A8', borderRadius: 20, padding: 16, marginBottom: 18 }}>
            <Text style={{ color: '#D1FAE5', fontSize: 12, letterSpacing: 1 }}>CURRENT PLAN</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{subscription.Plan?.name}</Text>
              <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>ACTIVE</Text>
              </View>
            </View>
            <Text style={{ color: '#ECFEFF', marginTop: 12 }}>{subscription.remaining_pickups} pickups remaining</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: '#0EA5A8', borderRadius: 20, padding: 16, marginBottom: 18 }}>
            <Text style={{ color: '#D1FAE5', fontSize: 12, letterSpacing: 1 }}>NO ACTIVE PLAN</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Subscribe Now</Text>
            </View>
            <Text style={{ color: '#ECFEFF' }}>Get regular pickups at a discount</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Tile title="Book Pickup" sub="Schedule a new pickup" color="#0EA5A8" onPress={() => safeNav('book')} />
          <Tile title="My Orders" sub="View all orders" onPress={() => safeNav('orders')} />
        </View>
      </View>
    );
  }
  if (screen === 'book') {
    const [date, setDate] = useState(null);
    const [time, setTime] = useState(null);
    const [count, setCount] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    
    const [availableDates, setAvailableDates] = useState([]);
    const [availableTimes, setAvailableTimes] = useState([]);

    useEffect(() => {
        student.getConfig().then(res => {
            const window = res.pickup_window;
            if (window) {
                 const targetDay = window.day;
                 const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                 const targetIdx = days.indexOf(targetDay);
                 const nextDates = [];
                 let d = new Date();
                 for(let i=0; i<60; i++){
                     if(d.getDay() === targetIdx) {
                         const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                         const value = d.toISOString().split('T')[0];
                         nextDates.push({ label, value });
                         if(nextDates.length >= 6) break;
                     }
                     d.setDate(d.getDate() + 1);
                 }
                 setAvailableDates(nextDates);

                 const times = [];
                 if(window.blocks){
                     ['morning', 'afternoon', 'evening'].forEach(k => {
                         const b = window.blocks[k];
                         if(b) times.push({ label: `${k} (${b.start}-${b.end})`, value: `${b.start} - ${b.end}` });
                     });
                 }
                 setAvailableTimes(times);
            }
        });
    }, []);

    const confirm = async () => {
      if (busy || !user) return;
      if (!date || !time) return;
      const c = parseInt(count);
      if (isNaN(c) || c <= 0) return;
      setBusy(true);
      try {
        await student.bookPickup({ 
            user_id: user.user_id, 
            pickup_date: date.value, 
            pickup_time: time.value,
            clothes_count: c, 
            extra_clothes: 0, 
            notes 
        });
        safeNav('home');
      } catch {
      } finally {
        setBusy(false);
      }
    };

    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: 'bold' }}>Book Pickup</Text>
        <Text style={{ color: '#6B7280', marginBottom: 12 }}>Schedule a laundry pickup</Text>
        
        <Text style={{ marginTop: 10, fontWeight: 'bold', marginBottom: 6 }}>Pickup Date</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {availableDates.map(d => (
                <TouchableOpacity key={d.value} onPress={() => setDate(d)} style={{ padding: 10, backgroundColor: date?.value === d.value ? '#0EA5A8' : '#eee', borderRadius: 8, margin: 4 }}>
                    <Text style={{ color: date?.value === d.value ? '#fff' : '#000' }}>{d.label}</Text>
                </TouchableOpacity>
            ))}
        </View>

        <Text style={{ marginTop: 16, fontWeight: 'bold', marginBottom: 6 }}>Pickup Time</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {availableTimes.map(t => (
                <TouchableOpacity key={t.value} onPress={() => setTime(t)} style={{ padding: 10, backgroundColor: time?.value === t.value ? '#0EA5A8' : '#eee', borderRadius: 8, margin: 4 }}>
                    <Text style={{ color: time?.value === t.value ? '#fff' : '#000' }}>{t.label}</Text>
                </TouchableOpacity>
            ))}
        </View>

        <TextInput style={{ borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: '#fff', marginTop: 16 }} placeholder="Clothes Count" value={count} onChangeText={setCount} keyboardType="numeric" />
        <TextInput style={{ borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: '#fff' }} placeholder="Notes" value={notes} onChangeText={setNotes} />
        <Button title="Confirm" onPress={confirm} disabled={busy} />
      </View>
    );
  }
  if (screen === 'orders') {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>My Orders</Text>
        {orders.map((o) => (
          <View key={o.order_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <Text style={{ fontWeight: 'bold', color: '#111827' }}>Order #{o.order_id}</Text>
            <Text style={{ color: '#6B7280', marginTop: 4 }}>Status {o.status}</Text>
            <Text style={{ color: '#6B7280', marginTop: 4 }}>Pickup {o.pickup_date} • {o.pickup_time || o.pickup_time_slot}</Text>
            <Text style={{ color: '#6B7280', marginTop: 4 }}>Clothes {o.clothes_count} (+{o.extra_clothes} extra)</Text>
          </View>
        ))}
        <Button title="Back" onPress={() => safeNav('home')} />
      </View>
    );
  }
  return <View />;
}
