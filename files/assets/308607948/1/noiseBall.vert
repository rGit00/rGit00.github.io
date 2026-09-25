// noiseBall.vert
// Sposta i vertici SOLO lungo la normale (dal centro verso l'esterno), a "montagnette".
// Il noise e' 4D (x, y, z, tempo): le montagne crescono e calano sul posto,
// senza scorrere lateralmente sulla superficie.
// L'ampiezza cresce vicino al punto del mouse e decade con un'influenza.
// In piu': trascinamento elastico. Un punto afferrato viene tirato dal vettore uPull,
// i vertici vicini lo seguono con un peso che decade; durante il rimbalzo
// un'onda (jiggle) percorre la palla partendo dal punto afferrato.
// La normale viene ricalcolata dalla superficie deformata (differenze finite).

attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aBary;          // coordinate baricentriche per il wireframe

uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
uniform mat3 matrix_normal;

uniform float uTime;
uniform vec3  uMouse;          // punto del mouse sulla sfera (direzione, spazio oggetto)
uniform float uMouseActive;    // 0..1, sfuma quando il mouse lascia la palla
uniform float uInflRadius;     // raggio d'influenza (distanza sulla sfera unitaria, 0..2)
uniform float uInflFalloff;    // curva del decadimento
uniform float uBaseAmp;        // montagne sempre presenti su tutta la palla
uniform float uMouseAmp;       // montagne extra sotto il mouse
uniform float uNoiseScale;
uniform float uNoiseSpeed;
uniform float uMouseNoiseScale;
uniform float uPeak;           // forma delle montagne: 1 = morbide, alto = punte

// Trascinamento elastico
uniform vec3  uGrabDir;        // punto afferrato (direzione, spazio oggetto)
uniform vec3  uPull;           // vettore di trazione (spazio oggetto)
uniform float uGrabRadius;     // quanta superficie viene tirata (0..2)
uniform float uGrabFalloff;    // forma del tiro: basso = largo e morbido, alto = punta
uniform float uJiggle;         // ampiezza dell'onda di rimbalzo
uniform float uRippleFreq;
uniform float uRippleSpeed;

varying vec3  vWorldPos;
varying vec3  vNormal;
varying vec3  vBary;
varying float vInfl;
varying float vNoise;
varying float vStretch;

// ---- Simplex noise 4D (Ashima Arts / Stefan Gustavson, MIT) ----
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
float permute(float x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p, s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
}

float snoise(vec4 v) {
    const vec4 C = vec4(0.138196601125011, 0.276393202250021, 0.414589803375032, -0.447213595499958);
    const float F4 = 0.309016994374947451;
    vec4 i  = floor(v + dot(v, vec4(F4)));
    vec4 x0 = v - i + dot(i, C.xxxx);
    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;
    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);
    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;
    i = mod289(i);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute(permute(permute(permute(
                i.w + vec4(i1.w, i2.w, i3.w, 1.0))
              + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
              + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
              + i.x + vec4(i1.x, i2.x, i3.x, 1.0));
    vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
    vec4 p0 = grad4(j0, ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4, p4));
    vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return 49.0 * (dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2)))
                 + dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4))));
}

// Peso morbido: 1 al centro, 0 a distanza "radius"
float kernel(float d, float radius, float falloff) {
    float x = 1.0 - clamp(d / max(radius, 0.0001), 0.0, 1.0);
    x = x * x * (3.0 - 2.0 * x);
    return pow(x, falloff);
}

// Noise -> altezza montagna 0..1 (solo verso l'esterno)
float mountain(float n) {
    return pow(clamp(n * 0.5 + 0.5, 0.0, 1.0), uPeak);
}

// Posizione deformata di un punto della sfera
vec3 displace(vec3 p, out float infl, out float h, out float stretch) {
    vec3 dir = normalize(p);

    // Montagnette di noise
    infl = kernel(distance(dir, uMouse), uInflRadius, uInflFalloff) * uMouseActive;
    float t = uTime * uNoiseSpeed;
    float hBase  = mountain(snoise(vec4(dir * uNoiseScale, t)));
    float hMouse = mountain(snoise(vec4(dir * uMouseNoiseScale + 17.0, t * 1.3)));
    h = mix(hBase, hMouse, infl);
    float d = hBase * uBaseAmp + hMouse * uMouseAmp * infl;

    // Trascinamento elastico
    float gd = distance(dir, uGrabDir);
    float gw = kernel(gd, uGrabRadius, uGrabFalloff);
    vec3 pull = uPull * gw;
    stretch = length(pull);

    // Onda di rimbalzo che parte dal punto afferrato
    float ripple = sin(gd * uRippleFreq - uTime * uRippleSpeed) * uJiggle * (1.0 - 0.5 * gw);

    return p + dir * (d + ripple) + pull;
}

void main(void) {
    float infl, h, stretch;
    vec3 p = displace(aPosition, infl, h, stretch);

    // Normale della superficie deformata: sposto due punti vicini sulla sfera
    vec3 nrm = normalize(aNormal);
    vec3 up = abs(nrm.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t = normalize(cross(nrm, up));
    vec3 b = cross(nrm, t);
    float r = length(aPosition);
    float e = 0.01 * r;
    float i1, h1, s1, i2, h2, s2;
    vec3 p1 = displace(normalize(aPosition + t * e) * r, i1, h1, s1);
    vec3 p2 = displace(normalize(aPosition + b * e) * r, i2, h2, s2);
    vec3 dn = normalize(cross(p1 - p, p2 - p));
    if (dot(dn, nrm) < 0.0) dn = -dn;

    vec4 wp = matrix_model * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(matrix_normal * dn);
    vBary = aBary;
    vInfl = infl;
    vNoise = h;
    vStretch = stretch;
    gl_Position = matrix_viewProjection * wp;
}
