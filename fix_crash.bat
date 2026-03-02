@echo off
echo ==========================================
echo FIXING APP CRASH & DEPENDENCIES
echo ==========================================

echo.
echo [1/4] Configuring Network IP for Mobile Access...
node configure_ip.js

echo.
echo [2/4] Fixing User App Dependencies...
cd user-app
if exist node_modules (
    echo Removing old modules...
    rmdir /s /q node_modules
)
if exist package-lock.json del package-lock.json
echo Installing correct dependencies...
call npm install
cd ..

echo.
echo [3/4] Fixing Admin App Dependencies...
cd admin-app
if exist node_modules (
    echo Removing old modules...
    rmdir /s /q node_modules
)
if exist package-lock.json del package-lock.json
echo Installing correct dependencies...
call npm install
cd ..

echo.
echo ==========================================
echo Fix Complete!
echo 1. Close the Expo Go app on your phone completely.
echo 2. Run 'start_backend.bat' in one window.
echo 3. Run 'start_user_app.bat' in another window.
echo 4. Scan the NEW QR code.
echo ==========================================
pause
