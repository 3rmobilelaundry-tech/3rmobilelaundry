@echo off
echo ==========================================
echo CLEARING CACHE & RESTARTING
echo ==========================================
cd admin-app
echo Starting Admin App with cache cleared...
echo Please scan the NEW QR Code below.
call npx expo start --clear
pause
