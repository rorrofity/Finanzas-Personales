# 🔐 Guía para Pasar Filtros de Netskope

## 📋 ¿Qué es Netskope?

**Netskope** es una plataforma CASB (Cloud Access Security Broker) que analiza y filtra el tráfico web en empresas para:
- Detectar amenazas de seguridad
- Bloquear sitios maliciosos o de riesgo
- Aplicar políticas de seguridad corporativas
- Prevenir fugas de datos

Tu sitio `finanzas.rocketflow.cl` fue bloqueado porque es **nuevo/desconocido** para Netskope.

---

## 🎯 Estrategias para Pasar el Filtro

### **Opción 1: Solicitar Whitelist (Más Efectiva) ⭐⭐⭐**

**Pasos:**
1. Contacta a tu equipo de TI/Seguridad de COPEC
2. Solicita agregar `finanzas.rocketflow.cl` a la lista blanca
3. Explica que es una aplicación personal de finanzas
4. Menciona que tiene HTTPS y headers de seguridad configurados

**Email Template:**
```
Asunto: Solicitud de Whitelist para Dominio Personal

Hola equipo de Seguridad,

Me gustaría solicitar que se agregue el siguiente dominio a la lista blanca 
de Netskope para uso personal:

- Dominio: finanzas.rocketflow.cl
- Propósito: Aplicación personal de gestión financiera
- Seguridad: HTTPS habilitado con certificado válido
- Headers de seguridad configurados
- Sin riesgos de malware o phishing

¿Es posible agregar este dominio a la whitelist?

Gracias,
[Tu nombre]
```

---

### **Opción 2: Mejorar Categorización del Sitio ⭐⭐**

Netskope usa categorías para clasificar sitios. Puedes solicitar recategorización:

**A. Registrar en VirusTotal**
```bash
# Analiza tu sitio
https://www.virustotal.com/gui/url/[tu-url]/detection
```

**B. Registrar en Google Safe Browsing**
```
https://transparencyreport.google.com/safe-browsing/search
```

**C. Solicitar Recategorización en Netskope**
- Tu admin de TI puede solicitar a Netskope que recategorice tu dominio
- De "Uncategorized/Unknown" → "Personal Finance" o "Productivity"

---

### **Opción 3: Configuración Técnica Avanzada ⭐⭐**

#### **A. Agregar Más Headers de Seguridad**

Actualiza tu Caddyfile en el servidor:

```bash
docker exec -it n8n-docker-caddy-caddy-1 sh -c "cat > /etc/caddy/Caddyfile << 'EOF'
rocketflow.cl {
    reverse_proxy n8n:5678 {
      flush_interval -1
    }
}

finanzas.rocketflow.cl {
    header {
        # HTTPS Strict
        Strict-Transport-Security \"max-age=31536000; includeSubDomains; preload\"
        
        # Prevenir XSS
        X-Content-Type-Options \"nosniff\"
        X-Frame-Options \"SAMEORIGIN\"
        X-XSS-Protection \"1; mode=block\"
        
        # Content Security Policy
        Content-Security-Policy \"default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://accounts.google.com;\"
        
        # Permissions Policy
        Permissions-Policy \"geolocation=(), microphone=(), camera=()\"
        
        # Referrer Policy
        Referrer-Policy \"strict-origin-when-cross-origin\"
    }
    reverse_proxy 172.17.0.1:3001
}
EOF"

docker exec n8n-docker-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

#### **B. Agregar robots.txt y security.txt**

Crea archivo `public/robots.txt`:
```
User-agent: *
Allow: /

Sitemap: https://finanzas.rocketflow.cl/sitemap.xml
```

Crea archivo `public/.well-known/security.txt`:
```
Contact: mailto:tu@email.com
Expires: 2026-12-31T23:59:59z
Preferred-Languages: es, en
Canonical: https://finanzas.rocketflow.cl/.well-known/security.txt
```

#### **C. Configurar HSTS Preload**

1. Ve a: https://hstspreload.org/
2. Ingresa: `finanzas.rocketflow.cl`
3. Sigue las instrucciones para agregar tu dominio

---

### **Opción 4: Acceso Alternativo ⭐**

Si nada funciona en la red corporativa:

**A. VPN Personal**
- Usa un VPN como NordVPN, ExpressVPN, etc.
- Bypasea completamente Netskope

**B. Tethering desde Celular**
- Comparte internet desde tu teléfono
- No pasa por la red corporativa

**C. Acceso desde Casa**
- Usa la aplicación fuera del horario laboral
- Desde tu conexión personal

---

## 🔍 Verificar Estado de Seguridad

### **Herramientas para Analizar tu Sitio:**

1. **SSL Labs**
```
https://www.ssllabs.com/ssltest/analyze.html?d=finanzas.rocketflow.cl
```
**Meta**: Obtener grado A o A+

2. **Security Headers**
```
https://securityheaders.com/?q=finanzas.rocketflow.cl
```
**Meta**: Obtener grado A

3. **Mozilla Observatory**
```
https://observatory.mozilla.org/analyze/finanzas.rocketflow.cl
```
**Meta**: Score 90+

4. **VirusTotal**
```
https://www.virustotal.com/gui/url/finanzas.rocketflow.cl
```
**Meta**: 0 detecciones maliciosas

---

## 📊 Checklist de Seguridad

- [ ] HTTPS habilitado (Let's Encrypt) ✅
- [ ] Headers de seguridad configurados ✅
- [ ] HSTS configurado ✅
- [ ] CSP (Content Security Policy) configurado
- [ ] robots.txt creado
- [ ] security.txt creado
- [ ] Sitio analizado en SSL Labs
- [ ] Sitio analizado en Security Headers
- [ ] Sitio analizado en VirusTotal
- [ ] HSTS Preload solicitado
- [ ] Whitelist solicitado a TI

---

## 🎯 Recomendación Final

**Mejor estrategia combinada:**

1. **Corto plazo** (ahora):
   - Accede desde tu celular/casa
   - Implementa headers avanzados de seguridad
   
2. **Mediano plazo** (esta semana):
   - Solicita whitelist a TI de COPEC
   - Analiza el sitio en herramientas de seguridad
   - Documenta que es seguro

3. **Largo plazo** (opcional):
   - Registra en HSTS Preload
   - Mejora categorización en bases de datos de seguridad

---

## 💡 Información para TI

Si tu equipo de TI necesita justificación técnica:

**Detalles del Sitio:**
- URL: https://finanzas.rocketflow.cl
- Propósito: Aplicación personal de gestión financiera
- Tecnología: Node.js + React + PostgreSQL
- Hosting: Digital Ocean
- SSL: Let's Encrypt (certificado válido)
- Headers de seguridad: Configurados (HSTS, CSP, X-Frame-Options, etc.)
- No recopila datos de terceros
- Sin tracking ni analytics invasivos
- Uso personal, no comercial

**Riesgos:** Ninguno
- No es phishing
- No contiene malware
- No es proxy/VPN
- No infringe políticas corporativas

---

## 📝 Comandos Útiles

### Verificar Headers Actuales
```bash
curl -I https://finanzas.rocketflow.cl
```

### Test SSL
```bash
openssl s_client -connect finanzas.rocketflow.cl:443 -servername finanzas.rocketflow.cl
```

### Verificar Certificado
```bash
echo | openssl s_client -connect finanzas.rocketflow.cl:443 2>/dev/null | openssl x509 -noout -dates
```

---

¿Necesitas ayuda implementando alguna de estas estrategias? 🚀
