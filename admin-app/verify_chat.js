const io = require('socket.io-client');
const axios = require('axios');

const API_URL = 'http://127.0.0.1:5000';
const SOCKET_URL = 'http://127.0.0.1:5000';

async function registerUser(user) {
    try {
        const response = await axios.post(`${API_URL}/auth/register`, user);
        console.log(`Registered ${user.role}: ${user.phone_number}`);
        return response.data;
    } catch (error) {
        if (error.response && (error.response.status === 400 || error.response.status === 409)) {
            console.log(`User ${user.phone_number} already exists.`);
        } else {
            console.error(`Failed to register ${user.role}:`, error.message, error.code);
        }
        return null;
    }
}

async function loginUser(phone, password) {
    try {
        const response = await axios.post(`${API_URL}/auth/login`, {
            phone_number: phone,
            password: password
        });
        return response.data.token;
    } catch (error) {
        console.error(`Login failed for ${phone}:`, error.response?.data || error.message || error.code);
        throw error;
    }
}

async function testChat() {
    try {
        console.log('--- Starting Chat Verification ---');

        const timestamp = Date.now();
        const suffix = timestamp.toString().slice(-8);
        const adminPhone = `090${suffix}`;
        const washerPhone = `080${suffix}`;
        const studentPhone = `070${suffix}`;
        const riderPhone = `091${suffix}`;

         // 1. Register Users
         await registerUser({
             full_name: 'Test Admin',
             email: `admin_${timestamp}@test.com`,
             phone_number: adminPhone,
             password: 'password123',
             role: 'admin'
         });

         await registerUser({
             full_name: 'Test Washer',
             email: `washer_${timestamp}@test.com`,
             phone_number: washerPhone,
             password: 'password123',
             role: 'washer'
         });

        const studentData = await registerUser({
            full_name: 'Test User',
            email: `student_${timestamp}@test.com`,
            phone_number: studentPhone,
            password: 'password123',
            role: 'user'
        });

         const studentId = studentData?.user?.user_id;
        const riderData = await registerUser({
            full_name: 'Test Rider',
            email: `rider_${timestamp}@test.com`,
            phone_number: riderPhone,
            password: 'password123',
            role: 'rider'
        });
        const riderId = riderData?.user?.user_id;

         // 2. Login
         console.log('Logging in as Admin...');
         const adminToken = await loginUser(adminPhone, 'password123');
         console.log('Admin logged in.');

         console.log('Logging in as Washer...');
         const washerToken = await loginUser(washerPhone, 'password123');
         console.log('Washer logged in.');

        console.log('Logging in as User...');
         const studentToken = await loginUser(studentPhone, 'password123');
        console.log('User logged in.');
        
        console.log('Logging in as Rider...');
        const riderToken = await loginUser(riderPhone, 'password123');
        console.log('Rider logged in.');

         // 3. Create Order
         console.log('Creating Order for Chat Test...');
         
         let orderId;
         if (studentId) {
             try {
                 const orderRes = await axios.post(`${API_URL}/admin/orders`, {
                     user_id: studentId,
                     pickup_date: '2026-02-10',
                     pickup_time: '10:00 AM',
                     clothes_count: 5,
                     notes: 'Test Order for Chat',
                     pickup_address: 'Test Hostel',
                     delivery_address: 'Test Hostel'
                 }, { headers: { Authorization: `Bearer ${adminToken}` } });
                 orderId = orderRes.data.order_id || orderRes.data.id;
                 console.log(`Order created: ${orderId}`);
             } catch (e) {
                 console.error('Failed to create order:', e.response?.data || e.message);
             }
         } else {
             console.error('Student ID not available, skipping order creation');
         }
         
         if (!orderId) {
             console.error('Cannot proceed without Order ID');
             return;
         }

        if (riderId) {
            try {
                await axios.post(`${API_URL}/admin/orders/${orderId}/accept`, {
                    rider_id: riderId
                }, { headers: { Authorization: `Bearer ${adminToken}` } });
                await axios.put(`${API_URL}/admin/orders/${orderId}/status`, {
                    status: 'delivered'
                }, { headers: { Authorization: `Bearer ${adminToken}` } });
            } catch (e) {
                console.error('Failed to assign rider or lock order:', e.response?.data || e.message);
            }
        } else {
            console.error('Rider ID not available, skipping rider assignment');
        }

         // 4. Test Washer Connection (Should Fail)

        // 3. Test Washer Connection (Should Fail)
        console.log('Testing Washer Chat Access (Should Fail)...');
        const washerSocket = io(SOCKET_URL, {
            auth: { token: washerToken },
            transports: ['websocket', 'polling'],
            forceNew: true
        });

        washerSocket.on('connect_error', (err) => {
            console.log('✅ Washer Connection Rejected:', err.message);
            washerSocket.disconnect();
        });

        washerSocket.on('connect', () => {
            console.error('❌ Washer Connected (Should have failed)!');
            washerSocket.disconnect();
        });

        // 4. Test Admin Connection (Should Succeed)
        console.log('Testing Admin Chat Access (Should Succeed)...');
        const adminSocket = io(SOCKET_URL, {
            auth: { token: adminToken },
            transports: ['websocket', 'polling'],
            forceNew: true
        });

        adminSocket.on('connect', () => {
            console.log('✅ Admin Connected to Socket');
            
            // Join a room
            adminSocket.emit('join_room', { orderId: orderId });
        });

        adminSocket.on('history', (msgs) => {
             console.log(`✅ Admin Joined Room (History: ${msgs.length} msgs)`);
             connectRider();
        });

        let studentSocket;
        let riderSocket;
        let studentRejoined = false;
        let verificationDone = false;

        function connectRider() {
            console.log('Connecting Rider...');
            riderSocket = io(SOCKET_URL, {
                auth: { token: riderToken },
                transports: ['websocket', 'polling'],
                forceNew: true
            });

            riderSocket.on('connect', () => {
                console.log('✅ Rider Connected');
                riderSocket.emit('join_room', { orderId: orderId });
            });

            riderSocket.on('history', () => {
                riderSocket.emit('send_message', { orderId: orderId, message: 'Rider still messaging' }, (ack) => {
                    if (ack && ack.status === 'ok') {
                        console.log('✅ Rider Send Verified');
                        connectStudent();
                    } else {
                        console.error('❌ Rider Send Failed');
                        process.exit(1);
                    }
                });
            });

            riderSocket.on('error', (err) => {
                console.error('❌ Rider Socket Error:', err);
                process.exit(1);
            });
        }

        function connectStudent() {
            console.log('Connecting Student...');
            studentSocket = io(SOCKET_URL, {
                auth: { token: studentToken },
                transports: ['websocket', 'polling'],
                forceNew: true
            });

            studentSocket.on('connect', () => {
                console.log('✅ Student Connected');
                studentSocket.emit('join_room', { orderId: orderId });
            });

            studentSocket.on('history', (msgs) => {
                 console.log(`✅ Student Joined Room (History: ${msgs.length} msgs)`);
                 if (!studentRejoined) {
                    studentSocket.emit('send_message', { orderId: orderId, message: 'Hello Admin' });
                 } else if (msgs.length > 0) {
                    console.log('✅ History Persistence Verified');
                    verificationDone = true;
                    process.exit(0);
                 }
            });

            studentSocket.on('receive_message', (msg) => {
                console.log(`✅ Student received: ${msg.message}`);
                studentSocket.emit('typing', { orderId, isTyping: true });
            });
            
            studentSocket.on('typing', (data) => {
                console.log('✅ Student saw someone typing:', data);
            });

            // Admin listens for typing
            adminSocket.on('typing', (data) => {
                console.log('✅ Admin saw someone typing:', data);
                if (!studentRejoined) {
                  studentRejoined = true;
                  studentSocket.disconnect();
                  setTimeout(() => {
                    connectStudent();
                  }, 500);
                }
            });
        }

        adminSocket.on('receive_message', (msg) => {
            console.log('✅ Admin received message:', msg.message);
        });

        adminSocket.on('error', (err) => {
            console.error('❌ Admin Socket Error:', err);
        });

        setTimeout(() => {
            if (verificationDone) return;
            if (adminSocket.connected) {
                console.log('Closing Admin Socket...');
                adminSocket.disconnect();
            }
            if (washerSocket.connected) {
                washerSocket.disconnect();
            }
            if (riderSocket && riderSocket.connected) {
                riderSocket.disconnect();
            }
            if (studentSocket && studentSocket.connected) {
                studentSocket.disconnect();
            }
            console.log('--- Verification Timed Out ---');
            process.exit(1);
        }, 15000);

    } catch (error) {
        console.error('Test Failed:', error.message);
    }
}

testChat();
