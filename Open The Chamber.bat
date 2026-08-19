@echo off
REM ============================================================
REM  The Chamber - double-click launcher
REM  Starts a tiny local web server in this folder and opens the
REM  room in your default browser. No typing required.
REM
REM  Why a server at all: Chrome switches off IndexedDB and the
REM  file picker for pages opened straight from disk (file://),
REM  which is where all your notes live. Serving over localhost
REM  turns those back on.
REM
REM  Close the small minimised "chamber-server" window when done.
REM ============================================================
cd /d "%~dp0"
start "chamber-server" /min py -m http.server 8777
timeout /t 1 /nobreak >nul
start "" http://localhost:8777/index.html
exit
