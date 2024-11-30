const bcrypt = require('bcryptjs');

class User {
  constructor(db) {
    this.query = db.query;
  }

  async create(userData) {
    const { nombre, email, password } = userData;
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    try {
      const query = `
        INSERT INTO users (nombre, email, password, created_at) 
        VALUES ($1, $2, $3, NOW()) 
        RETURNING id, nombre, email
      `;
      const values = [nombre, email, hashedPassword];
      
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

  async validatePassword(inputPassword, storedPassword) {
    return await bcrypt.compare(inputPassword, storedPassword);
  }
}

module.exports = User;
