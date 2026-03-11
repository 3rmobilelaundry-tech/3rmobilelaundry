const jwt = require('jsonwebtoken');
const { User, ChatThread, ChatMessage, Order, sequelize, Notification } = require('../models');
const IntegrationService = require('./integrationService');
const { Op } = require('sequelize');
const { queueEmailNotification } = require('./syncService');

const normalizeChatId = (orderId) => {
  if (typeof orderId === 'number' && Number.isInteger(orderId) && orderId > 0) return orderId;
  if (typeof orderId === 'string' && /^\d+$/.test(orderId)) return parseInt(orderId, 10);
  return null;
};

const slugifyName = (name) => {
  if (!name || typeof name !== 'string') return null;
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || null;
};

const buildDisplayId = (user, roleOverride) => {
  if (!user) return null;
  const role = roleOverride || user.role;
  const slug = slugifyName(user.full_name);
  if (!slug) return null;
  return `${role}_${user.user_id}_${slug}`;
};

const requireDisplayId = (user, roleOverride) => {
  const role = roleOverride || user?.role;
  const displayId = buildDisplayId(user, role);
  if (displayId) return displayId;
  if (user?.user_id) return `${role}_${user.user_id}`;
  return null;
};

const buildStaffEmail = (title, message, meta = {}) => {
  const time = new Date().toISOString();
  const lines = [
    title,
    message,
    `Time: ${time}`
  ];
  if (meta.userId) lines.push(`User ID: ${meta.userId}`);
  if (meta.orderId) lines.push(`Order ID: ${meta.orderId}`);
  if (meta.details) lines.push(`Details: ${meta.details}`);
  return lines.join('\n');
};
const notifyAdmins = async ({ title, message, action, meta, actorUserId }) => {
  const admins = await User.findAll({ where: { role: 'admin' } });
  if (!admins.length) return;
  await Notification.bulkCreate(admins.map((admin) => ({
    user_id: admin.user_id,
    title,
    message,
    event_type: 'system',
    channel: 'app'
  })));
  const text = buildStaffEmail(title, message, meta);
  await Promise.all(admins.map((admin) => (
    queueEmailNotification({
      action,
      entityId: `admin:${action}:${admin.user_id}:${Date.now()}`,
      to: admin.email,
      subject: title,
      text,
      html: null,
      userId: admin.user_id,
      meta,
      source: 'chat',
      actorUserId
    })
  )));
};
const notifyActor = async (user, title, message) => {
  if (!user) return;
  await Notification.create({
    user_id: user.user_id,
    title,
    message,
    event_type: 'chat',
    channel: 'app'
  });
};

module.exports = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      await notifyAdmins({
        title: 'Chat auth error',
        message: 'Chat connection blocked: missing token.',
        action: 'chat_auth_missing_token',
        meta: { details: 'Missing token' },
        actorUserId: null
      });
      return next(new Error('Authentication error: Token required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      const user = await User.findByPk(decoded.user_id);
      
      if (!user) {
        await notifyAdmins({
          title: 'Chat auth error',
          message: 'Chat connection blocked: user not found.',
          action: 'chat_auth_user_not_found',
          meta: { details: 'User not found' },
          actorUserId: null
        });
        return next(new Error('Authentication error: User not found'));
      }
      
      const displayId = requireDisplayId(user);
      if (!displayId) {
        await notifyAdmins({
          title: 'Chat auth error',
          message: 'Chat connection blocked: missing name for ID formatting.',
          action: 'chat_auth_missing_display_id',
          meta: { userId: user.user_id, details: user.role },
          actorUserId: user.user_id
        });
        return next(new Error('Authentication error: Missing name for ID formatting'));
      }

      socket.user = user;
      socket.user_display_id = displayId;
      next();
    } catch (err) {
      await notifyAdmins({
        title: 'Chat auth error',
        message: 'Chat connection blocked: invalid token.',
        action: 'chat_auth_invalid_token',
        meta: { details: 'Invalid token' },
        actorUserId: null
      });
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.user_id} (${socket.user.role})`);

    socket.on('pickup_register', async ({ orderId } = {}) => {
      try {
        const user = socket.user;
        const rooms = [];
        if (['admin', 'head_admin', 'receptionist', 'washer', 'rider'].includes(user.role)) {
          socket.join('pickup_staff');
          rooms.push('pickup_staff');
        }
        if (user.role === 'student' || user.role === 'user') {
          const userRoom = `pickup_user_${user.user_id}`;
          socket.join(userRoom);
          rooms.push(userRoom);
        }
        if (orderId) {
          const normalizedOrderId = normalizeChatId(orderId);
          if (normalizedOrderId) {
            const order = await Order.findByPk(normalizedOrderId);
            if (order) {
              const isStaff = ['admin', 'head_admin', 'receptionist', 'washer'].includes(user.role);
              const isRider = user.role === 'rider' && order.assigned_rider_id === user.user_id;
              const isOwner = (user.role === 'student' || user.role === 'user') && order.user_id === user.user_id;
              if (isStaff || isRider || isOwner) {
                const orderRoom = `pickup_order_${normalizedOrderId}`;
                socket.join(orderRoom);
                rooms.push(orderRoom);
              }
            }
          }
        }
        socket.emit('pickup_registered', { rooms });
      } catch (err) {
        socket.emit('error', 'Pickup registration failed');
      }
    });

    socket.on('join_room', async ({ orderId }) => {
      try {
        const normalizedOrderId = normalizeChatId(orderId);
        if (!normalizedOrderId) {
          socket.emit('error', 'No order ID provided');
          return;
        }

        // Permission Check
        const order = await Order.findByPk(normalizedOrderId);
        if (!order) {
          socket.emit('error', 'Order not found');
          return;
        }

        const user = socket.user;
        let isAuthorized = false;

        if (user.role === 'admin' || user.role === 'head_admin') {
          isAuthorized = true;
        } else if (user.role === 'rider') {
           if (order.assigned_rider_id === user.user_id) {
             isAuthorized = true;
           }
        } else if (user.role === 'student' || user.role === 'user') {
           if (order.user_id === user.user_id) {
             isAuthorized = true;
           }
        }

        if (!isAuthorized) {
          socket.emit('error', 'Unauthorized access to this order chat');
          return;
        }

        // Join Room
        const roomName = `order_${normalizedOrderId}`;
        socket.join(roomName);
        socket.activeRoom = roomName; 
        console.log(`User ${user.user_id} joined room ${roomName}`);

        // Notify others
        socket.to(roomName).emit('user_status', { userId: user.user_id, status: 'online' });

        // Find or Create Thread
        let thread = await ChatThread.findOne({ where: { order_id: normalizedOrderId } });
        if (!thread) {
          thread = await ChatThread.create({
            order_id: normalizedOrderId,
            user_id: order.user_id,
            rider_id: order.assigned_rider_id,
            status: 'active'
          });
        } else {
            // Update rider if missing/changed
            if (order.assigned_rider_id && thread.rider_id !== order.assigned_rider_id) {
                thread.rider_id = order.assigned_rider_id;
                await thread.save();
            }
        }

        const orderUser = await User.findByPk(order.user_id);
        const riderUser = order.assigned_rider_id ? await User.findByPk(order.assigned_rider_id) : null;
        const orderUserDisplayId = requireDisplayId(orderUser, 'user');
        if (!orderUserDisplayId) {
          socket.emit('error', 'User ID formatting invalid');
          return;
        }
        let riderDisplayId = null;
        if (riderUser) {
          riderDisplayId = requireDisplayId(riderUser, 'rider');
          if (!riderDisplayId) {
            socket.emit('error', 'Rider ID formatting invalid');
            return;
          }
        }

        // Load History
        const messages = await ChatMessage.findAll({
          where: { thread_id: thread.id },
          order: [['timestamp', 'ASC']],
          limit: 100 // Increased limit
        });

        const senderIds = Array.from(new Set(messages.map((msg) => msg.sender_id)));
        const senderUsers = senderIds.length ? await User.findAll({ where: { user_id: { [Op.in]: senderIds } } }) : [];
        const senderMap = senderUsers.reduce((acc, user) => {
          acc[user.user_id] = user;
          return acc;
        }, {});
        const historyPayload = messages.map((msg) => {
          const senderUser = senderMap[msg.sender_id];
          return {
            ...msg.toJSON(),
            sender_display_id: requireDisplayId(senderUser, msg.sender_role)
          };
        });

        socket.emit('history', historyPayload);
        socket.emit('chat_status', { status: thread.status, rider_display_id: riderDisplayId, user_display_id: orderUserDisplayId });

      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', 'Internal server error');
        await notifyActor(socket.user, 'Chat error', 'Unable to join chat room. Please try again.');
        await notifyAdmins({
          title: 'Chat error',
          message: 'Error while joining chat room.',
          action: 'chat_join_error',
          meta: { userId: socket.user?.user_id, orderId, details: error.message },
          actorUserId: socket.user?.user_id
        });
      }
    });

    socket.on('mark_read', async ({ orderId, messageIds }) => {
        try {
            const normalizedOrderId = normalizeChatId(orderId);
            if (!normalizedOrderId) return;
            if (!messageIds || !Array.isArray(messageIds)) return;
            const normalizedMessageIds = messageIds
              .map((id) => (typeof id === 'string' && /^\d+$/.test(id) ? parseInt(id, 10) : id))
              .filter((id) => Number.isInteger(id) && id > 0);
            if (!normalizedMessageIds.length) return;
            
            await ChatMessage.update(
                { read_status: true },
                { 
                    where: { 
                        id: { [Op.in]: normalizedMessageIds },
                        thread_id: sequelize.literal(`(SELECT id FROM chat_threads WHERE order_id = ${normalizedOrderId})`) 
                    } 
                }
            );

            const roomName = `order_${normalizedOrderId}`;
            io.to(roomName).emit('messages_read', { messageIds: normalizedMessageIds, userId: socket.user.user_id });
            
        } catch (error) {
            console.error('Error marking messages read:', error);
        }
    });

    socket.on('send_message', async ({ orderId, message }, callback) => {
      try {
        const normalizedOrderId = normalizeChatId(orderId);
        if (!normalizedOrderId) {
          if (callback) callback({ error: 'Invalid chat ID format' });
          return;
        }
        const roomName = `order_${normalizedOrderId}`;
        const user = socket.user;

        // Double check thread existence (should exist from join)
        const thread = await ChatThread.findOne({ where: { order_id: normalizedOrderId } });
        if (!thread) {
            if (callback) callback({ error: 'Thread not found' });
            return;
        }

        // Check Order Status for Lock
        const order = await Order.findByPk(normalizedOrderId);
        if (order && (order.status === 'delivered' || order.status === 'cancelled')) {
             if (user.role !== 'rider') {
               if (callback) callback({ error: 'Chat is closed for this order.' });
               return;
             }
        }

        // Check if Locked
        if (thread.status === 'locked') {
             if (user.role !== 'rider') {
               if (callback) callback({ error: 'Chat is closed because the order has been completed.' });
               return;
             }
        }

        // Check Read-Only (Admin)
        if (user.role === 'admin' || user.role === 'head_admin') {
             console.warn(`[Chat] Blocked message attempt from Admin ${user.user_id}`);
             if (callback) callback({ error: 'Admin has read-only access.' });
             return;
        }

        // Determine Receiver
        let receiverId = null;
        let receiverRole = null;

        if (user.role === 'student' || user.role === 'user') {
            receiverId = thread.rider_id;
            receiverRole = 'rider';
        } else if (user.role === 'rider') {
            receiverId = thread.user_id;
            receiverRole = 'user';
        }

        const senderDisplayId = requireDisplayId(user, user.role);
        if (!senderDisplayId) {
          if (callback) callback({ error: 'Invalid sender ID format' });
          return;
        }
        let receiverDisplayId = null;
        if (receiverId) {
          const receiverUser = await User.findByPk(receiverId);
          receiverDisplayId = requireDisplayId(receiverUser, receiverRole);
          if (!receiverDisplayId) {
            if (callback) callback({ error: 'Invalid receiver ID format' });
            return;
          }
        }

        // Save Message
        const newMessage = await ChatMessage.create({
          thread_id: thread.id,
          sender_role: user.role,
          sender_id: user.user_id,
          receiver_id: receiverId,
          receiver_role: receiverRole,
          message_type: 'text',
          message: message,
          read_status: false
        });

        // Update thread timestamp for sorting
        thread.changed('updatedAt', true);
        await thread.save();

        // Acknowledge receipt
        if (callback) callback({ status: 'ok', messageId: newMessage.id, timestamp: newMessage.timestamp });

        // Broadcast to room
        const payload = {
          ...newMessage.toJSON(),
          sender_display_id: senderDisplayId,
          receiver_display_id: receiverDisplayId
        };
        io.to(roomName).emit('receive_message', payload);

        // Push Notification Logic
        const room = io.sockets.adapter.rooms.get(roomName);
        const numClients = room ? room.size : 0;
        
        // If only sender is in room (size 1), or specific recipient missing
        if (numClients < 2) {
             console.log(`[Notification] Trigger push to offline recipient for Order ${orderId}`);
             
             // Determine recipient
             const targetUserId = (user.role === 'student') ? thread.rider_id : thread.user_id;
             
             if (targetUserId) {
                 await Notification.create({
                     user_id: targetUserId,
                     title: 'New Message',
                     message: `New message from ${user.full_name || user.role}`,
                     channel: 'app'
                 });

                 await IntegrationService.sendPushNotification(
                   targetUserId,
                   'New Message',
                   `New message from ${user.full_name || user.role}`
                 );
             }
        }
        
      } catch (error) {
        console.error('Error sending message:', error);
        if (callback) callback({ error: 'Unable to send message' });
        await notifyActor(socket.user, 'Chat error', 'Unable to send chat message. Please try again.');
        await notifyAdmins({
          title: 'Chat error',
          message: 'Error while sending chat message.',
          action: 'chat_send_error',
          meta: { userId: socket.user?.user_id, orderId, details: error.message },
          actorUserId: socket.user?.user_id
        });
      }
    });
    
    socket.on('typing', ({ orderId, isTyping }) => {
        socket.to(`order_${orderId}`).emit('typing', { userId: socket.user.user_id, isTyping });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.user_id}`);
      if (socket.activeRoom) {
          socket.to(socket.activeRoom).emit('user_status', { userId: socket.user.user_id, status: 'offline' });
      }
    });
  });
};
