'use strict'
/* PHYSARUM · vista fija a pantalla completa. Agentes de 3 sensores sobre un rastro difuso.
   Cada "punto" (algoritmo) define: parámetro = base + amplitud · S^exponente, con S = rastro sensado bajo el agente
   (técnica de Sage Jenson). Un punto es el FONDO y otro el PINCEL; el pincel pinta una máscara que los mezcla. */
const CFG = { AGENTS: 20000, GW: 384, CAP: 3 }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
/* Puntos: sd distancia de sensor, sa ángulo de sensor, ra giro, md paso → [base, amplitud, exponente]; sc escala del sensado; dp depósito; dc decaimiento */
const P = [
  {
    n: 'Encaje',
    sd: [5, 0, 1],
    sa: [0.95, 0, 1],
    ra: [0.7, 0, 1],
    md: [1.1, 0, 1],
    sc: 1,
    dp: 0.9,
    dc: 0.9,
  },
  {
    n: 'Serpientes',
    sd: [6, 0, 1],
    sa: [1.57, 0, 1],
    ra: [0.4, 0, 1],
    md: [1, 0, 1],
    sc: 1,
    dp: 0.9,
    dc: 0.9,
  },
  {
    n: 'Puntos',
    sd: [3, 0, 1],
    sa: [1.5, 0, 1],
    ra: [1.5, 0, 1],
    md: [0.8, 0, 1],
    sc: 1,
    dp: 1.5,
    dc: 0.9,
  },
  {
    n: 'Nervios',
    sd: [14, 0, 1],
    sa: [0.25, 0, 1],
    ra: [0.12, 0, 1],
    md: [1.2, 0, 1],
    sc: 1,
    dp: 0.3,
    dc: 0.88,
  },
  {
    n: 'Manchas',
    sd: [20, 0, 1],
    sa: [0.7, 0, 1],
    ra: [0.5, 0, 1],
    md: [1.5, 0, 1],
    sc: 1,
    dp: 0.9,
    dc: 0.95,
  },
  {
    n: 'Esponja',
    sd: [4, 0, 1],
    sa: [1.0, 0, 1],
    ra: [0.3, 0, 1],
    md: [0.7, 0, 1],
    sc: 1,
    dp: 1.5,
    dc: 0.95,
  },
  {
    n: 'Ráfaga',
    sd: [20, 0, 1],
    sa: [0.15, 0, 1],
    ra: [0.1, 0, 1],
    md: [2, 0, 1],
    sc: 1,
    dp: 0.9,
    dc: 0.9,
  },
  {
    n: 'Niebla',
    sd: [2, 0, 1],
    sa: [0.2, 0, 1],
    ra: [0.15, 0, 1],
    md: [1.8, 0, 1],
    sc: 1,
    dp: 0.3,
    dc: 0.9,
  },
]
let fon = 0,
  pin = 1,
  M = 0,
  BR = 14,
  speed = 0.3, // Control de velocidad de agentes
  relief = 4, // Control de relieve para el shader 3D
  flash = 0

const renderer = new THREE.WebGLRenderer({ antialias: false })
// El tamaño lo manda el CSS (updateStyle=false): así el canvas nunca excede la ventana ni genera barras de desplazamiento
const fit = () =>
  renderer.setSize(
    document.documentElement.clientWidth,
    document.documentElement.clientHeight,
    false,
  )
renderer.setPixelRatio(1)
fit()
document.body.appendChild(renderer.domElement)
document.documentElement.style.overflow = document.body.style.overflow =
  'hidden'
addEventListener('scroll', () => scrollTo(0, 0))
addEventListener('wheel', (e) => e.preventDefault(), { passive: false })
addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
const scene = new THREE.Scene(),
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10)
cam.position.z = 5 // cámara fija: el plano llena la pantalla
const ASP = innerWidth / innerHeight,
  GW = CFG.GW,
  GH = Math.round(GW / ASP),
  CAP = CFG.CAP
let tr = new Float32Array(GW * GH),
  tmp = new Float32Array(GW * GH),
  goldTr = new Float32Array(GW * GH),
  goldTmp = new Float32Array(GW * GH)
const tr2 = new Float32Array(GW * GH),
  mask = new Float32Array(GW * GH)
const XM = new Int32Array(GW),
  XP = new Int32Array(GW)
for (let x = 0; x < GW; x++) {
  XM[x] = x ? x - 1 : GW - 1
  XP[x] = x < GW - 1 ? x + 1 : 0
}
const LUT = new Uint8Array(256)
for (let i = 0; i < 256; i++) LUT[i] = Math.pow(i / 255, 0.7) * 255
const texData = new Uint8Array(GW * GH * 4)
const tex = new THREE.DataTexture(
  texData,
  GW,
  GH,
  THREE.RGBAFormat,
  THREE.UnsignedByteType,
)
tex.magFilter = tex.minFilter = THREE.LinearFilter

// Tonos de azul: #03045e, #0077b6, #00b4d8
const blueColors = [
  new THREE.Vector3(3 / 255, 4 / 255, 94 / 255),
  new THREE.Vector3(0 / 255, 119 / 255, 182 / 255),
  new THREE.Vector3(0 / 255, 180 / 255, 216 / 255),
]

const U = {
  tr: { value: tex },
  px: { value: new THREE.Vector2(1 / GW, 1 / GH) },
  relief: { value: relief },
  flash: { value: 0 },
  b1: { value: blueColors[0] },
  b2: { value: blueColors[1] },
  b3: { value: blueColors[2] },
}
scene.add(
  new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `varying vec2 vUv;uniform sampler2D tr;uniform vec2 px;uniform float relief,flash;uniform vec3 b1,b2,b3;
float H(vec2 u){return texture2D(tr,u).r;}
vec3 grad(float h, float localK){
 vec3 a=mix(b1,vec3(.04,.02,0.),localK),b=mix(b2,vec3(.7,.4,.05),localK),c=mix(b3,vec3(1.,.86,.42),localK);
 return h<.5?mix(a,b,h*2.):mix(b,c,(h-.5)*2.);}
void main(){
 vec4 t=texture2D(tr,vUv);float h=t.r, localK=t.b;
 float dx=H(vUv+vec2(px.x,0.))-H(vUv-vec2(px.x,0.)),dy=H(vUv+vec2(0.,px.y))-H(vUv-vec2(0.,px.y));
 vec3 n=normalize(vec3(-dx*relief,-dy*relief,1.)),L=normalize(vec3(-.5,.6,.9));
 float dif=max(dot(n,L),0.),spec=pow(max(dot(reflect(-L,n),vec3(0.,0.,1.)),0.),40.);
 float grow=clamp((t.r-t.g)*6.,0.,1.); // rastro que está creciendo: canal retrasado vs actual
 vec3 col=grad(h,localK)*(.55+.7*dif)+grad(1.,localK)*spec*h*.9+grad(.8,localK)*h*h*.3;
 col+=mix(vec3(.7,.95,1.),vec3(1.,.95,.7),localK)*grow*.8;
 col*=1.+flash*.7;
 gl_FragColor=vec4(col,1.);}`,
    }),
  ),
)

/* ---------- Puntero y pincel ---------- */
const ptr = {
  gx: GW / 2,
  gy: GH / 2,
  down: false,
  rightDown: false,
  vx: 0,
  vy: 0,
  in: false,
}
function aim(e) {
  const gx = (e.clientX / innerWidth) * GW,
    gy = (1 - e.clientY / innerHeight) * GH
  ptr.vx = ptr.vx * 0.7 + (gx - ptr.gx) * 0.3
  ptr.vy = ptr.vy * 0.7 + (gy - ptr.gy) * 0.3
  ptr.gx = gx
  ptr.gy = gy
  ptr.in = true
}
const sizeRing = () => {}
const respawn = (i) => {
  ax[i] = Math.random() * GW
  ay[i] = Math.random() * GH
  aa[i] = Math.random() * 6.283
}
function paint() {
  if (!ptr.in) return
  const cx = ptr.gx | 0,
    cy = ptr.gy | 0
  if (ptr.down) {
    for (let dy = -BR; dy <= BR; dy++)
      for (let dx = -BR; dx <= BR; dx++) {
        const d2 = dx * dx + dy * dy
        if (d2 > BR * BR) continue
        const i = ((cy + dy + GH) % GH) * GW + ((cx + dx + GW) % GW),
          f = 1 - Math.sqrt(d2) / BR
        mask[i] = Math.min(1, mask[i] + 0.2 * f + 0.05)
        tr[i] += 0.5 * f
      }
    for (let j = 0; j < 60; j++) {
      // spawn circular: agentes nuevos en el borde del pincel
      const i = (Math.random() * N) | 0,
        th = Math.random() * 6.283
      ax[i] = (((ptr.gx + Math.cos(th) * BR * 0.55) % GW) + GW) % GW
      ay[i] = (((ptr.gy + Math.sin(th) * BR * 0.55) % GH) + GH) % GH
      aa[i] = Math.random() * 6.283
    }
  }
  if (ptr.rightDown) {
    for (let dy = -BR; dy <= BR; dy++)
      for (let dx = -BR; dx <= BR; dx++) {
        const d2 = dx * dx + dy * dy
        if (d2 > BR * BR) continue
        const i = ((cy + dy + GH) % GH) * GW + ((cx + dx + GW) % GW),
          f = 1 - Math.sqrt(d2) / BR
        goldTr[i] = Math.min(1, goldTr[i] + 0.6 * f + 0.1)
      }
  }
}

/* ---------- Physarum ---------- */
const N = CFG.AGENTS,
  ax = new Float32Array(N),
  ay = new Float32Array(N),
  aa = new Float32Array(N)
for (let i = 0; i < N; i++) respawn(i)
const o1 = [0, 0, 0, 0],
  o2 = [0, 0, 0, 0],
  waves = []
function ev(p, S, o) {
  o[0] = p.sd[0] + p.sd[1] * Math.pow(S, p.sd[2])
  o[1] = p.sa[0] + p.sa[1] * Math.pow(S, p.sa[2])
  o[2] = p.ra[0] + p.ra[1] * Math.pow(S, p.ra[2])
  o[3] = p.md[0] + p.md[1] * Math.pow(S, p.md[2])
}
function smp(x, y) {
  let ix = x | 0,
    iy = y | 0
  if (ix < 0) ix += GW
  else if (ix >= GW) ix -= GW
  if (iy < 0) iy += GH
  else if (iy >= GH) iy -= GH
  return tr[iy * GW + ix]
}
function agents(dt) {
  const A = P[fon],
    B = P[pin],
    sp = dt * 60 * speed, // Multiplica la velocidad base por el factor speed
    bx = ptr.down ? clamp(ptr.vx, -3, 3) * 0.6 : 0,
    by = ptr.down ? clamp(ptr.vy, -3, 3) * 0.6 : 0
  for (let i = 0; i < N; i++) {
    let x = ax[i],
      y = ay[i],
      a = aa[i]
    const ci = (y | 0) * GW + (x | 0),
      m = mask[ci],
      v = tr[ci] / CAP,
      agentGold = goldTr[ci]
    ev(A, clamp(v * A.sc, 1e-9, 1), o1)
    let sd = o1[0],
      sa = o1[1],
      ra = o1[2],
      md = o1[3],
      dp = A.dp
    if (m > 0.01) {
      ev(B, clamp(v * B.sc, 1e-9, 1), o2)
      sd += (o2[0] - sd) * m
      sa += (o2[1] - sa) * m
      ra += (o2[2] - ra) * m
      md += (o2[3] - md) * m
      dp += (B.dp - dp) * m
    }
    const l = smp(x + Math.cos(a - sa) * sd, y + Math.sin(a - sa) * sd),
      c = smp(x + Math.cos(a) * sd, y + Math.sin(a) * sd),
      r = smp(x + Math.cos(a + sa) * sd, y + Math.sin(a + sa) * sd)
    if (c > l && c > r) {
    } else if (c < l && c < r) a += Math.random() < 0.5 ? -ra : ra
    else if (l > r) a -= ra
    else if (r > l) a += ra
    x += Math.cos(a) * md * sp + bx * m
    y += Math.sin(a) * md * sp + by * m // el pincel arrastra a los agentes
    for (let w = 0; w < waves.length; w++) {
      const wv = waves[w],
        dx = x - wv.x,
        dy = y - wv.y,
        d = Math.hypot(dx, dy) || 1
      if (Math.abs(d - wv.r) < 4) {
        x += (dx / d) * 1.6
        y += (dy / d) * 1.6
      }
    }
    if (x < 0) x += GW
    else if (x >= GW) x -= GW
    if (y < 0) y += GH
    else if (y >= GH) y -= GH
    if (x >= GW - 0.001) x = 0
    if (y >= GH - 0.001) y = 0
    ax[i] = x
    ay[i] = y
    aa[i] = a
    const di = (y | 0) * GW + (x | 0)
    tr[di] += dp * Math.max(0, 1 - tr[di] / CAP) // depósito saturante
    if (ptr.rightDown && agentGold > 0.02) {
      goldTr[di] = Math.min(1, goldTr[di] + agentGold * 0.85) // Propagación solo mientras se mantiene presionado el clic
    }
  }
  for (let j = 0; j < N * 0.001; j++) respawn((Math.random() * N) | 0) // reaparición periódica, como en la referencia
  for (let w = waves.length - 1; w >= 0; w--) {
    const wv = waves[w]
    wv.r += 45 * dt
    const n = Math.floor(wv.r * 6.283)
    for (let j = 0; j < n; j += 2) {
      const an = (j / n) * 6.283,
        ix = (wv.x + Math.cos(an) * wv.r) | 0,
        iy = (wv.y + Math.sin(an) * wv.r) | 0
      if (ix > 0 && iy > 0 && ix < GW && iy < GH) tr[iy * GW + ix] += 0.6
    }
    if (wv.r > GW * 0.7) waves.splice(w, 1)
  }
}
function diffuse() {
  const dec = clamp(P[fon].dc + M * 0.03, 0.85, 0.985)
  const gDec = ptr.rightDown ? 0.94 : 0.8 // Al soltar el clic, el oro se desvanece de inmediato a azul
  for (let y = 0; y < GH; y++) {
    const r0 = (y ? y - 1 : GH - 1) * GW,
      r1 = y * GW,
      r2 = (y < GH - 1 ? y + 1 : 0) * GW
    for (let x = 0; x < GW; x++) {
      const l = XM[x],
        r = XP[x]
      const s =
        tr[r0 + l] +
        tr[r0 + x] +
        tr[r0 + r] +
        tr[r1 + l] +
        tr[r1 + x] +
        tr[r1 + r] +
        tr[r2 + l] +
        tr[r2 + x] +
        tr[r2 + r]
      tmp[r1 + x] = (tr[r1 + x] * 0.35 + (s / 9) * 0.65) * dec

      const sG =
        goldTr[r0 + l] +
        goldTr[r0 + x] +
        goldTr[r0 + r] +
        goldTr[r1 + l] +
        goldTr[r1 + x] +
        goldTr[r1 + r] +
        goldTr[r2 + l] +
        goldTr[r2 + x] +
        goldTr[r2 + r]
      goldTmp[r1 + x] = (goldTr[r1 + x] * 0.35 + (sG / 9) * 0.65) * gDec
    }
  }
  const s = tr
  tr = tmp
  tmp = s
  const sg = goldTr
  goldTr = goldTmp
  goldTmp = sg

  for (let i = 0, p = 0; i < tr.length; i++, p += 4) {
    mask[i] *= 0.9996
    tr2[i] += (tr[i] - tr2[i]) * 0.15 // canal retrasado para resaltar lo que crece
    texData[p] = LUT[Math.min(255, (tr[i] / CAP) * 255) | 0]
    texData[p + 1] = LUT[Math.min(255, (tr2[i] / CAP) * 255) | 0]
    texData[p + 2] = LUT[Math.min(255, goldTr[i] * 255) | 0] // Mapa de oro enviado al Shader
  }
  tex.needsUpdate = true
}
function shock() {
  // cambio agresivo: borra casi todo y reubica a todos los agentes
  for (let i = 0; i < tr.length; i++) {
    tr[i] *= 0.08
    tr2[i] = 0
    goldTr[i] = 0
  }
  for (let i = 0; i < N; i++) respawn(i)
  flash = 1
}

/* ---------- Interfaz e Intro ---------- */
const actEl = document.getElementById('act'),
  keysEl = document.getElementById('keys')

// Desactivar despliegue de mensajes en pantalla
const say = () => {}
const hud = () => {}

/* ---------- Intro Overlay ---------- */
const introEl = document.createElement('div')
introEl.id = 'intro-screen'
introEl.style.cssText = `
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #04060c;
  color: #ffffff;
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 2.5rem;
  font-weight: 600;
  letter-spacing: 3px;
  cursor: pointer;
  z-index: 10000;
  user-select: none;
  transition: opacity 0.6s ease;
`
introEl.textContent = 'Empezar'
document.body.appendChild(introEl)

let aud
introEl.addEventListener('click', () => {
  // Reproducir canción local en assets
  aud = new Audio('/src/assets/azul_oro.mp3')
  aud.play().catch((err) => console.log('Error reproduciendo el audio:', err))

  // Eliminar intro visual
  introEl.style.opacity = '0'
  setTimeout(() => introEl.remove(), 600)

  // Eliminar HUD/textos completamente
  if (actEl) actEl.style.display = 'none'
  if (keysEl) keysEl.style.display = 'none'

  fit()
})

addEventListener('keydown', (e) => {
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault() // evita que la página se desplace
  const d = /^Digit([1-8])$/.exec(e.code),
    key = e.key.toLowerCase()
  if (d) {
    const i = +d[1] - 1
    if (e.shiftKey) {
      pin = i
    } else {
      fon = i
      shock()
    }
  } else if (key === 'c') {
    const shuffled = [...blueColors].sort(() => Math.random() - 0.5)
    U.b1.value = shuffled[0]
    U.b2.value = shuffled[1]
    U.b3.value = shuffled[2]
  } else if (key === 'v')
    waves.push({
      x: ptr.in ? ptr.gx : GW / 2,
      y: ptr.in ? ptr.gy : GH / 2,
      r: 2,
    })
  else if (key === 'arrowup') speed = clamp(speed + 0.2, 0.1, 5.0)
  else if (key === 'arrowdown') speed = clamp(speed - 0.2, 0.1, 5.0)
  else if (key === 'w') {
    M = clamp(M + 0.1, -1, 1)
    relief = clamp(relief + 0.5, 0, 14)
  } else if (key === 's') {
    M = clamp(M - 0.1, -1, 1)
    relief = clamp(relief - 0.5, 0, 14)
  } else if (key === 'e') BR = clamp(BR + 2, 4, 60)
  else if (key === 'q') BR = clamp(BR - 2, 4, 60)
  else if (key === 'x') {
    tr.fill(0)
    tr2.fill(0)
    goldTr.fill(0)
    mask.fill(0)
  } else if (key === 'h') document.body.classList.toggle('hide')
  else if (key === 'f')
    document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()
  else if (key === ' ' && aud) aud.paused ? aud.play() : aud.pause()
  sizeRing()
})
addEventListener('pointerdown', (e) => {
  if (e.button === 0) ptr.down = true
  if (e.button === 2) ptr.rightDown = true
  aim(e)
})
addEventListener('pointerup', (e) => {
  if (e.button === 0) ptr.down = false
  if (e.button === 2) ptr.rightDown = false
})
addEventListener('pointermove', aim)
addEventListener('contextmenu', (e) => e.preventDefault())
addEventListener('resize', fit)
addEventListener('dragover', (e) => e.preventDefault())
addEventListener('drop', (e) => {
  e.preventDefault()
  const f = e.dataTransfer.files[0]
  if (f && f.type.startsWith('audio')) {
    if (aud) aud.pause()
    aud = new Audio(URL.createObjectURL(f))
    aud.play()
  }
})

/* ---------- Bucle ---------- */
let last = performance.now()
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  flash *= Math.exp(-dt / 0.35)
  U.relief.value = relief
  U.flash.value = flash
  paint()
  agents(dt)
  diffuse()
  renderer.render(scene, cam)
  requestAnimationFrame(loop)
}
sizeRing()
requestAnimationFrame(loop)
