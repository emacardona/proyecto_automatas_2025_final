// ============================
// server.js — versión PRO optimizada con FaceAPI + PDF + QR + Correo + WhatsApp
// ============================
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const puppeteer = require("puppeteer");
const nlp = require("compromise");
require("dotenv").config();


// ✅ Solo dos conexiones reales
const dbCentral = require("./database");          // 🌐 base de datos central (nube)
const dbAnalisis = require("./database_local.js"); // 💻 base de datos local (analizador_db)
// Agregar después de: const nlp = require("compromise");

const natural = require('natural');
const stopword = require('stopword');
const jschardet = require('jschardet');
const validator = require('validator');

// Configurar stemmer para español
const stemmerEs = natural.PorterStemmerEs;
const tokenizerEs = new natural.WordTokenizer();

// 🔁 Conexión robusta con reintento automático a analizador_db
async function conectarAnalizadorDB() {
  try {
    const [rows] = await dbAnalisis.query("SELECT 1");
    console.log("✅ Conectado exitosamente a la base de datos local analizador_db.");
  } catch (err) {
    console.error("❌ Error conectando con analizador_db:", err.message);
    console.log("⏳ Reintentando conexión en 5 segundos...");
    setTimeout(conectarAnalizadorDB, 5000);
  }
}

conectarAnalizadorDB();



const { Canvas, Image, ImageData, createCanvas, loadImage } = require("canvas");
const faceapi = require("face-api.js");
const Jimp = require("jimp");
const axios = require("axios");
const { spawn } = require("child_process");


// ============================
// ⚙️ Express + Configuración base
// ============================
const app = express();
const port = 3000;

// ============================
// 🧩 Configuración de sesión
// ============================
const session = require("express-session");

app.use(session({
  secret: "6Lf-l_MrAAAAAMAoajYqtGvHjRszvvhe30LmgygI", // cambia por otra palabra secreta si quieres
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // false porque trabajas en http://localhost
}));


const faceRoutes = require("./routes/face_routes");
app.use("/", faceRoutes);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================
// 🧠 Cargar modelos FaceAPI
// ============================
const MODEL_PATH = path.join(__dirname, "models");
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH),
  faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH),
  faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH),
  faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_PATH),
]).then(() => console.log("✅ Modelos de FaceAPI cargados correctamente."));

// ============================
// 🏠 Página principal
// ============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});
// ============================
// 📩 Registrar usuario (con validación reCAPTCHA + FaceAPI + PDF + correo)
// ============================
// ============================
// 📩 Registrar usuario (SIN reCAPTCHA, conservando toda la lógica original)
// ============================
app.post("/api/registrar", upload.single("photo"), async (req, res) => {
  try {
    console.log("🟢 Iniciando registro de usuario (sin reCAPTCHA)...");

    // ==============================================
    // 📦 Registro real (idéntico a tu versión previa)
    // ==============================================
    const { nombre1, nombre2, nombre3, apellido1, apellido2, correo, telefono, cedula, filtro, password } = req.body;
    let fotoPath = null;

    if (req.file && req.file.path) {
      fotoPath = path.resolve(__dirname, req.file.path);
      console.log("📁 Foto subida correctamente:", fotoPath);
    } else {
      console.warn("⚠️ No se recibió archivo de foto en la solicitud.");
    }

    const codigoQR = `UMG-QR-${Math.floor(100000 + Math.random() * 900000)}`;
    const nombreCompleto = [nombre1, nombre2, nombre3, apellido1, apellido2].filter(Boolean).join(" ");
    const usuario = `${nombre1}.${apellido1}`.toLowerCase();

    const qrPath = `public/uploads/${codigoQR}.png`;
    const serverHost = process.env.HOST_PUBLIC || "http://localhost:3000";
    const qrURL = `${serverHost}/analizador.html?codigo=${codigoQR}`;

    // 🔹 Generar el QR
    await QRCode.toFile(qrPath, qrURL);
    const qrBuffer = fs.readFileSync(qrPath);

    let fotoFinalPath = fotoPath;
    let fotoFiltradaPath = null;
    let encodingFacial = null;

    // 🧠 Procesar foto si existe
    if (fotoPath) {
      try {
        const imageBuffer = fs.readFileSync(fotoPath);
        const imageBase64 = imageBuffer.toString("base64");

        const response = await axios.post(
          "http://www.server.daossystem.pro:3405/Rostro/Segmentar",
          { RostroA: imageBase64 },
          { headers: { "Content-Type": "application/json" }, timeout: 10000 }
        );

        if (response.data && response.data.rostro) {
          const imgData = Buffer.from(response.data.rostro, "base64");
          const segmentadoPath = path.resolve(__dirname, "public", "uploads", `${codigoQR}_rostro_segmentado.png`);
          fs.writeFileSync(segmentadoPath, imgData);

          // 🧠 Aplicar fondo gris uniforme
          const rostro = await Jimp.read(segmentadoPath);
          const fondoGris = new Jimp(rostro.bitmap.width, rostro.bitmap.height, 0xCCCCCCFF);
          fondoGris.composite(rostro, 0, 0);
          await fondoGris.writeAsync(segmentadoPath);
          console.log("🎨 Fondo gris aplicado al rostro segmentado.");

          // 🎭 Aplicar filtro visual (perro, lentes, mapache)
          const filtroSeleccionado = (filtro || "ninguno").toLowerCase();
          console.log("🎨 Aplicando filtro:", filtroSeleccionado);

          const overlayDir = path.join(__dirname, "filtros");
          const overlayPath = path.join(overlayDir, `${filtroSeleccionado}.png`);
          const canvasOriginal = await canvasLoadImage(segmentadoPath);

          let detection = await faceapi
            .detectSingleFace(canvasOriginal)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (!detection) {
            console.warn("⚠️ No se detectó rostro, intentando con TinyFaceDetector...");
            detection = await faceapi
              .detectSingleFace(canvasOriginal, new faceapi.TinyFaceDetectorOptions())
              .withFaceLandmarks()
              .withFaceDescriptor();
          }

          if (!detection) {
            console.warn("⚠️ No se detectó rostro en la imagen segmentada.");
          } else {
            console.log("✅ Rostro detectado correctamente con FaceAPI.");
          }

          if (["perro", "lentes", "mapache"].includes(filtroSeleccionado) && detection && detection.landmarks) {
            const landmarks = detection.landmarks;
            const jimpOverlay = await Jimp.read(overlayPath);
            const jimpImg = await Jimp.read(segmentadoPath);

            const leftEye = landmarks.getLeftEye();
            const rightEye = landmarks.getRightEye();
            const nose = landmarks.getNose();
            const jaw = landmarks.getJawOutline();

            const faceWidth = Math.abs(jaw[16].x - jaw[0].x);
            const centerX = (jaw[0].x + jaw[16].x) / 2;

            const ajustes = {
              perro: { scale: 1.5, offsetY: -faceWidth * 0.6 },
              lentes: { scale: 0.85, offsetY: -faceWidth * 0.35 },
              mapache: { scale: 1.0, offsetY: -faceWidth * 0.25 },
            };

            const cfg = ajustes[filtroSeleccionado];
            const newWidth = faceWidth * cfg.scale;
            const newHeight = newWidth * (jimpOverlay.bitmap.height / jimpOverlay.bitmap.width);
            const posX = centerX - newWidth / 2;
            const posY = nose[0].y + cfg.offsetY;

            jimpOverlay.resize(newWidth, newHeight);
            jimpImg.composite(jimpOverlay, posX, posY, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 0.9 });

            const outputPath = path.join(__dirname, "public", "uploads", `${codigoQR}_rostro_filtrado.jpg`);
            await jimpImg.quality(90).writeAsync(outputPath);
            fotoFiltradaPath = outputPath;
            console.log(`✅ Filtro aplicado correctamente (${filtroSeleccionado}).`);
          }
        } else {
          console.warn("⚠️ No se recibió rostro segmentado desde el servidor.");
        }
      } catch (errFace) {
        console.error("⚠️ Error procesando la foto:", errFace);
      }
    }

    // 💾 Guardar usuario
    const sqlUsuario = `CALL sp_registrar_usuario(?, ?, ?, ?, ?, ?, ?, ?, @p_resultado, @p_mensaje);`;

    // 🧩 Convertir imagen a base64 comprimido
    let imgBase64 = null;
    if (fotoFinalPath && fs.existsSync(fotoFinalPath)) {
      const jimpImg = await Jimp.read(fotoFinalPath);
      const maxWidth = 300;
      if (jimpImg.bitmap.width > maxWidth) jimpImg.resize(maxWidth, Jimp.AUTO);
      const tempPath = path.join(__dirname, "public", "uploads", `${codigoQR}_mini.jpg`);
      await jimpImg.quality(60).writeAsync(tempPath);
      const buffer = fs.readFileSync(tempPath);
      imgBase64 = buffer.toString("base64");
      fs.unlinkSync(tempPath);
    }

    dbCentral.query(sqlUsuario, [usuario, correo, nombreCompleto, password, telefono, imgBase64, 1, 1], async (err) => {
      if (err) {
        console.error("❌ Error al guardar en usuarios:", err);
        return res.status(500).json({ success: false, message: "Error al guardar usuario." });
      }

      const [rowsId] = await dbCentral.promise().query("SELECT id FROM usuarios WHERE email = ? LIMIT 1", [correo]);
      const usuarioId = rowsId?.[0]?.id;
      if (!usuarioId) {
        console.error("❌ Usuario no encontrado tras registro.");
        return res.status(500).json({ success: false, message: "Usuario no encontrado tras registro." });
      }

      // 🧩 Asignar rol por defecto
      try {
        const [rolRow] = await dbAnalisis.query("SELECT id FROM roles WHERE nombre = 'ANALISTA' LIMIT 1");
        if (rolRow.length) {
          await dbAnalisis.query("INSERT INTO usuarios_roles (id_usuario, id_rol) VALUES (?, ?)", [usuarioId, rolRow[0].id]);
          console.log("✅ Rol ANALISTA asignado al usuario", usuarioId);
        } else {
          console.warn("⚠️ No se encontró rol ANALISTA en la base local.");
        }
      } catch (errorRol) {
        console.error("⚠️ Error asignando rol por defecto:", errorRol.message);
      }

      // 🧾 Guardar autenticación facial si existe
      if (encodingFacial) {
        await dbCentral.promise().query(
          `INSERT INTO autenticacion_facial (usuario_id, encoding_facial, imagen_referencia, activo, fecha_creacion)
           VALUES (?, ?, ?, 1, NOW())`,
          [usuarioId, encodingFacial, imgBase64]
        );
        console.log("✅ Registro facial guardado correctamente.");
      }

      // 📦 Guardar QR
      const crypto = require("crypto");
      const qrHash = crypto.createHash("sha256").update(codigoQR).digest("hex");
      await dbCentral.promise().query(
        `INSERT INTO codigos_qr (usuario_id, codigo_qr, qr_hash, activo)
         VALUES (?, ?, ?, 1)`,
        [usuarioId, codigoQR, qrHash]
      );

      // 📤 Generar PDF y enviar por correo
      await generarPDFsYEnviarCorreo({
        nombre1,
        apellido1,
        nombreCompleto,
        correo,
        telefono,
        cedula,
        filtro,
        imgOriginalPath: fotoPath,
        imgFiltradaPath: fotoFiltradaPath,
        qrBuffer,
        codigoQR,
        qrPath,
      });

      res.json({ success: true, message: "✅ Usuario registrado correctamente sin verificación reCAPTCHA." });
    });
  } catch (error) {
    console.error("❌ Error general en /api/registrar:", error);
    res.status(500).json({ success: false, message: "Error general del servidor." });
  }
});





// ============================
// 🔑 Login por código QR (base centralizada)
// ============================
app.post("/api/login-qr", (req, res) => {
  let { codigo } = req.body;
  if (!codigo)
    return res.status(400).json({ success: false, message: "Código QR inválido" });

  // 🧩 Si el QR trae la URL completa, extraemos el código
  const match = codigo.match(/codigo=([^&]+)/);
  if (match) codigo = match[1];

  const sql = `
    SELECT u.id, u.nombre_completo, u.email, u.telefono
    FROM codigos_qr q
    INNER JOIN usuarios u ON q.usuario_id = u.id
    WHERE q.codigo_qr = ? AND q.activo = 1
  `;

  dbCentral.query(sql, [codigo], (err, results) => {
    if (err) {
      console.error("❌ Error en login QR:", err);
      return res.status(500).json({ success: false, message: "Error en el servidor" });
    }

    if (results.length === 0)
      return res.status(401).json({ success: false, message: "QR no registrado o inactivo" });

    const user = results[0];
    console.log(`✅ Login QR exitoso para ${user.nombre_completo} (${user.email})`);
    res.json({
      success: true,
      message: `Bienvenido, ${user.nombre_completo}`,
      usuario: user,
    });
  });
});


// ============================
// 🔍 Verificar carné QR (Base Centralizada)
// ============================
app.get("/verificar", (req, res) => {
  const { codigo } = req.query;
  if (!codigo) return res.send("<h3>⚠️ Código no proporcionado.</h3>");

  const sql = `
    SELECT u.*, q.codigo_qr
    FROM codigos_qr q
    INNER JOIN usuarios u ON q.usuario_id = u.id
    WHERE q.codigo_qr = ? AND q.activo = 1
  `;

  dbCentral.query(sql, [codigo], (err, results) => {
    if (err || results.length === 0)
      return res.send("<h3>❌ QR no registrado o inválido.</h3>");

    const user = results[0];
    res.send(`
      <div style="text-align:center;font-family:sans-serif;padding:30px;">
        <img src="https://upload.wikimedia.org/wikipedia/commons/3/39/Logo_UMG.png" width="90">
        <h2>Carné UMG — ${user.nombre_completo}</h2>
        <p><b>Código QR:</b> ${user.codigo_qr}</p>
        <p><b>Correo:</b> ${user.email}</p>
        <p><b>Teléfono:</b> ${user.telefono}</p>
        <p style="color:green;font-weight:bold;">Estado: ACTIVO ✅</p>
      </div>
    `);
  });
});


// ============================
// 👁️ LOGIN POR RECONOCIMIENTO FACIAL (Base Centralizada)
// ============================
app.post("/api/login-face", upload.single("rostro"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No se envió imagen." });

    const uploadedImage = await canvasLoadImage(req.file.path);
    const detection = await faceapi.detectSingleFace(uploadedImage).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: "No se detectó ningún rostro." });
    }

    // Obtener todos los usuarios con rostro registrado
    const query = `
      SELECT a.usuario_id, a.imagen_referencia, a.encoding_facial, u.nombre_completo
      FROM autenticacion_facial a
      INNER JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.activo = 1
    `;

    dbCentral.query(query, async (err, results) => {
      if (err) {
        console.error("Error al obtener datos faciales:", err);
        return res.status(500).json({ success: false, message: "Error en el servidor." });
      }

      let mejorCoincidencia = null;
      let menorDistancia = 1.0;

      for (const user of results) {
        try {
          const dbEncoding = JSON.parse(user.encoding_facial);
          const distancia = faceapi.euclideanDistance(detection.descriptor, Float32Array.from(dbEncoding));
          if (distancia < menorDistancia) {
            menorDistancia = distancia;
            mejorCoincidencia = user;
          }
        } catch (e) {
          console.error("Error comparando con usuario:", user.usuario_id, e.message);
        }
      }

      fs.unlinkSync(req.file.path);

      if (mejorCoincidencia && menorDistancia < 0.85) {
        console.log(`✅ Rostro reconocido: ${mejorCoincidencia.nombre_completo} (distancia ${menorDistancia.toFixed(2)})`);

        // 🔹 Obtener datos completos del usuario (para incluir email y teléfono)
        // 🔹 Obtener datos completos del usuario (para incluir email y teléfono)
        dbCentral.query(
          "SELECT id, nombre_completo, email, telefono FROM usuarios WHERE id = ? LIMIT 1",
          [mejorCoincidencia.usuario_id],
          (err2, rows2) => {
            if (err2 || !rows2.length) {
              console.error("⚠️ No se pudo obtener datos completos del usuario:", err2);
              return res.json({
                success: true,
                message: `Bienvenido, ${mejorCoincidencia.nombre_completo}`,
                usuario: mejorCoincidencia, // fallback
              });
            }

            const user = rows2[0];
            res.json({
              success: true,
              message: `Bienvenido, ${user.nombre_completo}`,
              usuario: user,
            });
          }
        );
      } else {
        console.log("❌ Ninguna coincidencia facial encontrada.");
        return res.status(401).json({ success: false, message: "Rostro no reconocido." });
      }

    }); // ✅ cierre del db.query

  } catch (error) {
    console.error("❌ Error general en /api/login-face:", error);
    res.status(500).json({ success: false, message: "Error general del servidor." });
  }
}); // ✅ cierre del endpoint /api/login-face

async function renderHtmlToPdf(htmlString, outPath) {
  const puppeteer = require("puppeteer");
  const fs = require("fs");
  const path = require("path");

  // 🧩 Verifica que la carpeta exista antes de generar el PDF
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
    ],
  });

  try {
    const page = await browser.newPage();

    // Aumentamos el tiempo máximo a 60 segundos
    await page.setContent(htmlString, { waitUntil: "load", timeout: 60000 });

    await page.emulateMediaType("screen");
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0cm", bottom: "0cm", left: "0cm", right: "0cm" },
    });

    console.log(`✅ PDF generado correctamente en: ${outPath}`);
  } catch (err) {
    console.error("⚠️ Error generando PDF:", err);
  } finally {
    await browser.close();
  }
}


// ============================
// 🧾 Generar PDFs y enviar por correo (Puppeteer)
// ============================
async function generarPDFsYEnviarCorreo({
  nombre1,
  apellido1,
  nombreCompleto,
  correo,
  telefono,
  cedula,
  filtro,
  imgOriginalPath,
  imgFiltradaPath,
  qrBuffer,
  codigoQR,
  qrPath
}) {
  console.log("🧾 Entrando a generarPDFsYEnviarCorreo (Puppeteer)...");
  try {
    const htmlTemplate = fs.readFileSync(
      path.join(__dirname, "public", "plantilla_carnet.html"),
      "utf8"
    );

    const logoFile = path.join(__dirname, "public", "img", "logo_umg.png");
    const logoBase64 = fs.readFileSync(logoFile).toString("base64");
    const logoData = `data:image/png;base64,${logoBase64}`;

    const qrData = `data:image/png;base64,${qrBuffer.toString("base64")}`;
    const imgOriginalBase64 = fs.readFileSync(imgOriginalPath).toString("base64");
    const fotoDataNormal = `data:image/jpeg;base64,${imgOriginalBase64}`;

    let fotoDataFiltro = fotoDataNormal;
    if (imgFiltradaPath && fs.existsSync(imgFiltradaPath)) {
      const imgFiltradaBase64 = fs.readFileSync(imgFiltradaPath).toString("base64");
      fotoDataFiltro = `data:image/jpeg;base64,${imgFiltradaBase64}`;
    }

    const baseReplacements = (tpl, versionTexto, color) =>
      tpl
        .replace(/{{LOGO}}/g, logoData)
        .replace(/{{NOMBRE}}/g, nombreCompleto)
        .replace(/{{CEDULA}}/g, cedula || "N/A")
        .replace(/{{CORREO}}/g, correo)
        .replace(/{{TELEFONO}}/g, telefono)
        .replace(/{{CODIGO}}/g, codigoQR)
        .replace(/{{QR}}/g, qrData)
        .replace(/{{FILTRO}}/g, versionTexto)
        .replace(/{{BANDA_COLOR}}/g, color);

    const htmlConFiltro = baseReplacements(htmlTemplate, "CON FILTRO", "#0069d9")
      .replace(/{{FOTO}}/g, fotoDataFiltro);
    const htmlSinFiltro = baseReplacements(htmlTemplate, "SIN FILTRO", "#6c757d")
      .replace(/{{FOTO}}/g, fotoDataNormal);

    const pdfConFiltroPath = path.join(__dirname, "public", "uploads", `${codigoQR}_carnet.pdf`);
    const pdfSinFiltroPath = path.join(__dirname, "public", "uploads", `${codigoQR}_sin_filtro.pdf`);

    console.log("📄 Generando PDF con filtro...");
    await renderHtmlToPdf(htmlConFiltro, pdfConFiltroPath);
    console.log("✅ PDF con filtro generado:", pdfConFiltroPath);

    console.log("📄 Generando PDF sin filtro...");
    await renderHtmlToPdf(htmlSinFiltro, pdfSinFiltroPath);
    console.log("✅ PDF sin filtro generado:", pdfSinFiltroPath);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: '"UMG - Registro" <joseemmanuelfelipefranco@gmail.com>',
      to: correo,
      subject: "🎓 Carné Universitario UMG — Registro exitoso",
      html: `<h3>Bienvenido ${nombre1} ${apellido1}</h3>
             <p>Adjuntamos tus carnés (con y sin filtro).</p>
             <p>Escanea tu código QR para iniciar sesión o verificar tu identidad.</p>`,
      attachments: [
        { filename: "carnet_umg_con_filtro.pdf", path: pdfConFiltroPath },
        { filename: "carnet_umg_sin_filtro.pdf", path: pdfSinFiltroPath },
        { filename: "qr.png", path: qrPath },
      ],
    });

    console.log(`📧 Correo enviado correctamente a ${correo}`);
  } catch (error) {
    console.error("❌ Error al generar/enviar PDFs con Puppeteer:", error);
  }
}


// ============================
// 🧠 ANALIZADOR LÉXICO MEJORADO - FUNCIONAL PARA ESPAÑOL
// ============================
app.post("/analizar", upload.single("archivo"), async (req, res) => {
  try {
    const idioma = req.body.idioma?.toLowerCase() || "es";
    const idUsuario = req.body.id_usuario || null;

    // ✅ Validaciones
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó archivo" });
    }

    if (!req.file.originalname.endsWith('.txt')) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Solo se permiten archivos .txt" });
    }

    if (req.file.size > 5 * 1024 * 1024) { // 5MB
      fs.unlinkSync(req.file.path);
      return res.status(413).json({ error: "Archivo muy grande (máx. 5MB)" });
    }

    // ✅ Detectar encoding automáticamente
    const buffer = fs.readFileSync(req.file.path);
    const deteccion = jschardet.detect(buffer);
    const encoding = deteccion.encoding || 'utf8';
    let contenido = buffer.toString(encoding);

    // ✅ Sanitizar contenido
    contenido = contenido
      .replace(/&[#A-Za-z0-9]+;/g, "")   // elimina entidades HTML (&...;)
      .replace(/[^\wÁÉÍÓÚáéíóúñÑ\s.,!?/-]/g, "") // mantiene solo texto, números y signos básicos
      .trim();
    contenido = contenido.trim();

    if (contenido.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "El archivo está vacío" });
    }

    console.log(`📝 Analizando archivo: ${req.file.originalname} (${idioma})`);

    let resultado;

    // ✅ Análisis según idioma
    if (idioma === 'es' || idioma === 'español') {
      resultado = analizarEspanol(contenido);
    } else if (idioma === 'en' || idioma === 'inglés' || idioma === 'ingles') {
      resultado = analizarIngles(contenido);
    } else if (idioma === 'ru' || idioma === 'ruso') {
      resultado = analizarRuso(contenido);
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Idioma no soportado. Use: español, inglés o ruso" });
    }

    // ✅ Clasificaciones adicionales (aplica a todos los idiomas)
    const adicionales = clasificacionesAdicionales(contenido);

    // ✅ Respuesta completa
    const respuesta = {
      idioma,
      ...resultado,
      ...adicionales,
      texto: contenido
    };

    // 💾 Guardar en base de datos local
    const sql = `
      INSERT INTO analisis (
        id_usuario, nombre_archivo, idioma, total_palabras, total_caracteres,
        pronombres_json, entidades_json, lemas_json, fecha
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW());
    `;

    dbAnalisis.query(sql, [
      idUsuario,
      req.file.originalname,
      idioma,
      respuesta.totalPalabras,
      respuesta.totalCaracteres,
      JSON.stringify(respuesta.pronombres || []),
      JSON.stringify({ personas: respuesta.personas || [], lugares: respuesta.lugares || [] }),
      JSON.stringify({ sustantivos: respuesta.sustantivos || [], verbos: respuesta.verbos || [] })
    ], (err) => {
      if (err) console.error("⚠️ Error guardando en analizador_db:", err.message);
      else console.log(`✅ Análisis guardado correctamente (${req.file.originalname})`);
    });

    res.json(respuesta);
    fs.unlinkSync(req.file.path);

  } catch (error) {
    console.error("❌ Error en /analizar:", error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: "Error al procesar análisis: " + error.message });
  }
});


// ============================
// 🔧 FUNCIONES AUXILIARES PARA ANÁLISIS
// ============================

// 📊 Análisis para ESPAÑOL (funcional)
function analizarEspanol(contenido) {
  // Tokenizar
  const palabras = tokenizerEs.tokenize(contenido.toLowerCase());

  // Pronombres personales en español
  const PRONOMBRES_ES = ['yo', 'tú', 'él', 'ella', 'nosotros', 'nosotras',
    'vosotros', 'vosotras', 'ellos', 'ellas', 'usted',
    'ustedes', 'me', 'te', 'se', 'le', 'nos', 'os', 'les',
    'mi', 'tu', 'su', 'nuestro', 'vuestro'];

  const pronombres = [...new Set(palabras.filter(p => PRONOMBRES_ES.includes(p)))];

  // ✅ Detectar personas (nombres propios - 2+ palabras capitalizadas)
  const patronPersonas = /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\b/g;
  const personasCandidatas = contenido.match(patronPersonas) || [];

  // Filtrar nombres comunes en español
  const NOMBRES_COMUNES = ['María', 'José', 'Juan', 'Ana', 'Carlos', 'Luis', 'Pedro',
    'Mariano', 'Gálvez', 'García', 'Rodríguez', 'Martínez',
    'González', 'López', 'Hernández', 'Pérez'];

  const personas = [...new Set(personasCandidatas.filter(candidato => {
    const palabrasNombre = candidato.split(' ');
    return palabrasNombre.some(palabra => NOMBRES_COMUNES.includes(palabra));
  }))];

  // ✅ Detectar lugares
  const LUGARES_ES = ['Guatemala', 'México', 'España', 'Argentina', 'Colombia', 'Chile',
    'Perú', 'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay',
    'Costa Rica', 'Panamá', 'Cuba', 'República Dominicana', 'Honduras',
    'El Salvador', 'Nicaragua', 'Ciudad de Guatemala', 'Antigua',
    'Quetzaltenango', 'Mixco', 'Villa Nueva', 'Madrid', 'Barcelona',
    'Buenos Aires', 'Bogotá', 'Lima', 'Santiago', 'Caracas'];

  const lugares = [...new Set(
    LUGARES_ES.filter(lugar => {
      const regex = new RegExp(`\\b${lugar}\\b`, 'gi');
      return regex.test(contenido);
    })
  )];

  // ✅ Detectar verbos (terminaciones comunes)
  const terminacionesVerbos = ['ar', 'er', 'ir', 'ando', 'iendo', 'ado', 'ido',
    'aba', 'ía', 'ará', 'erá', 'irá'];
  const verbosDetectados = palabras.filter(p =>
    terminacionesVerbos.some(t => p.endsWith(t)) && p.length > 3
  );

  // ✅ Lematizar verbos (forma raíz)
  const verbos = [...new Set(verbosDetectados.map(v => stemmerEs.stem(v)))].slice(0, 30);

  // ✅ Detectar sustantivos (terminaciones comunes)
  const terminacionesSustantivos = ['ción', 'sión', 'dad', 'tad', 'miento', 'ismo',
    'ista', 'anza', 'encia', 'ancia'];
  const sustantivosDetectados = palabras.filter(p =>
    terminacionesSustantivos.some(t => p.endsWith(t)) ||
    (p.length > 4 && !terminacionesVerbos.some(t => p.endsWith(t)))
  );

  // ✅ Lematizar sustantivos
  const sustantivos = [...new Set(sustantivosDetectados.map(s => stemmerEs.stem(s)))].slice(0, 30);

  // 📊 Calcular frecuencias (filtrar stopwords)
  const stopwordsEs = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'al', 'a', 'en', 'por', 'para', 'con',
    'sin', 'sobre', 'entre', 'que', 'como', 'pero', 'si',
    'no', 'ni', 'y', 'o', 'u', 'es', 'son', 'está', 'están'];

  const palabrasFiltradas = palabras.filter(p =>
    p.length > 2 &&
    !stopwordsEs.includes(p) &&
    !/^\d+$/.test(p) &&        // excluye números puros
    !/^[x#]+[a-z0-9]+$/i.test(p) // excluye tokens tipo x2f, &#...
  );
  const frecuencia = {};
  palabrasFiltradas.forEach(p => {
    frecuencia[p] = (frecuencia[p] || 0) + 1;
  });

  const topPalabras = Object.entries(frecuencia)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const menosPalabras = Object.entries(frecuencia)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 10);

  // Estadísticas adicionales
  const palabrasUnicas = Object.keys(frecuencia).length;
  const densidadLexica = ((palabrasUnicas / palabras.length) * 100).toFixed(2) + '%';
  const totalOraciones = (contenido.match(/[.!?]+/g) || []).length;

  return {
    totalPalabras: palabras.length,
    totalCaracteres: contenido.length,
    palabrasUnicas,
    densidadLexica,
    totalOraciones,
    topPalabras,
    menosPalabras,
    pronombres,
    personas,
    lugares,
    verbos,
    sustantivos
  };
}

/// 📊 Análisis para INGLÉS (versión estricta y segura con Compromise)
function analizarIngles(contenido) {
  try {
    // 🧹 1. Sanitizar texto para eliminar caracteres peligrosos
    contenido = String(contenido || "")
      .replace(/[^\w\s.,!?'"-]/g, "")   // elimina símbolos no alfabéticos
      .replace(/\s+/g, " ")             // colapsa espacios múltiples
      .trim();

    if (!contenido || contenido.length < 3) {
      throw new Error("El texto a analizar está vacío o es demasiado corto.");
    }

    // 🧠 2. Crear documento NLP con compromise
    const doc = nlp(contenido);

    // 🧩 3. Tokenizar palabras válidas (solo letras)
    const palabras = contenido.match(/\b[a-zA-Z]+\b/g) || [];
    if (palabras.length === 0) {
      throw new Error("No se detectaron palabras válidas en el texto.");
    }

    // 🧱 4. Lista ampliada de stopwords (palabras comunes que no aportan significado)
    const stopwordsEn = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from",
      "is", "are", "was", "were", "been", "be", "being", "been", "have", "has", "had",
      "this", "that", "these", "those", "it", "its", "he", "she", "they", "we", "you", "i", "me", "my",
      "your", "his", "her", "our", "their", "mine", "ours", "yours", "theirs", "as", "if", "then", "so"
    ]);

    // 🔍 5. Filtrar palabras significativas
    const palabrasFiltradas = palabras
      .map(p => p.toLowerCase())
      .filter(p => p.length > 2 && !stopwordsEn.has(p));

    if (palabrasFiltradas.length === 0) {
      throw new Error("El texto no contiene palabras significativas para analizar.");
    }

    // 📊 6. Calcular frecuencias
    const frecuencia = {};
    for (const palabra of palabrasFiltradas) {
      frecuencia[palabra] = (frecuencia[palabra] || 0) + 1;
    }

    const topPalabras = Object.entries(frecuencia)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const menosPalabras = Object.entries(frecuencia)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10);

    // 📈 7. Estadísticas generales
    const totalPalabras = palabras.length;
    const totalCaracteres = contenido.length;
    const palabrasUnicas = Object.keys(frecuencia).length;
    const densidadLexica = ((palabrasUnicas / totalPalabras) * 100).toFixed(2) + "%";
    const totalOraciones = (contenido.match(/[.!?]+/g) || []).length;

    // 🧠 8. Extracción lingüística con compromise
    const pronombres = [...new Set(doc.pronouns().out("array"))];
    const personas = [...new Set(doc.people().out("array"))];
    const lugares = [...new Set(doc.places().out("array"))];
    const verbos = [...new Set(doc.verbs().toInfinitive().out("array"))].slice(0, 30);
    const sustantivos = [...new Set(doc.nouns().toSingular().out("array"))].slice(0, 30);

    // ✅ 9. Resultado final
    return {
      totalPalabras,
      totalCaracteres,
      palabrasUnicas,
      densidadLexica,
      totalOraciones,
      topPalabras,
      menosPalabras,
      pronombres,
      personas,
      lugares,
      verbos,
      sustantivos
    };

  } catch (error) {
    console.error("❌ Error en analizarIngles():", error.message);
    // 🧾 Respuesta de error segura
    return {
      error: "Error durante el análisis en inglés: " + error.message,
      totalPalabras: 0,
      totalCaracteres: 0,
      palabrasUnicas: 0,
      densidadLexica: "0%",
      totalOraciones: 0,
      topPalabras: [],
      menosPalabras: [],
      pronombres: [],
      personas: [],
      lugares: [],
      verbos: [],
      sustantivos: []
    };
  }
}
// 📊 Análisis para RUSO (versión estricta y segura)
function analizarRuso(contenido) {
  try {
    // 🧹 1. Sanitizar texto (solo caracteres cirílicos, signos básicos y espacios)
    contenido = String(contenido || "")
      .replace(/[^\p{Script=Cyrillic}\s.,!?'"-]/gu, "") // deja solo letras cirílicas y puntuación
      .replace(/\s+/g, " ")
      .trim();

    if (!contenido || contenido.length < 3) {
      throw new Error("El texto a analizar está vacío o es demasiado corto.");
    }

    // 🧩 2. Tokenizar palabras rusas (alfabeto cirílico)
    const palabras = contenido.match(/[\p{Script=Cyrillic}]+/gu) || [];

    if (palabras.length === 0) {
      throw new Error("No se detectaron palabras válidas en alfabeto cirílico.");
    }

    // 🧱 3. Stopwords básicas en ruso (palabras comunes sin valor léxico)
    const stopwordsRu = new Set([
      "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то", "все", "она",
      "так", "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по", "ее", "мне", "было",
      "вот", "от", "меня", "еще", "нет", "о", "из", "ему", "теперь", "когда", "даже", "ну",
      "вдруг", "ли", "если", "уже", "или", "ни", "быть", "был", "него", "до", "вас", "нибудь",
      "опять", "уж", "вам", "сказал", "ведь", "там", "потом", "себя", "ничего", "ей", "может",
      "они", "тут", "где", "есть", "надо", "ней", "для", "мы", "тебя", "их", "чем", "была", "сам",
      "чтоб", "без", "будто", "чего", "раз", "тоже", "себе", "под", "будет", "ж", "тогда", "кто",
      "этот", "того", "потому", "этого", "какой", "совсем", "ним", "здесь", "этом", "один",
      "почти", "мой", "тем", "чтобы", "нее", "сейчас", "были", "куда", "зачем", "всех", "можно"
    ]);

    // 🔍 4. Filtrar palabras significativas
    const palabrasFiltradas = palabras
      .map(p => p.toLowerCase())
      .filter(p => p.length > 2 && !stopwordsRu.has(p));

    if (palabrasFiltradas.length === 0) {
      throw new Error("El texto no contiene palabras significativas para analizar.");
    }

    // 📊 5. Calcular frecuencias de palabras
    const frecuencia = {};
    for (const palabra of palabrasFiltradas) {
      frecuencia[palabra] = (frecuencia[palabra] || 0) + 1;
    }

    const topPalabras = Object.entries(frecuencia)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const menosPalabras = Object.entries(frecuencia)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 10);

    // 📈 6. Métricas generales
    const totalPalabras = palabras.length;
    const totalCaracteres = contenido.length;
    const palabrasUnicas = Object.keys(frecuencia).length;
    const densidadLexica = ((palabrasUnicas / totalPalabras) * 100).toFixed(2) + "%";
    const totalOraciones = (contenido.match(/[.!?]+/g) || []).length;

    // ⚙️ 7. No hay análisis semántico avanzado (por compatibilidad)
    // Se devuelven listas vacías, pero mantenemos estructura uniforme
    const pronombres = [];
    const personas = [];
    const lugares = [];
    const verbos = [];
    const sustantivos = [];

    // ✅ 8. Resultado final
    return {
      totalPalabras,
      totalCaracteres,
      palabrasUnicas,
      densidadLexica,
      totalOraciones,
      topPalabras,
      menosPalabras,
      pronombres,
      personas,
      lugares,
      verbos,
      sustantivos
    };

  } catch (error) {
    console.error("❌ Error en analizarRuso():", error.message);
    return {
      error: "Error durante el análisis en ruso: " + error.message,
      totalPalabras: 0,
      totalCaracteres: 0,
      palabrasUnicas: 0,
      densidadLexica: "0%",
      totalOraciones: 0,
      topPalabras: [],
      menosPalabras: [],
      pronombres: [],
      personas: [],
      lugares: [],
      verbos: [],
      sustantivos: []
    };
  }
}


// 📊 Clasificaciones adicionales (todos los idiomas)
function clasificacionesAdicionales(contenido) {
  return {
    fechas: contenido.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || [],
    numeros: contenido.match(/\b\d+(?:\.\d+)?\b/g) || [],
    emails: contenido.match(/\b[\w._%+-]+@[\w.-]+\.[a-z]{2,}\b/gi) || [],
    urls: contenido.match(/https?:\/\/[^\s]+/gi) || [],
    telefonos: contenido.match(/\b\d{4}[-\s]?\d{4}\b/g) || []
  };
}

// ============================
// 📄 GENERAR REPORTE PDF DEL ANÁLISIS (UTF-8 corregido)
// ============================
const PDFDocument = require("pdfkit");


app.post("/generar-pdf", async (req, res) => {
  try {
    const { resultados } = req.body;
    if (!resultados) {
      return res.status(400).json({ error: "No se recibieron datos para generar el PDF." });
    }

    // 📘 Crear el documento PDF
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: "Reporte de Análisis Léxico Multilingüe",
        Author: "Universidad Mariano Gálvez de Guatemala",
      },
    });

    // ✅ Usar fuente Unicode compatible (sin descargar nada)
    doc.registerFont("UMGFont", UnicodeCIDFont("HeiseiKakuGo-W5"));
    doc.font("UMGFont");

    const fileName = `reporte_analisis_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, "public", "uploads", fileName);
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // 🎓 Encabezado institucional
    doc
      .fontSize(18)
      .fillColor("#003366")
      .text("Universidad Mariano Gálvez de Guatemala", { align: "center" })
      .moveDown(0.3)
      .fontSize(13)
      .fillColor("#c5a200")
      .text("Reporte de Análisis Léxico Multilingüe", { align: "center" })
      .moveDown(1);

    // 📋 Datos generales
    doc
      .fontSize(12)
      .fillColor("#000")
      .text(`👤 Usuario: ${resultados.usuario || "—"}`)
      .text(`📧 Correo: ${resultados.correo || "—"}`)
      .text(`🌍 Idioma: ${resultados.idioma}`)
      .text(`📝 Total palabras: ${resultados.totalPalabras}`)
      .text(`🔤 Total caracteres: ${resultados.totalCaracteres}`)
      .moveDown(1);

    // 🔝 Palabras más frecuentes
    doc.fontSize(13).fillColor("#003366").text("🔝 Top palabras más frecuentes:", { underline: true });
    doc.fontSize(11).fillColor("#000").list(resultados.topPalabras.map(([w, c]) => `${w}: ${c}`));
    doc.moveDown();

    // 🔻 Palabras menos frecuentes
    doc.fontSize(13).fillColor("#003366").text("🔻 Palabras menos frecuentes:", { underline: true });
    doc.fontSize(11).fillColor("#000").list(resultados.menosPalabras.map(([w, c]) => `${w}: ${c}`));
    doc.moveDown();

    // 💬 Entidades detectadas
    doc.fontSize(13).fillColor("#003366").text("📋 Entidades Detectadas:", { underline: true });
    doc.fontSize(11).fillColor("#000")
      .text(`💬 Pronombres: ${resultados.pronombres.join(", ") || "N/A"}`)
      .text(`👤 Personas: ${resultados.personas.join(", ") || "N/A"}`)
      .text(`📍 Lugares: ${resultados.lugares.join(", ") || "N/A"}`)
      .text(`🧩 Sustantivos: ${resultados.sustantivos.slice(0, 20).join(", ") || "N/A"}`)
      .text(`🔠 Verbos: ${resultados.verbos.slice(0, 20).join(", ") || "N/A"}`)
      .moveDown(1);

    // 🧠 Texto analizado
    doc.fontSize(13).fillColor("#003366").text("🧠 Texto Analizado:", { underline: true });
    doc.fontSize(11).fillColor("#000").text(resultados.texto, { align: "justify" });

    // 🏁 Pie institucional
    doc.moveDown(2);
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(
        "Generado automáticamente por el Sistema de Análisis Léxico Multilingüe — Universidad Mariano Gálvez 2025",
        { align: "center" }
      );

    doc.end();

    // 📨 Enviar el archivo generado
    stream.on("finish", () => {
      res.download(filePath, fileName, (err) => {
        if (err) console.error("⚠️ Error al enviar PDF:", err);
        fs.unlinkSync(filePath);
      });
    });
  } catch (error) {
    console.error("❌ Error generando PDF:", error);
    res.status(500).json({ error: "Error al generar el PDF." });
  }
});



// ============================
// 📧 Enviar resultados del análisis por correo (Versión Estable + Logs + Validación PDF)
// ============================
app.post("/enviar-correo", async (req, res) => {
  try {
    const { correo, nombre, resultados } = req.body;

    // ⚠️ Validaciones básicas
    if (!correo || !resultados) {
      return res.status(400).json({ success: false, message: "Faltan datos obligatorios (correo o resultados)." });
    }

    // 📄 Crear PDF temporal
    const pdfPath = path.join(__dirname, "public", "uploads", `analisis_${Date.now()}.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // 🖼️ Logo institucional (si existe)
    const logoPath = path.join(__dirname, "public", "assets", "umg_logo.png");
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 70 });

    doc
      .fontSize(20)
      .fillColor("#003366")
      .text("Universidad Mariano Gálvez de Guatemala", 130, 50, { align: "left" });
    doc
      .fontSize(14)
      .fillColor("#555")
      .text("📊 Reporte de Análisis Léxico Multilingüe", 130, 70);
    doc.moveDown(2);

    // 📋 Datos generales
    doc
      .fontSize(12)
      .fillColor("#000")
      .text(`👤 Usuario: ${nombre || "Anónimo"}`)
      .text(`✉️ Correo: ${correo}`)
      .text(`🌐 Idioma: ${resultados.idioma}`)
      .text(`📝 Total palabras: ${resultados.totalPalabras}`)
      .text(`🔠 Total caracteres: ${resultados.totalCaracteres}`)
      .moveDown();

    // 🔹 Línea separadora
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke("#0055a5").moveDown(1);

    // 🔝 Palabras más y menos frecuentes
    doc.font("Helvetica-Bold").fillColor("#003366").text("Top palabras más frecuentes:");
    doc.font("Helvetica").fillColor("#000");
    resultados.topPalabras?.forEach(([w, c]) => doc.text(`• ${w}: ${c}`));
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fillColor("#003366").text("Palabras menos frecuentes:");
    doc.font("Helvetica").fillColor("#000");
    resultados.menosPalabras?.forEach(([w, c]) => doc.text(`• ${w}: ${c}`));
    doc.moveDown(1);

    // 🧠 Entidades lingüísticas
    doc.font("Helvetica-Bold").fillColor("#003366").text("Entidades detectadas:");
    doc.font("Helvetica").fillColor("#000");
    doc.text(`Pronombres: ${resultados.pronombres?.join(", ") || "N/A"}`);
    doc.text(`Personas: ${resultados.personas?.join(", ") || "N/A"}`);
    doc.text(`Lugares: ${resultados.lugares?.join(", ") || "N/A"}`);
    doc.text(`Sustantivos: ${resultados.sustantivos?.join(", ") || "N/A"}`);
    doc.text(`Verbos: ${resultados.verbos?.join(", ") || "N/A"}`);
    doc.moveDown(2);

    // 📄 Texto original analizado
    doc.font("Helvetica-Bold").fillColor("#003366").text("Texto analizado:");
    doc.font("Helvetica").fillColor("#000").text(resultados.texto || "", { align: "justify" });

    // 🏁 Pie institucional
    doc.moveDown(2);
    doc.fontSize(10).fillColor("#777")
      .text("Generado automáticamente por el Sistema de Análisis Léxico Multilingüe — UMG 2025", {
        align: "center",
      });

    doc.end();

    // Esperar a que el PDF se haya escrito completamente
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // 📬 Configurar transporte seguro
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // 💌 Plantilla HTML del correo
    const htmlBody = `
      <div style="font-family:Poppins,Arial,sans-serif;background:#f0f4ff;padding:20px;border-radius:10px;">
        <div style="background:linear-gradient(135deg,#003366,#0055a5);color:#fff;padding:15px;border-radius:10px 10px 0 0;">
          <h2 style="margin:0;">📘 UMG - Analizador Léxico Multilingüe</h2>
        </div>
        <div style="background:#fff;padding:20px;border-radius:0 0 10px 10px;color:#333;">
          <p>Hola <b>${nombre}</b>,</p>
          <p>Tu análisis léxico se completó exitosamente.</p>
          <ul>
            <li><b>Idioma:</b> ${resultados.idioma}</li>
            <li><b>Total palabras:</b> ${resultados.totalPalabras}</li>
            <li><b>Densidad léxica:</b> ${resultados.densidadLexica}</li>
          </ul>
          <p>Adjuntamos tu reporte completo en formato PDF.</p>
          <p style="margin-top:20px;">Atentamente,<br><b>Equipo UMG - Proyecto Lenguajes Formales</b></p>
        </div>
      </div>
    `;

    // 📧 Enviar correo
    await transporter.sendMail({
      from: `"UMG - Analizador Léxico" <${process.env.EMAIL_USER}>`,
      to: correo,
      subject: "📊 Reporte de Análisis Léxico - UMG",
      html: htmlBody,
      attachments: [{ filename: "reporte_analisis.pdf", path: pdfPath }],
    });

    console.log(`✅ Correo enviado correctamente a ${correo}`);

    // 🔥 Limpiar PDF temporal
    fs.unlinkSync(pdfPath);

    // ✅ Respuesta final segura
    return res.status(200).json({ success: true, message: "Reporte enviado correctamente por correo." });

  } catch (error) {
    console.error("❌ Error en /enviar-correo:", error);
    // Si hay un archivo temporal, eliminarlo
    if (error && error.path && fs.existsSync(error.path)) {
      fs.unlinkSync(error.path);
    }
    // Respuesta JSON segura (sin HTML)
    return res.status(500).json({
      success: false,
      message: "Error al generar o enviar el reporte.",
      details: error.message,
    });
  }
});



app.get("/session", (req, res) => {
  res.json(req.session?.user || { message: "Sin sesión activa" });
});


// ✅ Middleware para proteger las rutas del admin
function verificarAdmin(req, res, next) {
  if (req.session?.user?.rol === "ADMIN") {
    return next();
  } else {
    return res.status(403).json({ message: "Acceso denegado: solo administradores" });
  }
}

app.get("/api/usuarios", verificarAdmin, async (req, res) => {
  try {
    const [rows] = await dbCentral.promise().query(`
      SELECT id, nombre_completo, email, telefono, activo
      FROM usuarios
      ORDER BY id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("⚠️ Error al obtener usuarios:", err);
    res.status(500).json({ message: "Error al obtener lista de usuarios" });
  }
});


// ✅ Endpoint para eliminar usuarios
app.delete("/api/usuarios/:id", verificarAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await dbCentral.promise().query("DELETE FROM usuarios WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("⚠️ Error eliminando usuario:", err);
    res.status(500).json({ success: false, message: "Error al eliminar usuario" });
  }
});
app.get("/api/roles", async (req, res) => {
  try {
    // 🔹 Obtener datos de usuarios_roles + roles desde analizador_db
    const [rolesUsuarios] = await dbAnalisis.query(`
      SELECT ur.id_usuario, r.nombre AS rol
      FROM usuarios_roles ur
      INNER JOIN roles r ON ur.id_rol = r.id
    `);

    // 🔹 Luego obtener nombres y correos desde la base central
    const [usuariosCentral] = await dbCentral.promise().query(`
      SELECT id, nombre_completo, email
      FROM usuarios
    `);

    // 🔹 Combinar ambos arreglos en memoria
    const resultado = rolesUsuarios.map(ru => {
      const user = usuariosCentral.find(u => u.id === ru.id_usuario);
      return {
        id_usuario: ru.id_usuario,
        nombre_completo: user?.nombre_completo || "Desconocido",
        email: user?.email || "N/A",
        rol: ru.rol
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error("⚠️ Error obteniendo roles:", err);
    res.status(500).json({ message: "Error obteniendo roles" });
  }
});

// ============================
// 🔐 LOGIN CON PROCEDIMIENTO ALMACENADO (sp_login_correo)
// ============================
app.post("/api/login", async (req, res) => {
  try {
    const { correo, password, "g-recaptcha-response": captchaToken } = req.body;
    console.log("📥 Intentando login con:", correo);

    // 🧩 Validaciones básicas
    if (!correo || !password) {
      return res.status(400).json({ success: false, message: "⚠️ Faltan datos: correo o contraseña" });
    }

    // ============================
    // ⚙️ Ejecutar el procedimiento almacenado
    // ============================
    const sql = `CALL sp_login_correo(?, ?, @p_resultado, @p_mensaje, @p_session_token);`;

    dbCentral.getConnection((err, connection) => {
      if (err) {
        console.error("❌ Error obteniendo conexión del pool:", err);
        return res.status(500).json({ success: false, message: "Error de conexión con la base de datos." });
      }

      connection.query(sql, [correo, password], (errSP) => {
        if (errSP) {
          connection.release();
          console.error("❌ Error ejecutando SP sp_login_correo:", errSP);
          return res.status(500).json({ success: false, message: "Error ejecutando procedimiento de login." });
        }

        // ✅ Obtener los parámetros de salida
        connection.query(
          "SELECT @p_resultado AS resultado, @p_mensaje AS mensaje, @p_session_token AS token;",
          async (errRes, rows) => {
            connection.release();

            if (errRes) {
              console.error("⚠️ Error obteniendo resultado del SP:", errRes);
              return res.status(500).json({ success: false, message: "Error interno al obtener resultado." });
            }

            const { resultado, mensaje, token } = rows[0] || {};

            if (!resultado || resultado === 0) {
              console.warn("⚠️ Login fallido:", mensaje);
              return res.status(401).json({ success: false, message: mensaje || "Credenciales inválidas." });
            }

            // ✅ Obtener usuario real
            dbCentral.query(
              "SELECT id, nombre_completo, email, telefono FROM usuarios WHERE email = ? LIMIT 1",
              [correo],
              async (err3, rows3) => {
                if (err3 || !rows3.length) {
                  console.error("⚠️ No se pudo obtener usuario:", err3);
                  return res.json({ success: true, message: mensaje, token, usuario: { correo } });
                }

                const user = rows3[0];

                // ============================
                // 🔍 Buscar rol del usuario en la base local (analizador_db)
                // ============================
                let rolUsuario = "ANALISTA"; // valor por defecto
                try {
                  const [roles] = await dbAnalisis.query(`
                    SELECT r.nombre AS rol
                    FROM usuarios_roles ur
                    INNER JOIN roles r ON ur.id_rol = r.id
                    WHERE ur.id_usuario = ?
                    LIMIT 1
                  `, [user.id]);

                  if (roles.length) {
                    rolUsuario = roles[0].rol;
                    console.log(`🎭 Rol detectado para ${user.email}: ${rolUsuario}`);
                  } else {
                    console.warn(`⚠️ No se encontró rol para ${user.email}, usando ANALISTA`);
                  }
                } catch (errRol) {
                  console.error("⚠️ Error obteniendo rol del usuario:", errRol.message);
                }

                // ============================
                // 🧠 Crear sesión con el rol real
                // ============================
                req.session.user = {
                  id_usuario: user.id,
                  nombre: user.nombre_completo,
                  correo: user.email,
                  rol: rolUsuario, // 🔥 se agrega el rol aquí
                };

                console.log(`✅ Sesión creada: ${user.nombre_completo} (${rolUsuario})`);
                res.json({
                  success: true,
                  message: mensaje,
                  token,
                  usuario: req.session.user
                });
              }
            );
          }
        );
      });
    });
  } catch (error) {
    console.error("❌ Error general en /api/login:", error);
    res.status(500).json({ success: false, message: "Error interno del servidor." });
  }
});



///////////////////////////////////////////////////////////////////////////

// ===============================================
// 📊 API: Estadísticas combinadas del sistema
// ===============================================
// ===============================================
// 📊 API: Estadísticas combinadas del sistema (solo BD central)
// ===============================================
app.get("/api/estadisticas", async (req, res) => {
  try {
    // Validar conexión central
    if (!dbCentral) {
      throw new Error("Conexión a base de datos central no encontrada");
    }

    // ---- Total de usuarios ----
    const [usuarios] = await dbCentral.promise().query(`
      SELECT 
        COUNT(*) AS totalUsuarios,
        SUM(activo = 1) AS usuariosActivos,
        SUM(activo = 0) AS usuariosInactivos
      FROM usuarios
    `);

    // ---- Total de sesiones ----
    const [sesiones] = await dbCentral.promise().query(`
      SELECT 
        COUNT(*) AS totalSesiones,
        SUM(activa = 1) AS sesionesActivas,
        SUM(activa = 0) AS sesionesInactivas,
        SUM(metodo_login = 'password') AS loginPassword,
        SUM(metodo_login = 'facial') AS loginFacial,
        SUM(metodo_login = 'qr') AS loginQR
      FROM sesiones
    `);

    // ---- Total de métodos de notificación ----
    const [notificaciones] = await dbCentral.promise().query(`
      SELECT 
        COUNT(*) AS totalNotificaciones,
        SUM(tipo_notificacion = 'email') AS notifEmail,
        SUM(tipo_notificacion = 'whatsapp') AS notifWhatsApp,
        SUM(activo = 1) AS notifActivas
      FROM metodos_notificacion
    `);

    const fecha = new Date().toLocaleString("es-ES", {
      timeZone: "America/Guatemala"
    });

    console.log("📊 Estadísticas reales (BD central):", {
      usuarios: usuarios[0],
      sesiones: sesiones[0],
      notificaciones: notificaciones[0]
    });

    res.json({
      usuarios: usuarios[0],
      sesiones: sesiones[0],
      notificaciones: notificaciones[0],
      fecha
    });
  } catch (err) {
    console.error("⚠️ Error obteniendo estadísticas (BD central):", err);
    res.status(500).json({
      error: "Error al obtener estadísticas del sistema (BD central)"
    });
  }
});

//////////////////////////////////////////////////////////////////////////////////

// ===============================================
// 💾 API REAL: Generar y descargar respaldo JSON (solo BD central)
// ===============================================
app.get("/api/respaldo", async (req, res) => {
  try {
    if (!dbCentral) {
      throw new Error("Conexión a la base de datos central no encontrada");
    }

    console.log("🟢 Generando respaldo real del sistema...");

    // ---- CONSULTAS REALES ----
    const [usuarios] = await dbCentral.promise().query(`
      SELECT id, usuario, email, nombre_completo, telefono, fecha_creacion, activo
      FROM usuarios
    `);

    const [sesiones] = await dbCentral.promise().query(`
      SELECT id, usuario_id, metodo_login, fecha_login, activa
      FROM sesiones
    `);

    const [notificaciones] = await dbCentral.promise().query(`
      SELECT id, usuario_id, tipo_notificacion, destino, activo, fecha_creacion
      FROM metodos_notificacion
    `);

    // ---- CREAR OBJETO DE RESPALDO ----
    const respaldo = {
      fecha_generacion: new Date().toLocaleString("es-ES", { timeZone: "America/Guatemala" }),
      descripcion: "Respaldo real generado desde la base de datos central",
      tablas: {
        usuarios,
        sesiones,
        metodos_notificacion: notificaciones
      }
    };

    // ---- GENERAR ARCHIVO EN DISCO ----
    const nombreArchivo = `respaldo_sistema_${new Date().toISOString().slice(0, 10)}.json`;
    const rutaArchivo = path.join(__dirname, nombreArchivo);
    fs.writeFileSync(rutaArchivo, JSON.stringify(respaldo, null, 2), "utf8");

    console.log(`💾 Respaldo generado y guardado en: ${rutaArchivo}`);

    // ---- ENVIAR DESCARGA AL NAVEGADOR ----
    res.download(rutaArchivo, nombreArchivo, (err) => {
      if (err) {
        console.error("⚠️ Error al enviar archivo:", err);
        res.status(500).json({ error: "No se pudo descargar el respaldo." });
      } else {
        console.log("✅ Respaldo descargado correctamente.");
        // Eliminar el archivo temporal después de la descarga
        setTimeout(() => {
          try {
            fs.unlinkSync(rutaArchivo);
            console.log("🧹 Archivo temporal eliminado.");
          } catch (err) {
            console.warn("⚠️ No se pudo eliminar archivo temporal:", err.message);
          }
        }, 5000);
      }
    });
  } catch (err) {
    console.error("❌ Error generando respaldo:", err);
    res.status(500).json({ error: "Error generando respaldo desde la base de datos central" });
  }
});

////////////////////////////////////////////////////////////////////////////

// ===============================================
// 🟢 ACTIVAR / SUSPENDER USUARIO (solo admin)
// ===============================================
app.post("/api/usuarios/estado", async (req, res) => {
  const { id, activo } = req.body;

  if (typeof id === "undefined" || typeof activo === "undefined") {
    return res.status(400).json({ error: "Datos incompletos." });
  }

  try {
    const [resultado] = await dbCentral.promise().query(
      "UPDATE usuarios SET activo = ? WHERE id = ?",
      [activo, id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    console.log(`🟢 Estado actualizado: usuario ${id} → activo=${activo}`);
    res.json({ ok: true, message: "Estado actualizado correctamente." });
  } catch (err) {
    console.error("❌ Error actualizando estado de usuario:", err);
    res.status(500).json({ error: "Error interno al cambiar el estado del usuario." });
  }
});


//////////////////////////////////////////////////////////////////////
// ===============================================
// 🟢 CAMBIAR ESTADO DE USUARIO (activo/suspendido)
// ===============================================
async function cambiarEstado(id, nuevoEstado) {
  const accion = nuevoEstado === 1 ? "activar" : "suspender";

  const confirm = await Swal.fire({
    icon: "question",
    title: `¿Deseas ${accion} este usuario?`,
    showCancelButton: true,
    confirmButtonText: `Sí, ${accion}`,
    cancelButtonText: "Cancelar",
    confirmButtonColor: nuevoEstado === 1 ? "#198754" : "#f39c12"
  });

  if (!confirm.isConfirmed) return;

  try {
    const res = await fetch("/api/usuarios/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, activo: nuevoEstado })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");

    Swal.fire({
      icon: "success",
      title: "Estado actualizado",
      text: data.message,
      confirmButtonColor: "#003366"
    });

    // Recargar lista
    verUsuarios();
  } catch (err) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: err.message || "No se pudo actualizar el estado.",
      confirmButtonColor: "#c0392b"
    });
  }
}
app.post("/api/usuarios/estado", async (req, res) => {
  const { id, activo } = req.body;

  if (typeof id === "undefined" || typeof activo === "undefined") {
    return res.status(400).json({ error: "Datos incompletos." });
  }

  try {
    const [resultado] = await dbCentral.promise().query(
      "UPDATE usuarios SET activo = ? WHERE id = ?",
      [activo, id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    console.log(`🟢 Estado actualizado: usuario ${id} → activo=${activo}`);
    res.json({ ok: true, message: "Estado actualizado correctamente." });
  } catch (err) {
    console.error("❌ Error actualizando estado de usuario:", err);
    res.status(500).json({ error: "Error interno al cambiar el estado del usuario." });
  }
});

/////////////////////////////////////////////////////////

// ============================
// 🚀 Iniciar servidor
// ============================
app.listen(port, () => console.log(`🚀 Servidor activo en http://localhost:${port}`));

// ============================
// 🧠 Helper para Canvas
// ============================
async function canvasLoadImage(filePath) {
  const buffer = fs.readFileSync(filePath);
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return canvas;
}