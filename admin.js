// ==========================================================
// 🌐 SERVIDOR COMPATIBLE CON admin.html + admin.js (SIN CAMBIOS)
// ==========================================================
const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // donde está tu admin.html y admin.js

// Simular sesión activa
let sesionActiva = {
  id: 1,
  nombre: "Administrador del Sistema",
  rol: "ADMIN"
};

// ============================
// 🔐 SESIÓN
// ============================

// Verificar sesión
app.get("/session", (req, res) => {
  if (!sesionActiva) {
    return res.status(401).json({ success: false, message: "No hay sesión activa" });
  }
  res.json(sesionActiva);
});

// Cerrar sesión
app.post("/api/logout", (req, res) => {
  sesionActiva = null;
  res.json({ success: true, message: "Sesión cerrada correctamente." });
});

// ============================
// 👥 USUARIOS
// ============================
app.get("/api/usuarios", (req, res) => {
  res.json({
    success: true,
    usuarios: [
      { id: 1, nombre_completo: "Jose Felipe", email: "admin@umg.edu.gt", telefono: "5555-5555", rol: "ADMIN" },
      { id: 2, nombre_completo: "Carlos López", email: "carlos@umg.edu.gt", telefono: "4444-4444", rol: "USUARIO" },
      { id: 3, nombre_completo: "Ana Gómez", email: "ana@umg.edu.gt", telefono: "3333-3333", rol: "USUARIO" }
    ]
  });
});

// Eliminar usuario (simulado)
app.delete("/api/usuarios/:id", (req, res) => {
  const id = req.params.id;
  res.json({ success: true, message: `Usuario con ID ${id} eliminado correctamente.` });
});

// ============================
// 📊 ESTADÍSTICAS
// ============================
app.get("/api/estadisticas", (req, res) => {
  res.json({
    success: true,
    totalUsuarios: 3,
    totalAnalisis: 45,
    activos: 2
  });
});

// ============================
// 🚀 INICIAR SERVIDOR
// ============================
app.listen(PORT, () => {
  console.log(`✅ Servidor del Panel Admin corriendo en http://localhost:${PORT}`);
});
