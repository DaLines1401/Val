@echo off
title Deploy Sova Tactical Overlay to Cloudflare Pages
cd /d "%~dp0"
echo Step 1: Logging in to Cloudflare (if not already logged in)...
call npx wrangler login
echo Step 2: Creating Cloudflare Pages project (if not created yet)...
call npx wrangler pages project create sova-tactical-val --production-branch=main
echo Step 3: Deploying to Cloudflare Pages...
call npx wrangler pages deploy src --project-name=sova-tactical-val --branch=main
pause
