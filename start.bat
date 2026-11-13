@echo off
rem Starts the Custom Cars site on this computer and opens it in your browser.
rem Keep the black window open while you use the site; close it to stop.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server\app.py
) else (
  python server\app.py
)
pause
