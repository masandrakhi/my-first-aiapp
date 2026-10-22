// Runs before the app loads (a file, not an inline script, so the Content-Security-Policy can forbid inline code).

// Development only: saved data lives per address, and "localhost" and "127.0.0.1" are different sites.
// Always use 127.0.0.1, and carry habits saved under localhost along once in the URL fragment
// (never sent to a server). The app accepts that hand-over only on 127.0.0.1.
if (location.hostname === 'localhost' || location.hostname === '[::1]') {
  var target = new URL(location.href)
  target.hostname = '127.0.0.1'
  try {
    var key = 'habit-tracker:v1'
    var raw = localStorage.getItem(key)
    var parsed = raw && JSON.parse(raw)
    if (parsed && parsed.habits && parsed.habits.length && !localStorage.getItem(key + ':migrated')) {
      target.hash = 'import=' + encodeURIComponent(raw)
      localStorage.setItem(key + ':migrated', new Date().toISOString())
    }
  } catch {}
  location.replace(target.href)
}

// Apply the account's last theme before first paint, so there's no light/dark flash while loading.
try {
  var theme = localStorage.getItem('habits:theme')
  if (theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
  }
} catch {}
