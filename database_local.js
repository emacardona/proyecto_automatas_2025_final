// database_local.js
const mysql = require("mysql2");

// 🧩 Pool de conexiones para la base de datos local analizador_db
const dbAnalisis = mysql.createPool({
  host: "db_faceapi_dev",        // ✅ nombre del servicio MySQL en Docker Compose
  user: "root",
  password: "12345",         // ⚠️ asegúrate de que sea la misma contraseña usada en docker-compose
  database: "analizador_db", // ✅ nombre exacto de tu BD
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 🔍 Verificación inicial
dbAnalisis.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Error conectando con analizador_db:", err.message);
  } else {
    console.log("✅ Conexión comprobada desde database_local.js hacia analizador_db.");
    connection.release();
  }
});

// 📦 Exportar pool con promesas (para usar async/await)
module.exports = dbAnalisis.promise();
