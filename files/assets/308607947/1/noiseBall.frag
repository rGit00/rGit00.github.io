// noiseBall.frag
// Colore: base illuminata + colore "caldo" dove agisce il mouse
// (sfumato tra due colori in base all'altezza delle montagne) + rim light fresnel.
// Una seconda luce (fill) illumina la palla da un'altra direzione, di default dal basso a sinistra.
// Le zone stirate dal trascinamento si colorano con il colore "stretch".
// Nella zona del mouse compare il wireframe (coordinate baricentriche).
// Uscita in HDR lineare: tonemapping e bloom li fa il postFx della camera.

uniform vec3  view_position;

uniform vec3  uBaseColor;
uniform vec3  uHotColorA;
uniform vec3  uHotColorB;
uniform float uHotIntensity;
uniform vec3  uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;
uniform vec3  uLightDir;       // direzione verso la luce
uniform float uSpecular;
uniform float uGlossiness;

// Seconda luce (fill)
uniform vec3  uFillDir;        // direzione verso la luce
uniform vec3  uFillColor;
uniform float uFillIntensity;
uniform float uFillSoftness;   // basso = luce larga e morbida, alto = macchia stretta
uniform float uFillSpecular;

// Colore dello stiramento
uniform vec3  uStretchColor;
uniform float uStretchIntensity;
uniform float uStretchRange;   // di quanto bisogna tirare per il colore pieno

// Wireframe
uniform float uWireEnabled;
uniform vec3  uWireColor;
uniform float uWireIntensity;
uniform float uWireWidth;      // spessore linee in pixel
uniform float uWireStart;      // da quanta influenza parte il wireframe
uniform float uWireSoftness;   // sfumatura del bordo della zona wireframe
uniform float uWireFill;       // luminosita delle facce nella zona wireframe (0 = nere)
uniform float uWireCutout;     // 1 = buca le facce: si vede attraverso la palla
uniform float uHideDiagonals;  // 1 = mostra quadrati invece di triangoli

varying vec3  vWorldPos;
varying vec3  vNormal;
varying vec3  vBary;
varying float vInfl;
varying float vNoise;
varying float vStretch;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

void main(void) {
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(view_position - vWorldPos);
    vec3 L = normalize(uLightDir);

    // Luce semplice: diffusa + ambiente
    float diff = max(dot(N, L), 0.0) * 0.8 + 0.2;
    vec3 col = toLinear(uBaseColor) * diff;

    // Colore caldo dove agisce il mouse, variato dall'altezza delle montagne
    vec3 hot = mix(toLinear(uHotColorA), toLinear(uHotColorB), vNoise) * uHotIntensity;
    float h = clamp(vInfl * (0.5 + vNoise), 0.0, 1.0);
    col = mix(col, hot, h);

    // Colore dove la superficie e' stirata
    float s = clamp(vStretch / max(uStretchRange, 0.0001), 0.0, 1.0);
    col = mix(col, toLinear(uStretchColor) * uStretchIntensity, s * s * (3.0 - 2.0 * s));

    // Speculare
    vec3 H = normalize(L + V);
    col += pow(max(dot(N, H), 0.0), uGlossiness) * uSpecular;

    // Seconda luce (fill): diffusa morbida + un piccolo riflesso
    vec3 Lf = normalize(uFillDir);
    vec3 fillCol = toLinear(uFillColor) * uFillIntensity;
    col += fillCol * pow(max(dot(N, Lf), 0.0), uFillSoftness);
    vec3 Hf = normalize(Lf + V);
    col += fillCol * pow(max(dot(N, Hf), 0.0), uGlossiness) * uFillSpecular;

    // Rim light (fresnel)
    float rim = pow(1.0 - max(dot(N, V), 0.0), uRimPower);
    col += toLinear(uRimColor) * rim * uRimIntensity;

    // ---- Wireframe nella zona del mouse ----
    float mask = smoothstep(uWireStart, uWireStart + max(uWireSoftness, 0.0001), vInfl) * uWireEnabled;
    if (mask > 0.001) {
        vec3 w = fwidth(vBary) * uWireWidth;
        vec3 e3 = smoothstep(vec3(0.0), w, vBary);
        float e = min(e3.x, e3.y);
        if (uHideDiagonals < 0.5) e = min(e, e3.z);
        float line = 1.0 - e;               // 1 sulle linee, 0 dentro le facce

        if (uWireCutout > 0.5 && mask > 0.5 && line < 0.5) discard;

        col *= mix(1.0, uWireFill, mask);
        col += toLinear(uWireColor) * uWireIntensity * line * mask;
    }

    gl_FragColor = vec4(col, 1.0);
}
