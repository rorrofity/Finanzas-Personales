const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const db = require('../config/database');

const userModel = new User(db);

const register = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    // Validar campos requeridos
    if (!nombre || !email || !password) {
      return res.status(400).json({
        message: 'Todos los campos son requeridos'
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        message: 'El email ya está registrado'
      });
    }

    // Crear nuevo usuario
    const user = await userModel.create({ nombre, email, password });
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      message: 'Error al registrar usuario',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar campos requeridos
    if (!email || !password) {
      return res.status(400).json({
        message: 'Email y contraseña son requeridos'
      });
    }

    // Buscar usuario
    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        message: 'Credenciales inválidas'
      });
    }

    // Validar contraseña
    const isValidPassword = await userModel.validatePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        message: 'Credenciales inválidas'
      });
    }

    // Generar token
    const token = generateToken(user.id);

    // Actualizar último inicio de sesión
    await userModel.updateLastLogin(user.id);

    res.json({
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        auth_provider: user.auth_provider,
        profile_picture: user.profile_picture
      },
      token
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      message: 'Error al iniciar sesión',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await userModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        message: 'Usuario no encontrado'
      });
    }

    res.json({
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        auth_provider: user.auth_provider,
        profile_picture: user.profile_picture
      }
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      message: 'Error al obtener perfil',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: 'Credencial de Google es requerida'
      });
    }

    // Decodificar el JWT de Google (sin verificar, Google ya lo verificó)
    const base64Url = credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString());

    const { sub: googleId, email, name, picture } = payload;

    // Buscar usuario por Google ID
    let user = await userModel.findByGoogleId(googleId);

    if (!user) {
      // Verificar si existe un usuario con el mismo email
      const existingUser = await userModel.findByEmail(email);
      
      if (existingUser && existingUser.auth_provider === 'local') {
        return res.status(400).json({
          message: 'Ya existe una cuenta con este email. Por favor, inicia sesión con email y contraseña.'
        });
      }

      // Crear nuevo usuario
      user = await userModel.create({
        nombre: name,
        email: email,
        auth_provider: 'google',
        google_id: googleId,
        profile_picture: picture
      });
    } else {
      // Usuario existente - actualizar foto de perfil si cambió
      if (user.profile_picture !== picture) {
        await db.query(
          'UPDATE users SET profile_picture = $1 WHERE id = $2',
          [picture, user.id]
        );
        user.profile_picture = picture;
      }
    }

    // Generar token
    const token = generateToken(user.id);

    // Actualizar último inicio de sesión
    await userModel.updateLastLogin(user.id);

    res.json({
      message: 'Inicio de sesión con Google exitoso',
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        auth_provider: user.auth_provider,
        profile_picture: user.profile_picture
      },
      token
    });
  } catch (error) {
    console.error('Error en autenticación de Google:', error);
    res.status(500).json({
      message: 'Error al autenticar con Google',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  googleAuth
};
