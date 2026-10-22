# MovieZone - Plugin de Kino

Plugin oficial para la app [Kino](https://kinotvapp.github.io/kino-plugins/) que permite explorar y reproducir películas, series y anime de [LaMovie](https://lamovie.org) con audio en español y subtítulos, con soporte completo para descargas sin conexión.

## 📱 Cómo instalar en Kino

### En el celular (Android)
1. Abre Kino y toca el menú lateral **☰** (arriba a la izquierda).
2. Entra en **Plugins** y presiona el botón **+** (abajo a la derecha).
3. En el campo de texto escribe:
   ```text
   sebasmc214-ship-it/kino_plugin_moviezone
   ```
4. Toca **Agregar**.
5. Lee la hoja de permisos y presiona **Instalar**.

### En el televisor (Android TV / Google TV / Fire TV)
1. Abre Kino y ve a **Ajustes** (ícono de engranaje).
2. Selecciona **Plugins** ▸ **Agregar**.
3. Escribe:
   ```text
   sebasmc214-ship-it/kino_plugin_moviezone
   ```
4. Presiona **Agregar** ▸ **Instalar**.

---

## 🛠️ Desarrollo y pruebas locales

Este plugin incluye el SDK oficial de Kino para Node.js.

### 1. Validar el manifiesto y la firma de autor
```bash
node sdk/validate.mjs . --repo sebasmc214-ship-it/kino_plugin_moviezone
```

### 2. Probar funciones interactivamente
```bash
# Probar búsqueda
node sdk/run.mjs . search "batman"

# Probar filas de Inicio
node sdk/run.mjs . home

# Probar "Ver más"
node sdk/run.mjs . browse movies:latest

# Probar capítulos de una serie
node sdk/run.mjs . episodes tvshows:88335

# Probar resolución de video HLS
node sdk/run.mjs . resolve movie:79472
```

### 3. Pruebas automáticas offline
```bash
node --test test/plugin.test.mjs
```

### 4. Firmar actualizaciones
Si realizas cambios en `plugin.js` o aumentas `version` en `kino-plugin.json`, firma nuevamente antes de hacer commit:
```bash
node sdk/seal.mjs --sign --repo sebasmc214-ship-it/kino_plugin_moviezone
```

> **IMPORTANTE**: Conserva siempre tu archivo `kino-author-key.pem` en un lugar seguro y nunca lo subas a GitHub ni lo compartas. Si pierdes la clave, los usuarios deberán reinstalar el plugin para recibir actualizaciones.
