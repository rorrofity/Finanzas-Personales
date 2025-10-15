# Configuración de Google OAuth 2.0

Esta guía te ayudará a configurar Google Sign-In para la aplicación de Finanzas Personales.

## 📋 Requisitos Previos

- Una cuenta de Google
- Acceso a [Google Cloud Console](https://console.cloud.google.com/)

## 🚀 Pasos de Configuración

### 1. Crear un Proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Haz clic en el menú desplegable de proyectos (parte superior izquierda)
3. Haz clic en **"Nuevo Proyecto"**
4. Ingresa un nombre para tu proyecto (ej: "Finanzas Personales")
5. Haz clic en **"Crear"**

### 2. Habilitar la API de Google Identity

1. En el menú lateral, ve a **"APIs y servicios"** > **"Biblioteca"**
2. Busca **"Google Identity"** o **"Google+ API"**
3. Haz clic en **"Habilitar"**

### 3. Configurar la Pantalla de Consentimiento de OAuth

1. En el menú lateral, ve a **"APIs y servicios"** > **"Pantalla de consentimiento de OAuth"**
2. Selecciona **"Externo"** (si es para uso personal) o **"Interno"** (si tienes Google Workspace)
3. Haz clic en **"Crear"**
4. Completa la información requerida:
   - **Nombre de la aplicación**: Finanzas Personales
   - **Correo electrónico de asistencia del usuario**: Tu correo
   - **Logotipo de la aplicación**: (opcional)
   - **Dominios autorizados**: `localhost` (para desarrollo)
   - **Correo electrónico del desarrollador**: Tu correo
5. Haz clic en **"Guardar y continuar"**
6. En **"Scopes"**, haz clic en **"Añadir o quitar scopes"**
7. Agrega los siguientes scopes:
   - `email`
   - `profile`
   - `openid`
8. Haz clic en **"Guardar y continuar"**
9. Revisa y haz clic en **"Volver al panel"**

### 4. Crear Credenciales OAuth 2.0

1. En el menú lateral, ve a **"APIs y servicios"** > **"Credenciales"**
2. Haz clic en **"+ Crear credenciales"**
3. Selecciona **"ID de cliente de OAuth"**
4. Selecciona **"Aplicación web"** como tipo de aplicación
5. Ingresa un nombre (ej: "Web Client - Finanzas Personales")
6. En **"Orígenes autorizados de JavaScript"**, agrega:
   ```
   http://localhost:3000
   http://localhost:3001
   ```
7. En **"URI de redirección autorizados"**, agrega:
   ```
   http://localhost:3000
   http://localhost:3001
   ```
8. Haz clic en **"Crear"**
9. Se mostrará un cuadro de diálogo con tu **Client ID** y **Client Secret**
10. **¡IMPORTANTE!** Copia el **Client ID** - lo necesitarás para configurar la aplicación

### 5. Configurar Variables de Entorno

#### En el archivo `.env` (raíz del proyecto - Backend)

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=tu_client_id_aqui.apps.googleusercontent.com
```

#### En el archivo `.env.development` (raíz del proyecto - Frontend)

```env
# Google OAuth - Frontend
REACT_APP_GOOGLE_CLIENT_ID=tu_client_id_aqui.apps.googleusercontent.com
```

**IMPORTANTE:** Reemplaza `tu_client_id_aqui.apps.googleusercontent.com` con tu Client ID real de Google.

### 6. Ejecutar Migraciones de Base de Datos

La migración `18_add_google_oauth_support.sql` agrega las columnas necesarias para Google OAuth.

```bash
npm run migrate
```

O manualmente:

```bash
psql -U tu_usuario -d finanzas_personales -f backend/migrations/18_add_google_oauth_support.sql
```

### 7. Instalar Dependencias

#### Frontend

```bash
npm install @react-oauth/google
```

Este paquete ya debería estar en el `package.json`, pero si no está instalado, ejecuta el comando anterior.

### 8. Reiniciar los Servidores

```bash
# Detén los servidores actuales (Ctrl+C)

# Reinicia con:
npm run dev
```

## 🔒 Seguridad

### Para Producción

Cuando despliegues a producción:

1. **Actualiza los orígenes autorizados** en Google Cloud Console:
   - Agrega tu dominio de producción (ej: `https://tudominio.com`)
   
2. **Variables de entorno de producción**:
   - NO incluyas las credenciales en el código
   - Usa variables de entorno en tu servidor/plataforma de hosting
   - Considera usar servicios como:
     - Vercel: Variables de entorno en el dashboard
     - Heroku: `heroku config:set GOOGLE_CLIENT_ID=...`
     - AWS: AWS Secrets Manager
     - Azure: Azure Key Vault

3. **Dominios autorizados**:
   - Elimina `localhost` de los orígenes autorizados
   - Solo incluye dominios HTTPS en producción

## 🧪 Probar la Integración

1. Inicia la aplicación:
   ```bash
   npm run dev
   ```

2. Abre el navegador en `http://localhost:3000/login`

3. Deberías ver:
   - El formulario de login tradicional
   - Un divisor que dice "O"
   - El botón "Sign in with Google"

4. Haz clic en el botón de Google y prueba iniciar sesión

## ❓ Troubleshooting

### Error: "redirect_uri_mismatch"

**Causa**: La URL de redirección no está autorizada en Google Cloud Console.

**Solución**:
1. Ve a Google Cloud Console > Credenciales
2. Edita tu Client ID de OAuth
3. Verifica que `http://localhost:3000` esté en la lista de orígenes autorizados

### Error: "Invalid client ID"

**Causa**: El Client ID no está configurado correctamente.

**Solución**:
1. Verifica que hayas copiado el Client ID completo
2. Asegúrate de que esté en el archivo `.env.development` con el prefijo `REACT_APP_`
3. Reinicia el servidor de desarrollo

### Error: "Google Sign-In button doesn't appear"

**Causa**: La librería no se cargó o hay un problema con el Client ID.

**Solución**:
1. Verifica la consola del navegador para errores
2. Confirma que `@react-oauth/google` está instalado
3. Verifica que `REACT_APP_GOOGLE_CLIENT_ID` esté definido

### Error al crear usuario en la base de datos

**Causa**: La migración no se ejecutó correctamente.

**Solución**:
1. Verifica que las columnas existan:
   ```sql
   \d users
   ```
2. Ejecuta manualmente la migración si es necesario

## 📚 Recursos Adicionales

- [Google Identity Documentation](https://developers.google.com/identity)
- [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [@react-oauth/google Documentation](https://www.npmjs.com/package/@react-oauth/google)

## 🎯 Arquitectura de la Implementación

### Flujo de Autenticación

```
1. Usuario hace clic en "Sign in with Google"
   ↓
2. Google abre popup de autenticación
   ↓
3. Usuario autoriza la aplicación
   ↓
4. Google devuelve un JWT (credential)
   ↓
5. Frontend envía el credential al backend (/api/auth/google)
   ↓
6. Backend decodifica el JWT y extrae información del usuario
   ↓
7. Backend busca o crea el usuario en la BD
   ↓
8. Backend genera un JWT propio y lo devuelve
   ↓
9. Frontend guarda el token y redirige al dashboard
```

### Modelos de Datos

La tabla `users` ahora incluye:
- `google_id`: ID único de Google (para vincular cuentas)
- `auth_provider`: 'local' o 'google' (identifica el método de autenticación)
- `profile_picture`: URL de la foto de perfil (principalmente de Google)
- `password`: nullable (usuarios de Google no tienen password)

### Seguridad

- Los usuarios que se registraron con email/password no pueden iniciar sesión con Google si usan el mismo email (previene hijacking de cuentas)
- Los tokens JWT tienen expiración de 24 horas
- El password es nullable solo para usuarios de Google
- La verificación del JWT de Google se hace mediante decodificación (Google ya lo verificó en el cliente)
