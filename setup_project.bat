@echo off
echo ==========================================
echo Setting up 3R Laundry System...
echo ==========================================

echo.
echo [0/3] Generating Dummy Assets...
node generate_assets.js

echo.
echo [1/3] Installing Backend Dependencies...
cd backend
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Error installing backend dependencies. Please ensure Node.js is installed.
    pause
    exit /b
)
cd ..

echo.
echo [2/3] Installing User App Dependencies...
cd user-app
call npm install
cd ..

echo.
echo [3/3] Installing Admin App Dependencies...
cd admin-app
call npm install
cd ..

echo.
echo ==========================================
echo Setup Complete!
echo You can now use 'start_backend.bat', 'start_user_app.bat', and 'start_admin_app.bat'
echo ==========================================
pause
