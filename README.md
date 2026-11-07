# Configurador 3D de Tesla (Model S, 3, X e Y)

Configurador web en 3D, en español, para ver los Tesla Model S, Model 3, Model X y Model Y con distintos colores, llantas y entornos. Se ejecuta en un contenedor Docker (pensado para Unraid) y se usa desde cualquier navegador de la red local: ordenador, tablet o móvil.

> Proyecto no oficial, sin relación con Tesla, Inc. «Tesla», «Model S», «Model 3», «Model X» y «Model Y» son marcas de sus titulares.

---

## Resumen rápido para Unraid

| Qué | Valor |
| --- | --- |
| Imagen | `ghcr.io/diego233l/customc:latest` |
| Carpeta en Unraid | `/mnt/user/appdata/configurador-tesla` |
| Puerto por defecto | **8100** → `http://IP-DE-TU-UNRAID:8100` |
| Modelos propios (catálogo JSON) | `/mnt/user/appdata/configurador-tesla/modelos` |
| Coches subidos (mods de GTA V) | `/mnt/user/appdata/configurador-tesla/datos` |

**Comando único de actualización** (una sola línea, copiar y pegar en la terminal de Unraid):

```bash
cd /mnt/user/appdata/configurador-tesla && docker compose pull && docker compose up -d
```

---

## Funciones

- **Modelos**: Model S, Model 3, Model X y Model Y, con generaciones y variantes definidas en un catálogo JSON ampliable (p. ej. Model X con puertas Falcon abiertas).
- **Vista 3D interactiva**: girar (arrastrar), acercar/alejar (rueda o pellizco) y desplazar (botón derecho o dos dedos).
- **Pintura en tiempo real** con materiales PBR físicos: color base, metalizado con escamas (*flakes*), perlado multicapa, mate y barniz transparente (*clearcoat*).
- **Llantas**: las originales del modelo y 11 diseños alternativos (Aero, Turbina, Deportiva, Cóncava, Seis radios, Radios en Y, Multirradio, Malla, Estrella, Radios finos, Disco) con radios cóncavos, tuercas y frenos, más **10 acabados** combinables (plata, mecanizada bitono, grafito, negro brillo/mate, bronce, oro champán, blanco, cromo u original). Color de pinzas de freno.
- **Diámetro de llanta** de −3″ a +4″: la llanta crece y el neumático reduce su perfil conservando el diámetro exterior, como en un cambio real de medida.
- **Suspensión** de −8 cm a +5 cm (con preajustes de serie, deportiva, rebajada, muy rebajada y elevada): la carrocería baja o sube y las ruedas siguen apoyadas en el suelo.
- **Piezas independientes**: carrocería, llantas, neumáticos, cristales (tintado regulable) y luces (encendido/apagado) se modifican por separado.
- **Entornos realistas** con HDRI de Poly Haven: estudio oscuro, estudio claro, ciudad, carretera (calzada de asfalto con marcas viales generada sobre un paisaje en 4K), campo al amanecer y noche. Iluminación, reflejos y sombras coherentes con cada HDRI (la dirección del sol se calculó a partir de la propia imagen) y suelo proyectado en los exteriores.
- **Vistas de cámara**: 3/4 delantera, frontal, lateral, 3/4 trasera, trasera, cenital y detalle de llanta.
- **Guardar configuraciones** en el navegador (con miniatura), enlace para compartir la configuración y **exportar imagen** PNG (normal o 2×) con un pie que resume la configuración.
- **Calidad gráfica** alta / media / baja (oclusión ambiental, suelo reflectante, antialias) para adaptarse a PC, tablet o móvil.
- **Mis coches: subir mods de GTA V** (.rar, .zip, .oiv, .rpf o .yft/.ytd sueltos). Se convierten en el navegador a GLB, se guardan en el servidor y aparecen en todos los dispositivos con las mismas opciones de pintura, llantas, suspensión, luces y entornos. Cada mod puede **sustituir** a uno de los cuatro modelos (pasa a ser su versión por defecto) o guardarse en «Mis coches». Ver «Subir coches (mods de GTA V)».
- **Interfaz**: barra lateral por pasos (Modelo, Pintura, Llantas, Suspensión, Entorno, Mis coches, Más) en escritorio y pestañas en móvil; resumen de la configuración y herramientas sobre la vista (giro, vista inicial, captura en alta resolución, pantalla completa).
- **Inspector de materiales** para preparar nuevos modelos 3D.
- Funciona **sin Internet** en la red local: todos los recursos se sirven desde el contenedor.

## Modelos 3D incluidos y licencias

Todos los modelos son obras de terceros publicadas en Sketchfab con licencia **Creative Commons Attribution 4.0 (CC BY 4.0)**, que permite el uso, la modificación y la redistribución (también comercial) citando al autor. Los créditos se muestran en la aplicación (pestaña «Más» → Créditos) y en el pie de las imágenes exportadas.

| Modelo | Archivo 3D | Autor | Licencia | Notas |
| --- | --- | --- | --- | --- |
| Model S (restyling 2021, Plaid) | [Tesla Model S Plaid 2021](https://sketchfab.com/3d-models/tesla-model-s-plaid-2021-481866a0b23143b18e8e4e7f642cee53) | 3D Hawk | CC BY 4.0 | Exportación original de Sketchfab. Matrícula ocultada. |
| Model 3 (1.ª generación) | [Tesla 2018 Model 3](https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f) | Ameer Studio | CC BY 4.0 | Exportación original de Sketchfab. |
| Model X (1.ª generación) | [Tesla Model X Part 1](https://sketchfab.com/3d-models/tesla-model-x-part-1-b69c8d8f607e4822b93eaf277bd36588) / [Part 2](https://sketchfab.com/3d-models/tesla-model-x-part-2-6909a6bd5948474a9832482fbc38c47a) | BIG FAN 3D '92 NICE MODELS | CC BY 4.0 | Versión depurada (sin logotipos ni matrículas) publicada por el proyecto *Million Dollar Model X*. |
| Model Y (1.ª generación) | [2021 Tesla Model Y](https://sketchfab.com/3d-models/2021-tesla-model-y-59e2ead369984b1a85c800ff6cf6789d) | tonielpro520 | CC BY 4.0 | Exportación original de Sketchfab. |

Modificaciones aplicadas: conversión a GLB, compresión de geometría Meshopt (sin reducir polígonos), texturas WebP y sustitución de materiales en tiempo real. Los archivos `LICENSE.txt` de cada carpeta en `public/models/` conservan el aviso original.

**Procedencia y limitaciones**

- Sketchfab no era accesible desde el entorno de desarrollo, por lo que los archivos se obtuvieron de copias públicas en GitHub que incluyen el `license.txt` y los metadatos de autoría y licencia originales de Sketchfab (embebidos en el propio glTF). Conviene comprobar en la página de Sketchfab de cada modelo que la licencia sigue siendo CC BY 4.0; si cambiara, basta con sustituir el archivo.
- En el Model X, el material de pintura del archivo original es compartido con algunas piezas interiores y de los bajos, que también toman el color elegido. Las ruedas sí se separan automáticamente.
- El Model X no tiene año exacto verificado. Las generaciones nuevas (Model 3 «Highland», Model Y «Juniper», Model S/X 2021+ con interior nuevo) **no están incluidas** porque no se encontró un archivo con licencia abierta verificable; ver «Añadir modelos 3D».
- Los **diseños de llanta alternativos** (Aero, Deportiva, Turbina, Multirradio, Radios en Y) son geometría genérica generada por la aplicación, **no** reproducciones de las llantas oficiales de Tesla. Las llantas «Originales» son las del modelo 3D de cada autor.
- Los **colores** son aproximaciones de las tonalidades habituales, no muestras oficiales de color.
- No se ha usado ningún recurso propietario (ni de la app de Tesla ni de su web).

**Entornos (HDRI)**: Studio Small 03, Potsdamer Platz, Spruit Sunrise (1K para la luz y 4K para el fondo) y Dikhololo Night, de [Poly Haven](https://polyhaven.com), licencia **CC0** (dominio público), obtenidos de los repositorios públicos de three.js y drei. El asfalto de «Carretera» se genera por código.

---

## Instalación en Unraid

### Configuración inicial (solo una vez)

1. **Instala el plugin «Docker Compose Manager»** desde *Apps* (Community Applications). Añade el comando `docker compose` a Unraid.

2. **Abre la terminal de Unraid** (icono `>_` arriba a la derecha) y crea la carpeta del proyecto con el archivo Compose. La carpeta `datos` debe pertenecer al usuario `nobody:users` (99:100), con el que se ejecuta el contenedor, para poder guardar los coches subidos:

   ```bash
   mkdir -p /mnt/user/appdata/configurador-tesla/modelos /mnt/user/appdata/configurador-tesla/datos && chown 99:100 /mnt/user/appdata/configurador-tesla/datos && cd /mnt/user/appdata/configurador-tesla && wget -O docker-compose.yml https://raw.githubusercontent.com/diego233l/CustomC/HEAD/docker-compose.yml
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

Descarga la imagen nueva y recrea el contenedor; los coches subidos (`datos`), los modelos de `modelos` y el puerto configurado (`.env`) se conservan. Para liberar espacio de imágenes antiguas puedes añadir `&& docker image prune -f` al final.

### Reinicio automático

El servicio usa `restart: unless-stopped`: Docker vuelve a arrancarlo al reiniciar el servidor o el servicio Docker de Unraid, salvo que lo hayas parado a mano. El contenedor incluye una comprobación de salud (`/healthz`).

### Seguridad

- Servidor Node.js propio sin dependencias externas, ejecutado como `nobody:users` (no root), sistema de archivos de solo lectura salvo la carpeta `datos`, sin capacidades de Linux (`cap_drop: ALL`) y `no-new-privileges`.
- La carpeta de modelos se monta en solo lectura. La API de subida valida identificadores, nombres de archivo, tamaño máximo y formato (GLB/JPEG) y no permite salir de su carpeta.
- Sin autenticación por defecto (pensado para la red local). Para exigir una clave al subir/borrar coches, añade `CLAVE_SUBIDAS=tu-clave` al `.env`; para desactivar las subidas, `SUBIDAS=false`.
- Cabeceras de seguridad (CSP, `nosniff`, etc.). No hay credenciales en el código, la imagen ni los archivos del repositorio: la publicación usa el `GITHUB_TOKEN` temporal de GitHub Actions.
- Pensado para la red local; si lo expones a Internet, ponlo detrás de un proxy inverso con HTTPS y autenticación.

### Compilar la imagen en el propio Unraid (alternativa sin registro)

```bash
git clone https://github.com/diego233l/CustomC /mnt/user/appdata/configurador-tesla-src && cd /mnt/user/appdata/configurador-tesla-src && docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

---

## Subir coches (mods de GTA V)

En la pestaña **«Mis coches»** puedes subir un mod de vehículo de GTA V (versión de PC) para verlo y personalizarlo en el configurador:

1. Arrastra el archivo del mod (`.rar`, `.zip`, `.oiv`, `.rpf`) o selecciona juntos sus `.yft` y `.ytd`.
2. Elige **«Usar como»**: sustituir al Model S, 3, X o Y, o guardarlo en «Mis coches». Se propone automáticamente a partir del nombre del archivo (p. ej. `tesla_model_x.rar` → Model X). Revisa el nombre y pulsa **«Convertir y guardar»**.
3. El navegador lo convierte a GLB (unos segundos), lo sube al servidor y lo selecciona. Queda guardado en `datos/mods/` y aparece en el selector de modelo, en «Mis coches», desde cualquier dispositivo. Se puede renombrar o eliminar desde la misma pestaña.

Cómo funciona la conversión:

- Los mods que sustituyen a un modelo aparecen como primera generación de ese modelo (la versión libre de Sketchfab queda como alternativa) y se escalan a la longitud real del coche. El destino se puede cambiar después desde la lista (icono de flechas).
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

**Si ya tenías instalado el configurador** antes de esta función, ejecuta una vez (crea la carpeta `datos` y descarga el Compose nuevo, que añade ese volumen):

```bash
cd /mnt/user/appdata/configurador-tesla && mkdir -p datos && chown 99:100 datos && wget -O docker-compose.yml https://raw.githubusercontent.com/diego233l/CustomC/HEAD/docker-compose.yml && docker compose pull && docker compose up -d
```

---

## Publicación de la imagen (CI/CD)

El flujo `.github/workflows/docker.yml` se ejecuta en cada *push*:

1. Instala dependencias, valida el catálogo y compila la aplicación (incluye comprobación de tipos).
2. Construye la imagen para `linux/amd64` y `linux/arm64`.
3. La publica en GitHub Container Registry como `ghcr.io/diego233l/customc` con las etiquetas `latest` (rama por defecto), nombre de rama, versión (`v1.2.3` → `1.2.3`, `1.2`) y SHA corto.

No hace falta configurar secretos. Para publicar una versión numerada: `git tag v1.0.0 && git push origin v1.0.0`.

---

## Añadir modelos 3D

Los modelos se declaran en un catálogo JSON. Hay dos formas:

- **Sin recompilar (recomendado en Unraid):** copia los archivos a `/mnt/user/appdata/configurador-tesla/modelos/` y crea ahí `catalog.json`. La aplicación lo carga desde `/custom/catalog.json` y lo combina con el catálogo integrado (mismo `id` = sustituye; `id` nuevo = añade). Basta con recargar la página.
- **Integrado en la imagen:** añade los archivos a `public/models/` y la entrada a `public/models/catalog.json`.

### Requisitos del archivo 3D

- **Licencia** que permita su uso (p. ej. CC BY 4.0 o CC0) o autorización expresa del autor. Anota autor, enlace y licencia en `credits`.
- Formato **glTF 2.0** (`.glb` recomendado; `.gltf` con sus `.bin` y texturas también vale). Se admiten Draco y Meshopt.
- Materiales PBR, con **materiales separados** como mínimo para: pintura de carrocería, **neumáticos** (imprescindible: se usan para localizar las ruedas), cristales y, si es posible, faros y pilotos. Las llantas no necesitan material propio: todo lo que queda dentro del aro del neumático se detecta automáticamente.
- Sin logotipos de terceros ni matrículas reales (o en materiales que puedan ocultarse con `hide`).
- Tamaño recomendado: menos de 15 MB por archivo para que cargue rápido en móviles.

### Pasos

1. **Optimiza** el archivo (opcional, recomendado) en un ordenador con Node.js 22, desde la carpeta del repositorio:

   ```bash
   npm ci && npm run models:optimize -- ruta/al/scene.gltf modelos/model-3-highland/model.glb
   ```

   No fusiona materiales ni reduce polígonos; comprime geometría (Meshopt) y texturas (WebP).

2. **Consulta los materiales** con `node scripts/inspect-model.mjs modelos/model-3-highland/model.glb` (muestra nombre, nº de vértices y caja envolvente de cada material), o en la aplicación: pestaña «Más» → *Inspector de materiales* (resalta en magenta el material elegido).

3. **Crea la entrada del catálogo** partiendo de `unraid/modelos-ejemplo/catalog.json`. Campos principales:

   | Campo | Descripción |
   | --- | --- |
   | `file` | Ruta del GLB relativa al `catalog.json`. |
   | `lengthMeters` | Longitud real del coche; el modelo se escala a esta medida. |
   | `forward` | Eje del archivo que apunta al frontal: `+z`, `-z`, `+x` o `-x`. Si el coche aparece al revés en la vista «3/4 delantera», cambia el signo. |
   | `parts` | Nombres de material por pieza: `paint`, `tires`, `rims` (acabado de las llantas originales), `glass`, `headlights`, `taillights`, `calipers`, `chrome`, `trim`, `hide`. Admite nombres exactos o expresiones regulares (`"/^wheels\\.\\d$/"`). |
   | `wheels`, `paints` | Ids de llantas y pinturas compatibles (por defecto, todas). Puedes definir llantas y pinturas nuevas en el mismo catálogo. |
   | `variants` | Archivos alternativos del mismo modelo (p. ej. puertas abiertas). |
   | `credits` | Título, autor, enlace, licencia y modificaciones. Obligatorio. |
   | `available` | `false` para mostrarlo como «pendiente» sin archivo. |

4. **Valida** el catálogo: `node scripts/validate-catalog.mjs /mnt/user/appdata/configurador-tesla/modelos/catalog.json` (o `npm run catalog:validate` para el integrado).

5. Recarga la página del configurador.

### Recursos pendientes

Para completar las generaciones actuales hacen falta modelos con licencia abierta verificable de:

- **Model 3 «Highland» (2024+)** y **Model Y «Juniper» (2025+)**: existen modelos en Sketchfab, pero los localizados eran CC BY-NC (uso no comercial) o de licencia no verificable; un CC BY-NC sirve para uso doméstico privado si se respeta la atribución.
- **Model S y Model X restyling 2021+ con año verificado**.
- Modelos con **llantas oficiales intercambiables** como piezas separadas, para sustituir los diseños genéricos.

---

## Desarrollo

Requisitos: Node.js 22.

```bash
npm ci
npm run dev        # servidor de desarrollo en http://localhost:5173
npm run build      # comprobación de tipos + compilación en dist/
npm run preview    # sirve dist/
node server/server.mjs   # servidor completo (STATIC_DIR=dist DATA_DIR=./datos CUSTOM_DIR=./modelos)
```

Tecnología: React 19, TypeScript, Three.js con React Three Fiber y drei, postprocesado (N8AO, bloom, SMAA, mapeo tonal neutro de Khronos) y Vite. Se eligió WebGL/Three.js por su compatibilidad con todos los navegadores actuales, incluidos móviles.

Estructura:

```
public/models/catalog.json   catálogo integrado (modelos, pinturas, llantas)
public/models/*/             modelos GLB + aviso de licencia
public/hdri/                 entornos HDRI (CC0)
src/three/                   escena, coche, materiales, llantas y entornos
src/ui/                      interfaz
src/state/store.ts           estado, guardado en navegador y enlace compartible
src/gta/                     conversor de mods de GTA V (RSC7, .yft, .ytd, BC1–BC7) a GLB
server/server.mjs            servidor web + API de coches subidos (sin dependencias)
scripts/                     optimización, inspección y validación de modelos
docker/                      archivos auxiliares de la imagen
```

Licencia del código: MIT. Los modelos 3D y los HDRI mantienen sus propias licencias (ver arriba).
