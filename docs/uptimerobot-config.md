# UptimeRobot — Mantener Railway despierto

1. Ve a: https://uptimerobot.com → Sign up gratis
2. "Add New Monitor"
3. Configuración:
   - Monitor Type: HTTP(s)
   - Friendly Name: ConnectaChat API
   - URL: https://bizflow-production-7f79.up.railway.app/health
   - Monitoring Interval: 5 minutes
4. Cuando api.conectaachat.com propague, actualiza la URL a:
   https://api.conectaachat.com/health

Esto evita que Railway duerma el servicio en el free tier.
