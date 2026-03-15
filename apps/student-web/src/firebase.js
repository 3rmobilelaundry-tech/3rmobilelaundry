import { Platform } from 'react-native';

// Exporting messaging instance if available globally (from index.html script)
let messaging = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // We expect window.firebaseMessaging to be initialized in index.html
  if (window.firebaseMessaging) {
    messaging = window.firebaseMessaging;
  }
}

/*
This function receives the FCM token from the Android app
and sends it to the backend so notifications can be delivered
to this specific device.
*/

window.receiveFCMToken = async function (token) {

  try {

    console.log("Received FCM token:", token);

    await fetch("/api/device-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({
        fcm_token: token,
        device_type: "android"
      })
    });

    console.log("FCM token successfully sent to backend");

  } catch (error) {

    console.error("Error sending FCM token:", error);

  }

};

export { messaging };
