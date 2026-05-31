# Restarting Ollama with CORS enabled

studyTrak runs in the browser, so Ollama must allow cross-origin requests.
If you see `Error: listen tcp 127.0.0.1:11434: bind: address already in use`,
an existing Ollama process is holding the port — stop it first, then relaunch.

## macOS menu-bar app (recommended)

1. Click the llama icon in the menu bar → **Quit Ollama**.
2. Open Terminal and set the env var so the next launch inherits it:
   ```bash
   launchctl setenv OLLAMA_ORIGINS "*"
   ```
3. Reopen the app:
   ```bash
   open -a Ollama
   ```

## Terminal (`ollama serve`)

```bash
# find what's holding the port
lsof -i :11434

# stop it (either works)
pkill -f "ollama serve"
# or
kill -9 <PID-from-lsof>

# restart with CORS open
OLLAMA_ORIGINS="*" ollama serve
```

## Verify

A plain `curl` won't show the CORS header because `curl` doesn't send an
`Origin` header by default. Test it the way the browser does:

```bash
# Simulates the studyTrak page calling /api/tags
curl -i -H "Origin: http://localhost:3000" http://localhost:11434/api/tags
```

Look for `Access-Control-Allow-Origin: *` (or the echoed origin) in the
response headers.

To check the preflight that the browser fires before `POST /api/chat`:

```bash
curl -i -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  http://localhost:11434/api/chat
```

Easiest of all: open studyTrak → **Setup → Gemma**, click **Test
connection**. If it reports a successful response, CORS is fine.

## Still stuck?

- Check Activity Monitor for any lingering `ollama` process and force-quit it.
- Make sure the model is pulled: `ollama pull gemma2:2b`.
- On Linux, edit the systemd unit (`systemctl edit ollama.service`) and add
  `Environment="OLLAMA_ORIGINS=*"` under `[Service]`, then
  `sudo systemctl restart ollama`.
