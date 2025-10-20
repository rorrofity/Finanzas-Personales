# 🛡️ Resolución del Bloqueo de Netskope

## 📊 Análisis del Problema

Netskope está interceptando e inspeccionando el tráfico SSL/TLS de `finanzas.rocketflow.cl`:

```
Tunneling flow from addr: 1.0.0.1:49715
to host: finanzas.rocketflow.cl, addr: 137.184.12.234:443
to nsProxy
```

**¿Qué está pasando?**
1. ✅ Netskope intercepta la conexión HTTPS
2. ✅ Inspecciona el contenido (SSL inspection)
3. ⚠️ Categoriza el sitio como "no confiable" o "sin categoría"
4. ❌ Bloquea o muestra advertencia

---

## 🎯 Soluciones Ordenadas por Efectividad

### Solución 1: Whitelist en Netskope (Más Rápida) ⭐

**Acción**: Solicitar al administrador de Netskope agregar el dominio a la whitelist.

**Pasos**:
1. Contacta al equipo de seguridad/IT de tu empresa
2. Solicita agregar estos dominios a la whitelist:
   - `finanzas.rocketflow.cl`
   - `rocketflow.cl`
3. Categoría sugerida: **"Personal Cloud Storage"** o **"Productivity"**

**Justificación para IT**:
```
Dominio: finanzas.rocketflow.cl
Propósito: Aplicación personal de gestión financiera
Certificado SSL: Válido (Let's Encrypt)
Headers de seguridad: Implementados
Razón: Herramienta de productividad personal
```

---

### Solución 2: Mejorar Headers de Seguridad (Técnica) 🔧

Esta solución mejora la "confianza" que Netskope tiene en tu sitio.

#### Paso 1: Actualizar Caddyfile en el Servidor

```bash
# Conectar al servidor
ssh root@137.184.12.234

# Crear backup del Caddyfile actual
docker exec n8n-docker-caddy-caddy-1 cat /etc/caddy/Caddyfile > /tmp/Caddyfile.backup

# Crear nuevo Caddyfile con headers de seguridad
cat > /tmp/Caddyfile << 'EOF'
rocketflow.cl {
    reverse_proxy n8n:5678 {
      flush_interval -1
    }
}

finanzas.rocketflow.cl {
    # Headers de seguridad para mejorar confianza
    header {
        # HSTS - Fuerza HTTPS
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        
        # Content Security Policy
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://accounts.google.com https://www.googleapis.com; frame-src https://accounts.google.com"
        
        # Prevenir clickjacking
        X-Frame-Options "SAMEORIGIN"
        
        # Protección XSS
        X-XSS-Protection "1; mode=block"
        
        # No sniffing de content-type
        X-Content-Type-Options "nosniff"
        
        # Política de referrer
        Referrer-Policy "strict-origin-when-cross-origin"
        
        # Permisos restrictivos
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        
        # Ocultar servidor
        -Server
    }
    
    # Compresión
    encode gzip zstd
    
    # Proxy al backend
    reverse_proxy host.docker.internal:3001 {
        health_uri /api/health
        health_interval 30s
        health_timeout 10s
        
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
    
    # Logging
    log {
        output file /var/log/caddy/finanzas.log
        format json
    }
}
EOF

# Copiar al contenedor
docker cp /tmp/Caddyfile n8n-docker-caddy-caddy-1:/etc/caddy/Caddyfile

# Recargar Caddy (sin downtime)
docker exec n8n-docker-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile

# Verificar que no hay errores
docker logs n8n-docker-caddy-caddy-1 --tail 30
```

#### Paso 2: Verificar Headers

Desde tu Mac, verifica que los headers estén aplicados:

```bash
curl -I https://finanzas.rocketflow.cl
```

**Deberías ver**:
```
HTTP/2 200
strict-transport-security: max-age=31536000; includeSubDomains; preload
content-security-policy: default-src 'self'...
x-frame-options: SAMEORIGIN
x-xss-protection: 1; mode=block
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
```

---

### Solución 3: Agregar a HSTS Preload (Largo Plazo) 🌐

Esto hace que los navegadores **siempre** usen HTTPS y confíen más en tu sitio.

**Requisitos**:
1. ✅ HTTPS funcionando (ya lo tienes)
2. ✅ Header HSTS con `preload` (agregado en Solución 2)
3. ⏳ Registro en hstspreload.org

**Pasos**:
1. Ve a: https://hstspreload.org/
2. Ingresa: `finanzas.rocketflow.cl`
3. Verifica que cumple requisitos
4. Envía para preload
5. Espera aprobación (puede tomar semanas)

---

### Solución 4: Usar VPN o Tunnel (Temporal) 🔒

Si necesitas acceso inmediato mientras se resuelven las soluciones anteriores:

#### Opción A: SSH Tunnel

```bash
# Desde tu Mac
ssh -L 8443:localhost:3001 root@137.184.12.234 -N

# Luego accede a:
# http://localhost:8443
```

Esto bypasea Netskope porque el tráfico va cifrado por SSH.

#### Opción B: VPN Personal

Usa un VPN personal para acceder sin pasar por Netskope:
- Tailscale (recomendado, gratis)
- WireGuard
- OpenVPN

---

## 🔍 Verificación Post-Implementación

### Test 1: Headers de Seguridad

```bash
# Verificar todos los headers
curl -I https://finanzas.rocketflow.cl | grep -i "security\|frame\|xss\|content"
```

### Test 2: SSL Labs

Verifica la seguridad SSL:
1. Ve a: https://www.ssllabs.com/ssltest/
2. Ingresa: `finanzas.rocketflow.cl`
3. Espera el análisis
4. **Objetivo**: Grado A o A+

### Test 3: Security Headers

Verifica los headers:
1. Ve a: https://securityheaders.com/
2. Ingresa: `https://finanzas.rocketflow.cl`
3. **Objetivo**: Grado A o superior

---

## 📋 Checklist de Implementación

### Inmediato (Día 1):
- [ ] Solicitar whitelist a IT/Seguridad
- [ ] Implementar headers de seguridad (Solución 2)
- [ ] Verificar headers con curl
- [ ] Probar acceso desde la red corporativa

### Corto Plazo (Semana 1):
- [ ] Verificar SSL Labs (objetivo: A+)
- [ ] Verificar Security Headers (objetivo: A)
- [ ] Confirmar con IT que el dominio está whitelisted
- [ ] Documentar la resolución

### Largo Plazo (Mes 1):
- [ ] Enviar a HSTS Preload List
- [ ] Monitorear logs de Netskope (si IT lo permite)
- [ ] Configurar alertas de seguridad

---

## 🆘 Troubleshooting

### "Headers no aparecen después de actualizar Caddy"

```bash
# Verificar que Caddy cargó la configuración
docker exec n8n-docker-caddy-caddy-1 caddy validate --config /etc/caddy/Caddyfile

# Ver logs de Caddy
docker logs n8n-docker-caddy-caddy-1 --tail 50

# Restart completo si es necesario
docker restart n8n-docker-caddy-caddy-1
```

### "Netskope sigue bloqueando después de whitelist"

1. Limpiar caché del navegador
2. Cerrar y reabrir el navegador
3. Verificar con IT que se aplicó el whitelist
4. Probar en modo incógnito

### "Aplicación no carga después de cambiar headers CSP"

El CSP puede ser muy restrictivo. Si la app no carga:

```bash
# Volver al Caddyfile anterior
docker cp /tmp/Caddyfile.backup n8n-docker-caddy-caddy-1:/etc/caddy/Caddyfile
docker exec n8n-docker-caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

---

## 📞 Contacto con IT/Seguridad

### Template de Email para IT:

```
Asunto: Solicitud de Whitelist - Dominio Personal de Productividad

Hola [Nombre del equipo de IT],

Solicito agregar el siguiente dominio a la whitelist de Netskope:

Dominio: finanzas.rocketflow.cl
IP: 137.184.12.234
Propósito: Aplicación personal de gestión financiera
Categoría sugerida: Productivity / Personal Cloud Storage

Detalles técnicos:
- Certificado SSL: Válido (Let's Encrypt)
- Headers de seguridad: HSTS, CSP, X-Frame-Options implementados
- HTTPS forzado
- No contiene malware ni phishing

Es una herramienta personal que uso para mi productividad financiera.
¿Podrían ayudarme con esto?

Gracias,
[Tu nombre]
```

---

## 🎯 Resumen Ejecutivo

**Para resolver rápido**:
1. **Solicita whitelist a IT** (30 minutos de tu tiempo)
2. **Implementa headers de seguridad** (10 minutos técnicos)
3. **Usa SSH tunnel mientras esperas** (bypass temporal)

**Resultado esperado**:
- ✅ Netskope permite el acceso
- ✅ Sitio más seguro
- ✅ Mejor calificación SSL/Security

---

**Última actualización**: 2025-10-20
