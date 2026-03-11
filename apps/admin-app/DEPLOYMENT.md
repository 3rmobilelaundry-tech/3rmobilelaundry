# Admin Dashboard - Deployment & Configuration Guide

## Issues Fixed
This update fixes critical bugs preventing the admin dashboard from functioning:

1. **Error Handling Bug** - Fixed TypeError in API error handling that was preventing proper error messages
2. **Static Assets** - Ensured all Ionicons fonts and images are properly bundled
3. **API Configuration** - Added warnings and guidance for proper backend API configuration

## Current Status

You have successfully deployed the admin app to Vercel. However, for the app to work properly, you must configure the backend API connection.

## ⚠️ Critical Configuration Needed

> 🔧 *New build behavior*: static assets are now patched after export to remove the `/admin` prefix. This means the app can be deployed at the root of a domain without additional configuration. The build step automatically runs a small script (`postbuild:web`) that fixes URLs. You no longer need to modify the `homepage` field manually.


The admin dashboard requires a backend API server to function. Currently, it cannot add staff or load any data because the API connection is not configured.

### Option 1: Set Backend API URL (Recommended)

Set the `EXPO_PUBLIC_API_URL` environment variable in your Vercel project:

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add a new variable:
   - **Name**: `EXPO_PUBLIC_API_URL`
   - **Value**: Your backend API server URL (e.g., `https://api.yourdomain.com` or `http://10.69.192.33:5000`)
   
4. Redeploy the admin app for the changes to take effect

### Option 2: Configure Local Backend

For local development:
- Ensure your backend server is running on `http://localhost:5000` or
- Set `EXPO_PUBLIC_API_URL=http://your-backend-server:5000`

## What This Means For Your Deployment

When you deployed to Vercel:
- ✅ Static assets (HTML, JS, CSS) are served correctly (prefixes automatically patched)
- ✅ Login page works with dev credentials (09000000000 / admin123)
- ❌ All API calls fail (404) because the backend server isn't running on Vercel **unless you set `EXPO_PUBLIC_API_URL` to point at it**

> 💡 The app will fall back to a known production backend at `https://3rmobilelaundry-production.up.railway.app` if you forget to set the environment variable, but you should still configure it explicitly for flexibility.

## Testing Today

You can still test with the dev credentials:
- **Phone**: `09000000000`
- **Password**: `admin123`

Once logged in, you'll see API failures because the backend isn't configured. This is expected until you set the `EXPO_PUBLIC_API_URL`.

## Files Updated in This Release

### Bug Fixes
- `/src/services/api.js` - Fixed error handling to prevent "toLowerCase is not a function" errors
  - Safely converts all error messages to strings
  - Added helpful warnings for production API configuration
  
- `/vercel.json` - Added proper Vercel configuration for static site deployment
  - Configured cache headers for static assets
  - Set up proper routing for SPA (Single Page Application)

### New Features
- Development default login now works properly with improved error messages
- Better error messages when API calls fail (instead of cryptic TypeError)
- Clear warnings in console about missing API configuration

## Next Steps

1. **Set Environment Variables in Vercel**
   - Navigate to your Vercel project
   - Add `EXPO_PUBLIC_API_URL` pointing to your backend API
   - Redeploy

2. **Ensure Backend API is Running**
   - Your backend should be accessible at the URL you set
   - It should handle endpoints like `/auth/login`, `/api/staff`, etc.

3. **Check Console Logs**
   - Open browser console (F12)
   - Look for "API base URL" message showing your configured URL
   - If you see warnings about missing `EXPO_PUBLIC_API_URL`, follow Option 1 above

## Troubleshooting

### Icons still not loading?
- Clear your browser cache (Ctrl+Shift+Delete)
- Hard refresh the page (Ctrl+F5)
- Check that static files are deployed to Vercel

### Still getting API errors?
- Verify `EXPO_PUBLIC_API_URL` is set in Vercel project settings
- Check that your backend server is running and accessible
- Open browser console to see exactly which URL it's trying to call

### Dev login not working?
- Clear localStorage: Open DevTools → Application → LocalStorage → Clear All
- Hard refresh and try again with credentials: `09000000000` / `admin123`

## Development Credentials (For Testing Only)

```
Phone: 09000000000
Password: admin123
Role: Head Admin
```

This is a temporary development account. Do not use in production.

## Support

For issues:
1. Check browser console (F12) for detailed error messages
2. Ensure backend API URL is correctly configured in Vercel
3. Verify your backend server is running and accessible from Vercel
