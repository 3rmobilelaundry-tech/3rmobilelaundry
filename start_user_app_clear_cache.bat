@echo off
echo ==========================================
echo CLEARING CACHE & RESTARTING
echo ==========================================
cd user-app
echo Starting User App with cache cleared...
echo Please scan the NEW QR Code below.
call npx expo start --clear
pause
