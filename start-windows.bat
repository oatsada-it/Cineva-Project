@echo off
title Doซีรี่ย์ VIP
where node >nul 2>nul
if errorlevel 1 (
 echo ต้องติดตั้ง Node.js 18+ ก่อน
 pause
 exit /b
)
if not exist node_modules (
 echo Installing dependencies...
 call npm install
)
start http://localhost:3000
npm start
