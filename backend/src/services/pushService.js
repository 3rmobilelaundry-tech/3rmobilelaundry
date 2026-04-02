const { UserDeviceToken } = require('../models');
const sendNotification = require('../../utils/sendNotification');

const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    const devices = await UserDeviceToken.findAll({
      where: { user_id: userId }
    });

    console.log("Devices found for user", userId, ":", devices.length);

    if (!devices.length) {
      console.log("No device tokens found for user", userId);
      return;
    }

    for (const device of devices) {
      await sendNotification(
        device.fcm_token,
        title,
        body,
        data
      );
    }

  } catch (err) {
    console.error("Push error:", err);
  }
};

module.exports = {
  sendPushNotification
};
