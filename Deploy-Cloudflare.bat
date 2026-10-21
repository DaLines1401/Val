@echo off
title Deploy Sova Tactical Overlay to Cloudflare
cd /d "%~dp0"
set CLOUDFLARE_ACCOUNT_ID=ff9b6ddd56cfd9441c5d7a21f6031922
echo Deploying to https://sova-tactical-val.val-dalines.workers.dev ...
call npx wrangler deploy
pause
