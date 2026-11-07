# Configurador 3D de coches (mods de GTA V)

Configurador web en 3D, en español, para personalizar los coches que tú mismo subes a partir de mods de vehículos de GTA V: pintura, llantas, diámetro, suspensión, cristales, luces y entornos realistas. Se ejecuta en un contenedor Docker (pensado para Unraid) y se usa desde cualquier navegador de la red local: ordenador, tablet o móvil.

La aplicación no trae coches de serie: el **Garaje** empieza vacío y cada coche que subes queda guardado en tu servidor.

---

## Resumen rápido para Unraid

| Qué | Valor |
| --- | --- |
| Imagen | `ghcr.io/diego233l/customc:latest` |
| Carpeta en Unraid | `/mnt/user/appdata/configurador-tesla` |
| Puerto por defecto | **8100** → `http://IP-DE-TU-UNRAID:8100` |
| Coches subidos | `/mnt/user/appdata/configurador-tesla/datos` |

**Comando único de actualización** (una sola línea, copiar y pegar en la terminal de Unraid):

```bash
cd /mnt/user/appdata/configurador-tesla && docker compose pull && docker compose up -d
```

---

## Funciones

- **Garaje**: sube mods de GTA V (`.rar`, `.zip`, `.oiv`, `.rpf` o `.yft`/`.ytd` sueltos). Se convierten en el navegador a GLB, se guardan en el servidor y aparecen en todos los dispositivos. Cada coche se puede renombrar, ajustar a su longitud real o eliminar.
- **Vista 3D interactiva**: girar (arrastrar), acercar/alejar (rueda o pellizco) y desplazar (botón derecho o dos dedos).
- **Pintura en tiempo real** con materiales PBR físicos: metalizados con escamas (*flakes*), perlados multicapa, sólidos y mates, con barniz (*clearcoat*) y su ligera «piel de naranja».
- **Llantas**: las originales del mod (si las trae) y 11 diseños alternativos (Aero, Turbina, Deportiva, Cóncava, Seis radios, Radios en Y, Multirradio, Malla, Estrella, Radios finos, Disco) con radios cóncavos, tuercas y frenos, combinables con **10 acabados** (plata, mecanizada bitono, grafito, negro brillo/mate, bronce, oro champán, blanco, cromo u original). Color de pinzas de freno.
- **Diámetro de llanta** de −3″ a +4″: la llanta crece y el neumático reduce su perfil conservando el diámetro exterior, como en un cambio real de medida.
- **Suspensión** de −8 cm a +5 cm (preajustes de serie, deportiva, rebajada, muy rebajada y elevada): la carrocería baja o sube y las ruedas siguen apoyadas en el suelo.
- **Cristales y luces**: tintado regulable y faros/pilotos encendidos.
- **Entornos realistas** con HDRI de Poly Haven: estudio oscuro, estudio claro, ciudad, carretera (asfalto con marcas viales sobre un paisaje en 4K), campo al amanecer y noche, con iluminación, reflejos y sombras coherentes.
- **Vistas de cámara**: 3/4 delantera, frontal, lateral, 3/4 trasera, trasera, cenital y detalle de llanta.
- **Guardar configuraciones** en el navegador, enlace para compartir y **exportar imagen** PNG (normal o 2×) con un pie que resume la configuración.
- **Interfaz** por pasos (Garaje, Pintura, Llantas, Suspensión, Entorno, Más) con barra lateral en escritorio y pestañas en móvil; resumen de la configuración y herramientas sobre la vista (giro, vista inicial, captura en alta resolución, pantalla completa).
- **Calidad gráfica** alta / media / baja para PC, tablet o móvil, e **inspector de materiales** para revisar las piezas de un mod.
- Funciona **sin Internet** en la red local.

**Entornos (HDRI)**: Studio Small 03, Potsdamer Platz, Spruit Sunrise y Dikhololo Night, de [Poly Haven](https://polyhaven.com), licencia **CC0** (dominio público). El asfalto de «Carretera» y los diseños de llanta alternativos se generan por código.

---

## Instalación en Unraid

### Configuración inicial (solo una vez)

1. **Instala el plugin «Docker Compose Manager»** desde *Apps* (Community Applications). Añade el comando `docker compose` a Unraid.

2. **Abre la terminal de Unraid** (icono `>_` arriba a la derecha) y crea la carpeta del proyecto con el archivo Compose. La carpeta `datos` debe pertenecer al usuario `nobody:users` (99:100), con el que se ejecuta el contenedor, para poder guardar los coches subidos:

   ```bash
   mkdir -p /mnt/user/appdata/configurador-tesla/datos && chown 99:100 /mnt/user/appdata/configurador-tesla/datos && cd /mnt/user/appdata/configurador-tesla && wget -O docker-compose.yml https://raw.githubusercontent.com/diego233l/CustomC/HEAD/docker-compose.yml
   ```

3. **(Opcional) Cambia el puerto.** Por defecto es el 8100. Para usar otro, crea un archivo `.env` en la misma carpeta:

   ```bash
   echo "CONFIGURADOR_PORT=8100" > /mnt/user/appdata/configurador-tesla/.env
   ```

4. **Acceso a la imagen.** El repositorio es público; si GitHub publica el paquete como privado, hazlo público una vez en GitHub → tu perfil → *Packages* → `customc` → *Package settings* → *Change visibility* → *Public*. Alternativa (sin hacerlo público): inicia sesión una vez en Unraid con un token personal de GitHub con permiso `read:packages`:

   ```bash
   docker login ghcr.io -u diego233l
   ```

   (Pega el token cuando lo pida; no lo guardes en ningún archivo del proyecto.)

5. **Arranca el contenedor:**

   ```bash
   cd /mnt/user/appdata/configurador-tesla && docker compose up -d
   ```

6. **Abre** `http://IP-DE-TU-UNRAID:8100` desde cualquier navegador de la red local.

Si usas la interfaz de Compose Manager, en la pestaña *Docker* → *Compose* → *Add New Stack* puedes indicar como directorio `/mnt/user/appdata/configurador-tesla` y activar *Autostart*.

### Actualizar (cada vez que haya una versión nueva)

```bash
cd /mnt/user/appdata/configurador-tesla && docker compose pull && docker compose up -d
```

Descarga la imagen nueva y recrea el contenedor; los coches subidos (`datos`) y el puerto configurado (`.env`) se conservan. Para liberar espacio de imágenes antiguas puedes añadir `&& docker image prune -f` al final.

### Reinicio automático

El servicio usa `restart: unless-stopped`: Docker vuelve a arrancarlo al reiniciar el servidor o el servicio Docker de Unraid, salvo que lo hayas parado a mano. El contenedor incluye una comprobación de salud (`/healthz`).

### Seguridad

- Servidor Node.js propio sin dependencias externas, ejecutado como `nobody:users` (no root), sistema de archivos de solo lectura salvo la carpeta `datos`, sin capacidades de Linux (`cap_drop: ALL`) y `no-new-privileges`.
- La API de subida valida identificadores, nombres de archivo, tamaño máximo y formato (GLB/JPEG) y no permite salir de su carpeta.
- Sin autenticación por defecto (pensado para la red local). Para exigir una clave al subir/borrar coches, añade `CLAVE_SUBIDAS=tu-clave` al `.env`; para desactivar las subidas, `SUBIDAS=false`.
- Cabeceras de seguridad (CSP, `nosniff`, etc.). No hay credenciales en el código, la imagen ni los archivos del repositorio: la publicación usa el `GITHUB_TOKEN` temporal de GitHub Actions.
- Pensado para la red local; si lo expones a Internet, ponlo detrás de un proxy inverso con HTTPS y autenticación.

---

## Subir coches (mods de GTA V)

En la pestaña **«Garaje»** subes cada mod de vehículo de GTA V (versión de PC) que quieras personalizar:

1. Arrastra el archivo del mod (`.rar`, `.zip`, `.oiv`, `.rpf`) o selecciona juntos sus `.yft` y `.ytd`.
2. Revisa el nombre y, si quieres, indica la **longitud real** del coche en metros (algunos mods vienen escalados), el autor y el enlace del mod. Pulsa **«Convertir y guardar»**.
3. El navegador lo convierte a GLB (unos segundos), lo sube al servidor y lo selecciona. Queda guardado en `datos/mods/` y aparece en el Garaje desde cualquier dispositivo. Con el lápiz cambias el nombre o la longitud; con la × lo eliminas.

Cómo funciona la conversión:

- Los paquetes `dlc.rpf` (incluidos dentro de un `.rar`/`.zip`) se leen sin descifrar su índice: los modelos y texturas se guardan sin cifrar dentro del paquete y se localizan por su cabecera. Las piezas de tuneo del paquete (parachoques, capós…) se ignoran y se usa el modelo principal en alta.
- Lee los recursos RAGE `RSC7` (formato de PC del juego): geometría de alto detalle (`nombre_hi.yft` si existe), esqueleto, shaders y texturas (`nombre.ytd` y `nombre+hi.ytd`), con decodificación de texturas DXT1/3/5, BC4, BC5, BC7 y sin comprimir.
- Identifica las piezas por los **shaders estándar de vehículos de GTA**: `vehicle_paint*` → carrocería (se puede repintar), `vehicle_tire` → neumáticos, `vehicle_vehglass` → cristales (tintado), `vehicle_lightsemissive` → faros y pilotos (se encienden), matrícula oculta. Las llantas se separan automáticamente por su posición dentro de los neumáticos.
- Muchos mods **no incluyen ruedas** (el juego les pone sus llantas genéricas). En ese caso se generan neumáticos con dibujo en los puntos de rueda del esqueleto y se elige un diseño de llanta genérico (cambiable).
- Los mods subidos no se incluyen en el repositorio ni en la imagen (licencia desconocida): se guardan solo en tu servidor. Si reinstalas, súbelos de nuevo o conserva la carpeta `datos`.
- Se guarda también el archivo original (`original.bin`) por si en el futuro se mejora el conversor.

Limitaciones:

- Solo la versión de PC «Legacy» (`RSC7`). Los archivos de la edición *Enhanced* o de consolas y los `.7z` no se admiten; si un `.rpf` tuviera también cifrados los propios modelos, extrae los `.yft`/`.ytd` con OpenIV o CodeWalker.
- Las texturas compartidas del juego (`vehshare.ytd`) no vienen en los mods; esas piezas se muestran con un color neutro. El aviso tras la conversión indica cuántas faltan.
- Los colores de interior/tapicería definidos por paletas del juego se muestran con su textura base.
- **Derechos**: usa solo mods que tengas derecho a utilizar. Muchos mods de vehículos se distribuyen solo para uso personal o proceden de otros juegos; los coches subidos quedan en tu servidor para uso privado y no se incluyen en el repositorio ni en la imagen Docker.

---

## Publicación de la imagen (CI/CD)

El flujo `.github/workflows/docker.yml` se ejecuta en cada *push*:

1. Instala dependencias, valida el catálogo y compila la aplicación (incluye comprobación de tipos).
2. Construye la imagen para `linux/amd64` y `linux/arm64`.
3. La publica en GitHub Container Registry como `ghcr.io/diego233l/customc` con las etiquetas `latest` (rama por defecto), nombre de rama, versión (`v1.2.3` → `1.2.3`, `1.2`) y SHA corto.

No hace falta configurar secretos. Para publicar una versión numerada: `git tag v1.0.0 && git push origin v1.0.0`.

---

## Desarrollo

Requisitos: Node.js 22.

```bash
npm ci
npm run dev        # servidor de desarrollo en http://localhost:5173
npm run build      # comprobación de tipos + compilación en dist/
npm run preview    # sirve dist/
npm start          # servidor completo con subida de coches (datos en ./datos)
```

Tecnología: React 19, TypeScript, Three.js con React Three Fiber y drei, postprocesado (N8AO, bloom, SMAA, mapeo tonal neutro de Khronos) y Vite. Se eligió WebGL/Three.js por su compatibilidad con todos los navegadores actuales, incluidos móviles.

Estructura:

```
public/models/catalog.json   pinturas, diseños y acabados de llanta, colores de pinzas
public/hdri/                 entornos HDRI (CC0)
src/three/                   escena, coche, materiales, llantas y entornos
src/ui/                      interfaz
src/state/store.ts           estado, guardado en navegador y enlace compartible
src/gta/                     conversor de mods de GTA V (RSC7, .yft, .ytd, BC1–BC7) a GLB
server/server.mjs            servidor web + API de coches subidos (sin dependencias)
scripts/                     validación del catálogo
docker/                      archivos auxiliares de la imagen
```

Licencia del código: MIT. Los HDRI mantienen su licencia (CC0) y los coches subidos, la de sus autores.
