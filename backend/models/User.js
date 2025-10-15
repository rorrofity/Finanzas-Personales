const bcrypt = require('bcryptjs');

class User {
  constructor(db) {
    this.query = db.query;
  }

  async create(userData) {
    const { nombre, email, password, auth_provider = 'local', google_id = null, profile_picture = null } = userData;
    
    let hashedPassword = null;
    
    // Solo hashear password si es autenticación local
    if (password && auth_provider === 'local') {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    try {
      const query = `
        INSERT INTO users (nombre, email, password, auth_provider, google_id, profile_picture, created_at) 
        VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
        RETURNING id, nombre, email, auth_provider, google_id, profile_picture
      `;
      const values = [nombre, email, hashedPassword, auth_provider, google_id, profile_picture];
      
      const result = await this.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error creando usuario: ${error.message}`);
    }
  }

  async findByEmail(email) {
    try {
      const query = 'SELECT * FROM users WHERE email = $1';
      const result = await this.query(query, [email]);
      return result.rows[0];
    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error buscando usuario: ${error.message}`);
    }
  }

  async findByGoogleId(googleId) {
    try {
      const query = 'SELECT * FROM users WHERE google_id = $1';
      const result = await this.query(query, [googleId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error buscando usuario por Google ID: ${error.message}`);
    }
  }

  async findById(userId) {
    try {
      const query = 'SELECT id, nombre, email, auth_provider, google_id, profile_picture, created_at FROM users WHERE id = $1';
      const result = await this.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error completo:', error);
      throw new Error(`Error buscando usuario por ID: ${error.message}`);
    }
  }

  async validatePassword(inputPassword, storedPassword) {
    if (!storedPassword) {
      // Usuario de Google sin password
      return false;
    }
    return await bcrypt.compare(inputPassword, storedPassword);
  }

  async updateLastLogin(userId) {
    try {
      const query = 'UPDATE users SET ultimo_inicio_sesion = NOW() WHERE id = $1';
      await this.query(query, [userId]);
    } catch (error) {
      console.error('Error actualizando último inicio de sesión:', error);
      // No lanzamos error ya que no es crítico
    }
  }
}

module.exports = User;
