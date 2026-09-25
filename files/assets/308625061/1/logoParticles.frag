// logoParticles.frag
// Disegna ogni punto come una pallina: cerchio + normale di una sfera finta,
// luce diffusa + riflesso. A riposo mescola due grigi, quando la particella
// viene spinta diventa del colore "caldo" (HDR, quindi fa bloom).

uniform vec3  uColorA;         // grigio scuro
uniform vec3  uColorB;         // grigio molto scuro
uniform vec3  uHotColor;       // rosso
uniform float uHotIntensity;
uniform vec3  uLightDir;       // direzione verso la luce (spazio vista)
uniform float uAmbient;
uniform float uSpecular;
uniform float uGlossiness;

varying float vTone;
varying float vHeat;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

void main(void) {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;

    // Normale di una sfera vista di fronte
    vec3 N = vec3(c.x, -c.y, sqrt(1.0 - r2));
    vec3 L = normalize(uLightDir);
    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), uGlossiness) * uSpecular;

    vec3 base = mix(toLinear(uColorA), toLinear(uColorB), vTone);
    vec3 lit = base * (uAmbient + diff * (1.0 - uAmbient)) + spec;

    // Particelle spinte: colore caldo emissivo, un po' piu chiaro al centro
    vec3 hot = toLinear(uHotColor) * uHotIntensity * (0.6 + 0.4 * N.z);
    vec3 col = mix(lit, hot, vHeat);

    gl_FragColor = vec4(col, 1.0);
}
