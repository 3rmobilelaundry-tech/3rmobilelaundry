import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { auth, admin, student, config } from '../shared/api';
config.setBaseUrl('http://localhost:5100');
const Button = ({ title, onPress, disabled, color }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={{ backgroundColor: color || '#0EA5A8', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: disabled ? 0.6 : 1 }}>
    {disabled ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>{title}</Text>}
  </TouchableOpacity>
);
export default function App() {
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [orders, setOrders] = useState([]);
  const [pickupWindow, setPickupWindow] = useState(null);
  const [navLock, setNavLock] = useState(false);
  const safeNav = (next) => { if (navLock) return; setNavLock(true); setScreen(next); setTimeout(() => setNavLock(false), 600); };
  const login = async () => {
    setLoading(true);
    try {
      const { user: u } = await auth.login({ phone_number: phone, password });
      if (u.role === 'student') return;
      setUser(u);
      safeNav('dashboard');
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const loadOrders = async () => {
    try {
      let status = '';
      if (user.role === 'rider') status = 'awaiting_pickup';
      if (user.role === 'washer') status = 'processing';
      if (user.role === 'receptionist') status = 'ready';
      const list = await admin.getOrders(status);
      setOrders(list);
    } catch {}
  };
  useEffect(() => { 
      if (screen === 'dashboard' && user) {
          loadOrders(); 
          student.getConfig().then(res => setPickupWindow(res.pickup_window)).catch(() => {});
      }
  }, [screen, user]);
  const updateStatus = async (id, status) => {
    if (!user) return;
    try {
      await admin.updateOrderStatus(id, status);
      loadOrders();
    } catch {}
  };
  if (screen === 'login') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#F8FAFC' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>Staff Login</Text>
        <TextInput style={{ borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: '#fff' }} placeholder="Phone Number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextInput style={{ borderWidth: 1, borderColor: '#E5E7EB', padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: '#fff' }} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Login" onPress={login} disabled={loading} />
      </View>
    );
  }
  if (screen === 'dashboard') {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC', padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Staff Portal: {user.role.toUpperCase()}</Text>
        <Text style={{ fontSize: 18, color: '#555', marginBottom: 12 }}>Welcome, {user.full_name}</Text>
        
        {pickupWindow && (
            <View style={{ marginBottom: 16, padding: 12, backgroundColor: '#E0F2FE', borderRadius: 8 }}>
                <Text style={{ color: '#0369A1', fontWeight: 'bold', marginBottom: 4 }}>Global Pickup Schedule</Text>
                <Text style={{ color: '#0369A1' }}>Day: {pickupWindow.day}</Text>
                {pickupWindow.blocks && Object.entries(pickupWindow.blocks).map(([k, v]) => (
                    <Text key={k} style={{ color: '#0369A1' }}>{k.charAt(0).toUpperCase() + k.slice(1)}: {v.start} - {v.end}</Text>
                ))}
            </View>
        )}

        {orders.map((item) => (
          <View key={item.order_id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <Text style={{ fontWeight: 'bold' }}>Order #{item.order_id} - {item.status.toUpperCase()}</Text>
            <Text>Clothes: {item.clothes_count}</Text>
            <View style={{ flexDirection: 'row', marginTop: 10, justifyContent: 'flex-end' }}>
              {user.role === 'washer' && item.status === 'processing' && <Button title="Mark Ready" onPress={() => updateStatus(item.order_id, 'ready')} />}
              {(user.role === 'admin' || user.role === 'washer') && item.status === 'picked_up' && <Button title="Start Washing" onPress={() => updateStatus(item.order_id, 'processing')} color="orange" />}
            </View>
          </View>
        ))}
      </View>
    );
  }
  return <View />;
}
