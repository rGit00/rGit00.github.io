// datamosh.js
// Datamosh in tempo reale su un logo fermo, guidato dal movimento della webcam
// (e, in piu, dal mouse).
//
// Come funziona (tutto sulla GPU, a passaggi):
//  1. Luminanza: il video della webcam viene rimpicciolito in bianco e nero
//     (specchiato, cosi muovi la mano a destra e l'effetto va a destra).
//  2. Vettori di movimento: per ogni zona si confronta il frame nuovo con quello
//     precedente e si cerca di quanto si e' spostato il contenuto (block matching).
//  3. Campo di movimento: i vettori vengono smussati nel tempo (inerzia) e ci si
//     aggiunge il movimento del mouse. Il campo tiene anche "quanto e' agitata"
//     ogni zona e la velocita di caduta (gravita): le zone smosse iniziano a colare.
//  4. Datamosh: l'immagine "memoria" non viene mai ridisegnata da zero: ogni frame
//     i suoi pixel vengono spostati a BLOCCHI secondo il campo di movimento.
//     I blocchi hanno misure diverse (suddivisione a quadtree, come nei codec)
//     e ogni tanto diventano linee sottili. Nei blocchi in movimento puo affiorare
//     l'immagine della webcam (bianco e nero, colori, oppure scura con i bordi
//     incandescenti): il canale alpha della memoria dice se un pixel e'
//     "inchiostro" del logo o sfondo e viaggia insieme al pixel, cosi la webcam
//     puo apparire solo dentro i pezzi del logo. Una ripulitura graduale e qualche
//     blocco che si ripulisce di colpo riportano piano piano il logo pulito.
//  5. Uscita: la memoria viene mostrata a schermo intero.
// Invertito: i colori neutri (bianco, nero, grigi) diventano il grigio opposto,
// quelli colorati (il rosso) restano uguali. Pulsante "Invert" in alto a sinistra.
// Il video della webcam resta nel browser: non viene inviato da nessuna parte.
var Datamosh = pc.createScript('datamosh');

Datamosh.attributes.add('logoAsset', { type: 'asset', title: 'Logo (file SVG)' });
Datamosh.attributes.add('cameraEntity', { type: 'entity', title: 'Camera (per il colore di sfondo)' });

Datamosh.attributes.add('logo', {
    type: 'json', title: 'Logo',
    schema: [
        { name: 'size', type: 'number', default: 0.62, min: 0.05, max: 1.5, precision: 3, title: 'Larghezza (frazione della pagina)' },
        { name: 'offsetX', type: 'number', default: 0, min: -0.5, max: 0.5, precision: 3, title: 'Spostamento orizzontale (frazione pagina)' },
        { name: 'offsetY', type: 'number', default: 0, min: -0.5, max: 0.5, precision: 3, title: 'Spostamento verticale (frazione pagina)' },
        { name: 'background', type: 'rgb', default: [1, 1, 1], title: 'Colore sfondo' },
        { name: 'invert', type: 'boolean', default: false, title: 'Invertito (sfondo nero, il nero del logo diventa bianco)' }
    ]
});

Datamosh.attributes.add('ui', {
    type: 'json', title: 'Pulsante Invert',
    schema: [
        { name: 'show', type: 'boolean', default: true, title: 'Mostra il pulsante' },
        { name: 'label', type: 'string', default: 'Invert', title: 'Scritta' },
        { name: 'offsetLeft', type: 'number', default: 20, min: 0, max: 500, precision: 0, title: 'Distanza dal bordo sinistro (px)' },
        { name: 'offsetTop', type: 'number', default: 20, min: 0, max: 500, precision: 0, title: 'Distanza dal bordo in alto (px)' },
        { name: 'fontSize', type: 'number', default: 13, min: 8, max: 32, precision: 0, title: 'Dimensione testo (px)' }
    ]
});

Datamosh.attributes.add('webcam', {
    type: 'json', title: 'Webcam (movimento)',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Usa la webcam' },
        { name: 'gain', type: 'number', default: 1, min: 0, max: 5, precision: 2, title: 'Forza del movimento' },
        { name: 'threshold', type: 'number', default: 0.03, min: 0, max: 0.3, precision: 3, title: 'Soglia (ignora movimenti piccoli e rumore)' },
        { name: 'showPreview', type: 'boolean', default: true, title: 'Mostra anteprima webcam' },
        { name: 'previewSize', type: 'number', default: 220, min: 80, max: 640, precision: 0, title: 'Larghezza anteprima (px)' }
    ]
});

Datamosh.attributes.add('reveal', {
    type: 'json', title: 'Webcam che affiora',
    schema: [
        { name: 'amount', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Quanto affiora la webcam nei blocchi in movimento (0 = mai)' },
        { name: 'speed', type: 'number', default: 0.6, min: 0.02, max: 5, precision: 2, title: 'Movimento necessario per l\'effetto pieno (basso = affiora subito)' },
        { name: 'onlyLogo', type: 'boolean', default: true, title: 'Solo dentro il logo (lo sfondo resta pulito)' },
        { name: 'style', type: 'number', default: 2, min: 0, max: 2, precision: 0, step: 1, title: 'Stile (0 = bianco e nero, 1 = colori veri, 2 = bordi incandescenti)' },
        { name: 'contrast', type: 'number', default: 0.5, min: 0, max: 0.98, precision: 2, title: 'Contrasto del bianco e nero (stile 0)' }
    ]
});

Datamosh.attributes.add('edges', {
    type: 'json', title: 'Bordi incandescenti (stile 2)',
    schema: [
        { name: 'intensity', type: 'number', default: 2.5, min: 0, max: 10, precision: 2, title: 'Intensita dei bordi' },
        { name: 'glow', type: 'number', default: 0.7, min: 0, max: 3, precision: 2, title: 'Bagliore attorno ai bordi' },
        { name: 'width', type: 'number', default: 3, min: 1, max: 12, precision: 1, title: 'Larghezza del bagliore (pixel della webcam)' },
        { name: 'threshold', type: 'number', default: 0.08, min: 0, max: 0.5, precision: 3, title: 'Soglia (ignora i bordi deboli)' },
        { name: 'darkness', type: 'number', default: 0.12, min: 0, max: 1, precision: 2, title: 'Luminosita dell\'immagine sotto i bordi (0 = nera)' },
        { name: 'heat', type: 'boolean', default: true, title: 'Colori incandescenti (rosso > giallo > bianco)' },
        { name: 'color', type: 'rgb', default: [1, 0.35, 0.1], title: 'Colore dei bordi (se non incandescenti)' }
    ]
});

Datamosh.attributes.add('mouse', {
    type: 'json', title: 'Mouse (movimento)',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Usa il mouse' },
        { name: 'gain', type: 'number', default: 1, min: 0, max: 5, precision: 2, title: 'Forza del movimento' },
        { name: 'radius', type: 'number', default: 0.12, min: 0.01, max: 1, precision: 3, title: 'Raggio (frazione dell\'altezza)' }
    ]
});

Datamosh.attributes.add('gravity', {
    type: 'json', title: 'Gravita',
    schema: [
        { name: 'enabled', type: 'boolean', default: false, title: 'Attiva' },
        { name: 'strength', type: 'number', default: 1.5, min: 0, max: 20, precision: 2, title: 'Forza (accelerazione)' },
        { name: 'maxSpeed', type: 'number', default: 0.8, min: 0.01, max: 10, precision: 2, title: 'Velocita massima di caduta' },
        { name: 'hold', type: 'number', default: 1.5, min: 0.05, max: 20, precision: 2, title: 'Quanto continuano a cadere dopo il movimento (s)' },
        { name: 'trigger', type: 'number', default: 0.3, min: 0.01, max: 5, precision: 2, title: 'Movimento che fa partire la caduta (basso = basta poco)' },
        { name: 'always', type: 'boolean', default: false, title: 'Sempre attiva (il logo cola da solo)' },
        { name: 'angle', type: 'number', default: 0, min: -180, max: 180, precision: 0, title: 'Direzione (gradi, 0 = in basso)' }
    ]
});

Datamosh.attributes.add('blocks', {
    type: 'json', title: 'Forma dei blocchi',
    schema: [
        { name: 'maxSize', type: 'number', default: 64, min: 4, max: 256, precision: 0, step: 1, title: 'Blocchi piu grandi (px)' },
        { name: 'minSize', type: 'number', default: 4, min: 1, max: 128, precision: 0, step: 1, title: 'Blocchi piu piccoli (px)' },
        { name: 'split', type: 'number', default: 0.55, min: 0, max: 1, precision: 2, title: 'Quanto si suddividono (0 = tutti grandi, 1 = tutti piccoli)' },
        { name: 'lineChance', type: 'number', default: 0.08, min: 0, max: 1, precision: 3, title: 'Probabilita di linee' },
        { name: 'lineThickness', type: 'number', default: 2, min: 1, max: 32, precision: 0, step: 1, title: 'Spessore linee (px)' },
        { name: 'lineLength', type: 'number', default: 4, min: 1, max: 32, precision: 0, step: 1, title: 'Lunghezza linee (in blocchi grandi)' },
        { name: 'vertical', type: 'number', default: 0.2, min: 0, max: 1, precision: 2, title: 'Quota di linee verticali' },
        { name: 'changeRate', type: 'number', default: 2, min: 0, max: 30, precision: 2, title: 'Cambio della suddivisione (volte al secondo, 0 = fissa)' }
    ]
});

Datamosh.attributes.add('mosh', {
    type: 'json', title: 'Datamosh',
    schema: [
        { name: 'strength', type: 'number', default: 1, min: 0, max: 5, precision: 2, title: 'Quanto si trascinano i pixel' },
        { name: 'inertia', type: 'number', default: 0.25, min: 0.01, max: 3, precision: 2, title: 'Inerzia dei movimenti (s)' },
        { name: 'heal', type: 'number', default: 0.15, min: 0, max: 5, precision: 3, title: 'Ripulitura graduale (al secondo)' },
        { name: 'refresh', type: 'number', default: 0.05, min: 0, max: 5, precision: 3, title: 'Blocchi che si ripuliscono di colpo (al secondo)' },
        { name: 'chroma', type: 'number', default: 0, min: 0, max: 10, precision: 2, title: 'Separazione dei colori (px)' }
    ]
});

Datamosh.LUMA_W = 128;      // larghezza del video rimpicciolito per il movimento

// ---------- Shader ----------

Datamosh.VS = [
    'attribute vec2 aPosition;',
    'varying vec2 vUv0;',
    'void main(void) {',
    '    gl_Position = vec4(aPosition, 0.0, 1.0);',
    '    vUv0 = aPosition * 0.5 + 0.5;',
    '}'
].join('\n');

// 1. luminanza del video (specchiato e raddrizzato), con una piccola media
Datamosh.FS_LUMA = [
    'uniform sampler2D uVideo;',
    'uniform vec2 uVideoTexel;',
    'varying vec2 vUv0;',
    'float lum(vec2 uv) { return dot(texture2D(uVideo, uv).rgb, vec3(0.299, 0.587, 0.114)); }',
    'void main(void) {',
    '    vec2 uv = vec2(1.0 - vUv0.x, 1.0 - vUv0.y);',
    '    vec2 o = uVideoTexel * 1.5;',
    '    float l = (lum(uv + vec2(-o.x, -o.y)) + lum(uv + vec2(o.x, -o.y)) + lum(uv + vec2(-o.x, o.y)) + lum(uv + vec2(o.x, o.y))) * 0.25;',
    '    gl_FragColor = vec4(l, l, l, 1.0);',
    '}'
].join('\n');

// 2. vettori di movimento (block matching): da dove arriva il contenuto di questa zona
Datamosh.FS_MOTION = [
    '#define R 4',
    'uniform sampler2D uCur;',
    'uniform sampler2D uPrev;',
    'uniform vec2 uLumaTexel;',
    'uniform vec2 uToScreen;',
    'uniform float uThresh;',
    'varying vec2 vUv0;',
    'void main(void) {',
    '    float c[16];',
    '    for (int k = 0; k < 16; k++) {',
    '        vec2 o = (vec2(float(k - (k / 4) * 4), float(k / 4)) - 1.5) * uLumaTexel;',
    '        c[k] = texture2D(uCur, vUv0 + o).r;',
    '    }',
    '    float best = 1e9;',
    '    float sad0 = 0.0;',
    '    vec2 bestD = vec2(0.0);',
    '    for (int dy = -R; dy <= R; dy++) {',
    '        for (int dx = -R; dx <= R; dx++) {',
    '            vec2 d = vec2(float(dx), float(dy));',
    '            float s = 0.0;',
    '            for (int k = 0; k < 16; k++) {',
    '                vec2 o = (vec2(float(k - (k / 4) * 4), float(k / 4)) - 1.5 - d) * uLumaTexel;',
    '                s += abs(c[k] - texture2D(uPrev, vUv0 + o).r);',
    '            }',
    '            if (dx == 0 && dy == 0) sad0 = s;',
    '            s += dot(d, d) * 0.004;',
    '            if (s < best) { best = s; bestD = d; }',
    '        }',
    '    }',
    '    if (sad0 - best < uThresh * 16.0) bestD = vec2(0.0);',
    '    gl_FragColor = vec4(bestD * uToScreen, 0.0, 1.0);',
    '}'
].join('\n');

// 3. campo di movimento (velocita in uv dello schermo al secondo):
//    xy = movimento (inerzia + mouse), z = quanto la zona e' agitata, w = velocita di caduta
Datamosh.FS_FIELD = [
    'uniform sampler2D uField;',
    'uniform sampler2D uMotion;',
    'uniform float uCamK;',
    'uniform float uCamGain;',
    'uniform vec2 uMouseUv;',
    'uniform vec2 uMouseVel;',
    'uniform float uMouseR;',
    'uniform float uMouseK;',
    'uniform float uCamAspect;',
    'uniform float uGravOn;',
    'uniform float uGravAcc;',
    'uniform float uGravMax;',
    'uniform float uHoldK;',
    'uniform float uTrigger;',
    'uniform float uAlways;',
    'varying vec2 vUv0;',
    'void main(void) {',
    '    vec4 f = texture2D(uField, vUv0);',
    '    vec2 m = texture2D(uMotion, vUv0).xy * uCamGain;',
    '    vec2 v = mix(f.xy, m, uCamK);',
    '    vec2 d = (vUv0 - uMouseUv) * vec2(uCamAspect, 1.0);',
    '    float w = exp(-dot(d, d) / max(uMouseR * uMouseR, 1e-6));',
    '    v = mix(v, uMouseVel, clamp(w * uMouseK, 0.0, 1.0));',
    '    // agitazione: sale subito col movimento, poi si spegne piano',
    '    float act = max(f.z * uHoldK, clamp(length(v) / uTrigger, 0.0, 1.0));',
    '    if (uAlways > 0.5) act = 1.0;',
    '    // caduta: accelera dove la zona e\' agitata, rallenta quando si calma',
    '    float fall = 0.0;',
    '    if (uGravOn > 0.5) fall = min((f.w + uGravAcc) * act, uGravMax);',
    '    gl_FragColor = vec4(v, act, fall);',
    '}'
].join('\n');

// 4. datamosh: sposto la memoria a blocchi di misure diverse (e linee), faccio
//    affiorare la webcam dove c'e' movimento e ripulisco piano piano verso il logo.
//    Alpha della memoria = quanto il pixel e' "inchiostro" del logo (viaggia col pixel).
Datamosh.FS_MOSH = [
    'uniform sampler2D uPrev;',
    'uniform sampler2D uField;',
    'uniform sampler2D uLogo;',
    'uniform sampler2D uVideo;',
    'uniform vec2 uVideoTexel;',
    'uniform vec2 uRes;',
    'uniform vec2 uCamScale;',
    'uniform vec3 uBg;',
    'uniform vec2 uGravDir;',
    'uniform float uDisp;',
    'uniform float uHeal;',
    'uniform float uRefresh;',
    'uniform float uSeed;',
    'uniform float uChroma;',
    'uniform float uReveal;',
    'uniform float uRevealSpeed;',
    'uniform float uOnlyLogo;',
    'uniform float uStyle;',
    'uniform float uContrast;',
    'uniform float uEdgeGain;',
    'uniform float uEdgeGlow;',
    'uniform float uEdgeWidth;',
    'uniform float uEdgeThresh;',
    'uniform float uEdgeDark;',
    'uniform float uEdgeHeat;',
    'uniform vec3 uEdgeColor;',
    'uniform float uMaxB;',
    'uniform float uMinB;',
    'uniform float uSplit;',
    'uniform float uLineP;',
    'uniform float uLineT;',
    'uniform float uLineLen;',
    'uniform float uLineV;',
    'uniform float uPattern;',
    'varying vec2 vUv0;',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    '// immagine pulita: rgb = logo, a = inchiostro (1 dove non e\' sfondo)',
    'vec4 clean(vec2 uv) {',
    '    vec3 c = texture2D(uLogo, vec2(uv.x, 1.0 - uv.y)).rgb;',
    '    return vec4(c, smoothstep(0.02, 0.1, distance(c, uBg)));',
    '}',
    'vec4 prevAt(vec2 uv) {',
    '    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return clean(clamp(uv, 0.0, 1.0));',
    '    return texture2D(uPrev, uv);',
    '}',
    'float vlum(vec2 vuv) { return dot(texture2D(uVideo, vuv).rgb, vec3(0.299, 0.587, 0.114)); }',
    '// bordi (Sobel) della webcam alla distanza r (in texel del video)',
    'float sobel(vec2 vuv, vec2 r) {',
    '    float tl = vlum(vuv + vec2(-r.x,  r.y)), tc = vlum(vuv + vec2(0.0,  r.y)), tr = vlum(vuv + vec2(r.x,  r.y));',
    '    float ml = vlum(vuv + vec2(-r.x, 0.0)),                                   mr = vlum(vuv + vec2(r.x, 0.0));',
    '    float bl = vlum(vuv + vec2(-r.x, -r.y)), bc = vlum(vuv + vec2(0.0, -r.y)), br = vlum(vuv + vec2(r.x, -r.y));',
    '    float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);',
    '    float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);',
    '    return length(vec2(gx, gy));',
    '}',
    '// rampa del metallo incandescente: nero > rosso > arancio > giallo > bianco',
    'vec3 heat(float t) {',
    '    t = clamp(t, 0.0, 1.0);',
    '    return clamp(vec3(t * 2.2, t * 2.2 - 0.75, t * 3.0 - 2.1), 0.0, 1.0);',
    '}',
    '// webcam a tutto schermo (specchiata, come uno specchio), nello stile scelto',
    'vec3 camColor(vec2 uv) {',
    '    vec2 c = 0.5 + (uv - 0.5) * uCamScale;',
    '    vec2 vuv = vec2(1.0 - c.x, 1.0 - c.y);',
    '    vec3 v = texture2D(uVideo, vuv).rgb;',
    '    if (uStyle < 0.5) {',
    '        float e = 0.5 * uContrast;',
    '        return vec3(smoothstep(e, 1.0 - e, dot(v, vec3(0.299, 0.587, 0.114))));',
    '    }',
    '    if (uStyle < 1.5) return v;',
    '    // bordi incandescenti: linea nitida + alone largo, su immagine scura',
    '    float e1 = sobel(vuv, uVideoTexel);',
    '    float e2 = sobel(vuv, uVideoTexel * uEdgeWidth);',
    '    float edge = max(e1 - uEdgeThresh, 0.0) * uEdgeGain;',
    '    float halo = max(e2 - uEdgeThresh, 0.0) * uEdgeGain * uEdgeGlow * 0.6;',
    '    float t = edge + halo;',
    '    vec3 glowCol = uEdgeHeat > 0.5 ? heat(t) : uEdgeColor * clamp(t, 0.0, 1.5);',
    '    vec3 base = v * uEdgeDark;',
    '    return base + glowCol;',
    '}',
    '// blocco che contiene il pixel: xy = angolo in basso a sinistra, zw = misura (px)',
    'vec4 getBlock(vec2 px) {',
    '    // linee orizzontali: zone lunghe e basse divise in strisce sottili',
    '    vec2 hz = vec2(uMaxB * uLineLen, uMaxB);',
    '    vec2 hc = floor(px / hz);',
    '    if (hash(hc + uPattern * 1.713 + 3.31) < uLineP * (1.0 - uLineV)) {',
    '        float y0 = hc.y * hz.y;',
    '        return vec4(hc.x * hz.x, y0 + floor((px.y - y0) / uLineT) * uLineT, hz.x, uLineT);',
    '    }',
    '    // linee verticali',
    '    vec2 vz = vec2(uMaxB, uMaxB * uLineLen);',
    '    vec2 vc = floor(px / vz);',
    '    if (hash(vc + uPattern * 2.917 + 7.77) < uLineP * uLineV) {',
    '        float x0 = vc.x * vz.x;',
    '        return vec4(x0 + floor((px.x - x0) / uLineT) * uLineT, vc.y * vz.y, uLineT, vz.y);',
    '    }',
    '    // quadtree: parto dal blocco grande e lo divido a caso in 4, piu volte',
    '    float s = uMaxB;',
    '    vec2 org = floor(px / s) * s;',
    '    for (int i = 0; i < 7; i++) {',
    '        if (s * 0.5 < uMinB) break;',
    '        if (hash(org / s + s * 0.618 + uPattern * 5.13) >= uSplit) break;',
    '        s *= 0.5;',
    '        org = floor(px / s) * s;',
    '    }',
    '    return vec4(org, s, s);',
    '}',
    'void main(void) {',
    '    vec2 px = vUv0 * uRes;',
    '    vec4 b = getBlock(px);',
    '    vec2 id = b.xy / max(uMinB, 1.0) + b.zw * 0.37;',
    '    vec2 bc = (b.xy + b.zw * 0.5) / uRes;',
    '    vec2 camUv = 0.5 + (bc - 0.5) * uCamScale;',
    '    vec4 fv = texture2D(uField, camUv);',
    '    // movimento + caduta (la caduta e\' in altezze dello schermo al secondo)',
    '    vec2 vel = fv.xy + uGravDir * fv.w * vec2(uRes.y / uRes.x, 1.0);',
    '    vec2 disp = vel * uRes * uDisp;',
    '    // arrotondo a pixel interi (a caso per blocco, cosi anche i movimenti lenti avanzano) -> resta nitido',
    '    disp = floor(disp + vec2(hash(id + uSeed), hash(id + uSeed + 17.31)));',
    '    vec2 src = (px - disp) / uRes;',
    '    vec4 col;',
    '    float moving = step(0.5, dot(disp, disp));',
    '    if (uChroma > 0.0 && moving > 0.0) {',
    '        vec2 dir = normalize(disp) * uChroma / uRes;',
    '        vec4 g = prevAt(src);',
    '        col = vec4(prevAt(src - dir).r, g.g, prevAt(src + dir).b, g.a);',
    '    } else {',
    '        col = prevAt(src);',
    '    }',
    '    if (uReveal > 0.0) {',
    '        float m = clamp(length(fv.xy) / max(uRevealSpeed, 1e-4), 0.0, 1.0);',
    '        float wgt = clamp(m * uReveal, 0.0, 1.0) * mix(1.0, col.a, uOnlyLogo);',
    '        if (wgt > 0.001) col.rgb = mix(col.rgb, camColor(vUv0), wgt);',
    '    }',
    '    float h = uHeal;',
    '    if (hash(id * 1.37 + uSeed * 3.1) < uRefresh) h = 1.0;',
    '    col = mix(col, clean(vUv0), h);',
    '    gl_FragColor = col;',
    '}'
].join('\n');

// 5. uscita a schermo intero (materiale della mesh)
Datamosh.VS_OUT = [
    'attribute vec3 aPosition;',
    'varying vec2 vUv0;',
    'void main(void) {',
    '    gl_Position = vec4(aPosition.xy, 0.0, 1.0);',
    '    vUv0 = aPosition.xy * 0.5 + 0.5;',
    '}'
].join('\n');

Datamosh.FS_OUT = [
    'uniform sampler2D uTex;',
    'varying vec2 vUv0;',
    'void main(void) {',
    '    gl_FragColor = vec4(texture2D(uTex, vUv0).rgb, 1.0);',
    '}'
].join('\n');

// Quanto un colore (0..255) e' "neutro": 1 sui grigi/bianco/nero, 0 sui colori saturi
Datamosh.neutralWeight = function (r, g, b) {
    var s = Math.max(r, g, b) - Math.min(r, g, b);
    var t = (s - 30) / 50;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    t = t * t * (3 - 2 * t);
    return 1 - t;
};

// ---------- Init ----------

Datamosh.prototype.initialize = function () {
    this.device = this.app.graphicsDevice;
    this.canvas = this.device.canvas;
    this.camera = this.cameraEntity || (this.app.root.findComponent('camera') || {}).entity;
    this.time = 0;
    this.frame = 0;
    this.bgArr = new Float32Array(3);
    this.edgeCol = new Float32Array(3);
    this.effBg = [1, 1, 1];
    this.gravDir = new Float32Array(2);

    var dev = this.device;
    if (dev.textureHalfFloatRenderable) this.floatFormat = pc.PIXELFORMAT_RGBA16F;
    else if (dev.textureFloatRenderable) this.floatFormat = pc.PIXELFORMAT_RGBA32F;
    else {
        this.floatFormat = pc.PIXELFORMAT_RGBA8;
        console.warn('[datamosh] questo dispositivo non supporta texture float: il movimento sara impreciso');
    }
    this.floatFilter = (this.floatFormat === pc.PIXELFORMAT_RGBA16F ||
        (this.floatFormat === pc.PIXELFORMAT_RGBA32F && dev.textureFloatFilterable)) ?
        pc.FILTER_LINEAR : pc.FILTER_NEAREST;

    this.shLuma = this.makeShader('dmLuma', Datamosh.FS_LUMA);
    this.shMotion = this.makeShader('dmMotion', Datamosh.FS_MOTION);
    this.shField = this.makeShader('dmField2', Datamosh.FS_FIELD);
    this.shMosh = this.makeShader('dmMosh5', Datamosh.FS_MOSH);
    this.scope = dev.scope;
    this.uni = {};

    // Mouse
    this.mouseU = 0.5; this.mouseV = 0.5;
    this.mAccX = 0; this.mAccY = 0;
    this.mVelX = 0; this.mVelY = 0;
    this.hasMouse = false;
    var self = this;
    this.onMove = function (e) {
        var rect = self.canvas.getBoundingClientRect();
        var u = (e.clientX - rect.left) / (rect.width || 1);
        var v = 1 - (e.clientY - rect.top) / (rect.height || 1);
        if (self.hasMouse) { self.mAccX += u - self.mouseU; self.mAccY += v - self.mouseV; }
        self.mouseU = u; self.mouseV = v;
        self.hasMouse = u >= 0 && v >= 0 && u <= 1 && v <= 1;
    };
    this.onOut = function (e) { if (!e.relatedTarget) self.hasMouse = false; };
    window.addEventListener('pointermove', this.onMove);
    document.addEventListener('mouseout', this.onOut);

    // Webcam: finche non e' pronta uso un formato 4:3
    this.camAspect = 4 / 3;
    this.camReady = false;
    this.camNew = false;
    this.camFrames = 0;
    this.camInterval = 1 / 30;
    this.buildCamTargets();

    // Logo e memoria del datamosh
    this.logoCanvas = document.createElement('canvas');
    this.logoSvg = null;
    this.logoAspect = 1;
    this.buildScreenTargets();
    this.loadLogo();

    // Mesh a schermo intero che mostra il risultato
    this.buildOutput();

    this.startWebcam();
    this.buildPreview();
    this.buildInvertButton();

    this.on('attr:logoAsset', this.loadLogo, this);
    this.on('attr:logo', function () { this.drawLogo(); this.refreshInvertButton(); }, this);
    this.on('attr:ui', this.refreshInvertButton, this);
    this.on('attr:webcam', function () {
        this.updatePreview();
        if (this.webcam.enabled && !this.stream && !this.camFailed) this.startWebcam();
    }, this);

    this.on('destroy', function () {
        this.dead = true;
        window.removeEventListener('pointermove', this.onMove);
        document.removeEventListener('mouseout', this.onOut);
        this.stopWebcam();
        if (this.previewWrap && this.previewWrap.parentNode) this.previewWrap.parentNode.removeChild(this.previewWrap);
        if (this.invertWrap && this.invertWrap.parentNode) this.invertWrap.parentNode.removeChild(this.invertWrap);
        if (this.invertStyle && this.invertStyle.parentNode) this.invertStyle.parentNode.removeChild(this.invertStyle);
        this.destroyTargets(this.camTargets);
        this.destroyTargets(this.screenTargets);
        if (this.videoTex) this.videoTex.destroy();
        if (this.logoTex) this.logoTex.destroy();
        if (this.outEntity) this.outEntity.destroy();
        if (this.outMesh) this.outMesh.destroy();
        if (this.outMat) this.outMat.destroy();
    }, this);
};

Datamosh.prototype.makeShader = function (name, fs) {
    var attrs = { aPosition: pc.SEMANTIC_POSITION };
    if (pc.ShaderUtils && pc.ShaderUtils.createShader) {
        return pc.ShaderUtils.createShader(this.device, {
            uniqueName: name, attributes: attrs, vertexGLSL: Datamosh.VS, fragmentGLSL: fs
        });
    }
    return pc.createShaderFromCode(this.device, Datamosh.VS, fs, name, attrs);
};

Datamosh.prototype.setU = function (name, value) {
    var u = this.uni[name] || (this.uni[name] = this.scope.resolve(name));
    u.setValue(value);
};

Datamosh.prototype.makeTarget = function (w, h, format, filter) {
    var tex = new pc.Texture(this.device, {
        width: w, height: h, format: format, mipmaps: false,
        minFilter: filter, magFilter: filter,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });
    return { tex: tex, rt: new pc.RenderTarget({ colorBuffer: tex, depth: false }) };
};

Datamosh.prototype.destroyTargets = function (list) {
    if (!list) return;
    for (var i = 0; i < list.length; i++) { list[i].rt.destroy(); list[i].tex.destroy(); }
};

// Target a risoluzione della webcam: luminanza (x2), vettori, campo (x2)
Datamosh.prototype.buildCamTargets = function () {
    this.destroyTargets(this.camTargets);
    var lw = Datamosh.LUMA_W, lh = Math.max(8, Math.round(lw / this.camAspect));
    var mw = lw / 2, mh = Math.max(4, Math.round(lh / 2));
    this.lumaW = lw; this.lumaH = lh;
    this.lumaA = this.makeTarget(lw, lh, pc.PIXELFORMAT_RGBA8, pc.FILTER_LINEAR);
    this.lumaB = this.makeTarget(lw, lh, pc.PIXELFORMAT_RGBA8, pc.FILTER_LINEAR);
    this.motion = this.makeTarget(mw, mh, this.floatFormat, this.floatFilter);
    this.fieldA = this.makeTarget(mw, mh, this.floatFormat, this.floatFilter);
    this.fieldB = this.makeTarget(mw, mh, this.floatFormat, this.floatFilter);
    this.camTargets = [this.lumaA, this.lumaB, this.motion, this.fieldA, this.fieldB];
    this.camFrames = 0;
};

// Target a risoluzione dello schermo: memoria del datamosh (x2) + texture del logo pulito
Datamosh.prototype.buildScreenTargets = function () {
    this.destroyTargets(this.screenTargets);
    var W = Math.max(1, this.device.width), H = Math.max(1, this.device.height);
    this.scrW = W; this.scrH = H;
    this.moshA = this.makeTarget(W, H, pc.PIXELFORMAT_RGBA8, pc.FILTER_NEAREST);
    this.moshB = this.makeTarget(W, H, pc.PIXELFORMAT_RGBA8, pc.FILTER_NEAREST);
    this.screenTargets = [this.moshA, this.moshB];
    this.drawLogo();
};

Datamosh.prototype.buildOutput = function () {
    var mesh = new pc.Mesh(this.device);
    mesh.setPositions([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]);
    mesh.setIndices([0, 1, 2, 2, 1, 3]);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    this.outMesh = mesh;
    this.outMat = new pc.ShaderMaterial({
        uniqueName: 'dmOut_' + this.entity.guid,
        vertexGLSL: Datamosh.VS_OUT,
        fragmentGLSL: Datamosh.FS_OUT,
        attributes: { aPosition: pc.SEMANTIC_POSITION }
    });
    this.outMat.cull = pc.CULLFACE_NONE;
    this.outMat.depthTest = false;
    this.outMat.depthWrite = false;
    this.outMat.update();
    var mi = new pc.MeshInstance(mesh, this.outMat);
    mi.cull = false;
    this.outEntity = new pc.Entity('DatamoshOutput');
    this.outEntity.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    this.app.root.addChild(this.outEntity);
};

// ---------- Logo ----------

Datamosh.prototype.loadLogo = function () {
    this.logoSvg = null;
    var a = this.logoAsset;
    if (!a) { this.drawLogo(); return; }
    var self = this;
    var onReady = function (asset) {
        if (self.dead || asset !== self.logoAsset) return;
        var res = asset.resource, txt = null;
        if (typeof res === 'string') txt = res;
        else if (res instanceof ArrayBuffer) txt = new TextDecoder().decode(res);
        else if (res && res.buffer instanceof ArrayBuffer) txt = new TextDecoder().decode(res);
        if (!txt || txt.indexOf('<svg') < 0) { console.error('[datamosh] il logo deve essere un file SVG'); return; }
        var vb = /viewBox\s*=\s*["']([^"']+)["']/.exec(txt);
        var p = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : null;
        self.logoAspect = (p && p[2] > 0) ? p[3] / p[2] : 1;
        self.logoSvg = txt;
        self.drawLogo();
    };
    if (a.loaded) onReady(a);
    else { a.ready(onReady); this.app.assets.load(a); }
};

// Inverte i colori neutri del canvas (diventano il grigio opposto, cosi il nero
// del logo diventa bianco pulito), lascia com'e' il rosso e gli altri colori saturi
Datamosh.prototype.invertCanvas = function (ctx, W, H) {
    var img = ctx.getImageData(0, 0, W, H), p = img.data;
    for (var i = 0; i < p.length; i += 4) {
        var r = p[i], g = p[i + 1], b = p[i + 2];
        var w = Datamosh.neutralWeight(r, g, b);
        if (w <= 0) continue;
        var t = 255 - (0.299 * r + 0.587 * g + 0.114 * b);
        p[i] = r + (t - r) * w;
        p[i + 1] = g + (t - g) * w;
        p[i + 2] = b + (t - b) * w;
    }
    ctx.putImageData(img, 0, 0);
};

// Disegna sfondo + logo a tutto schermo in una texture (l'immagine "pulita")
Datamosh.prototype.drawLogo = function () {
    var W = this.scrW, H = this.scrH;
    if (!W) return;
    var cv = this.logoCanvas;
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var lg = this.logo;
    var bg = lg.background;
    var br = Array.isArray(bg) ? bg[0] : bg.r, bgg = Array.isArray(bg) ? bg[1] : bg.g, bb = Array.isArray(bg) ? bg[2] : bg.b;
    var invert = !!lg.invert;

    // colore di sfondo effettivo (anche per la camera e per la maschera del logo)
    var er = br, eg = bgg, eb = bb;
    if (invert) {
        var nw = Datamosh.neutralWeight(br * 255, bgg * 255, bb * 255);
        var t = 1 - (0.299 * br + 0.587 * bgg + 0.114 * bb);
        er = br + (t - br) * nw; eg = bgg + (t - bgg) * nw; eb = bb + (t - bb) * nw;
    }
    this.effBg = [er, eg, eb];

    ctx.fillStyle = 'rgb(' + Math.round(er * 255) + ',' + Math.round(eg * 255) + ',' + Math.round(eb * 255) + ')';
    ctx.fillRect(0, 0, W, H);
    this.uploadLogo();
    this.needReset = true;
    if (!this.logoSvg) return;

    var lw = Math.max(1, Math.round(lg.size * W));
    var lh = Math.max(1, Math.round(lw * this.logoAspect));
    var lx = Math.round(W * 0.5 - lw * 0.5 + lg.offsetX * W);
    var ly = Math.round(H * 0.5 - lh * 0.5 - lg.offsetY * H);
    var svg = this.logoSvg.replace(/<svg\b[^>]*>/, function (tag) {
        return tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/g, '')
            .replace(/<svg\b/, '<svg width="' + lw + '" height="' + lh + '" preserveAspectRatio="none"');
    });
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    var img = new Image();
    var self = this;
    var token = this.logoToken = (this.logoToken || 0) + 1;
    img.onload = function () {
        URL.revokeObjectURL(url);
        if (self.dead || token !== self.logoToken || cv.width !== W || cv.height !== H) return;
        // disegno sul colore di sfondo originale e poi, se serve, inverto tutto insieme
        ctx.fillStyle = 'rgb(' + Math.round(br * 255) + ',' + Math.round(bgg * 255) + ',' + Math.round(bb * 255) + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, lx, ly, lw, lh);
        if (invert) self.invertCanvas(ctx, W, H);
        self.uploadLogo();
        self.needReset = true;
    };
    img.onerror = function () { URL.revokeObjectURL(url); console.error('[datamosh] impossibile leggere l\'SVG del logo'); };
    img.src = url;
};

Datamosh.prototype.uploadLogo = function () {
    var cv = this.logoCanvas;
    if (!this.logoTex || this.logoTex.width !== cv.width || this.logoTex.height !== cv.height) {
        if (this.logoTex) this.logoTex.destroy();
        this.logoTex = new pc.Texture(this.device, {
            width: cv.width, height: cv.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: false,
            minFilter: pc.FILTER_NEAREST, magFilter: pc.FILTER_NEAREST,
            addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE
        });
    }
    this.logoTex.setSource(cv);
};

// ---------- Pulsante Invert (in alto a sinistra) ----------

Datamosh.prototype.buildInvertButton = function () {
    var style = document.createElement('style');
    style.textContent =
        '.dm-ui{position:fixed;z-index:10;font-family:Helvetica,Arial,sans-serif;letter-spacing:0.04em;' +
        'user-select:none;color:#fff;mix-blend-mode:difference;}' +
        '.dm-ui button{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;}' +
        '.dm-ui .box{width:0.9em;height:0.9em;border:1px solid currentColor;box-sizing:border-box;' +
        'display:inline-block;position:relative;}' +
        '.dm-ui button.on .box::after{content:"";position:absolute;inset:2px;background:currentColor;}' +
        '.dm-ui button:not(.on){opacity:0.6;}';
    document.head.appendChild(style);
    this.invertStyle = style;

    var wrap = document.createElement('div');
    wrap.className = 'dm-ui';
    var btn = document.createElement('button');
    btn.type = 'button';
    var box = document.createElement('span');
    box.className = 'box';
    this.invertLabel = document.createElement('span');
    btn.appendChild(box);
    btn.appendChild(this.invertLabel);
    var self = this;
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.logo.invert = !self.logo.invert;
        self.drawLogo();
        self.refreshInvertButton();
    });
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    this.invertWrap = wrap;
    this.invertBtn = btn;
    this.refreshInvertButton();
};

Datamosh.prototype.refreshInvertButton = function () {
    if (!this.invertWrap) return;
    var u = this.ui;
    var s = this.invertWrap.style;
    s.display = u.show === false ? 'none' : 'block';
    s.left = u.offsetLeft + 'px';
    s.top = u.offsetTop + 'px';
    s.fontSize = u.fontSize + 'px';
    this.invertLabel.textContent = u.label || 'Invert';
    this.invertBtn.classList.toggle('on', !!this.logo.invert);
};

// ---------- Webcam ----------

Datamosh.prototype.startWebcam = function () {
    if (!this.webcam.enabled || this.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.camFailed = true;
        this.setStatus('Webcam non disponibile: usa il mouse');
        return;
    }
    var self = this;
    var video = this.video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    this.setStatus('In attesa del permesso per la webcam...');
    navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
        .then(function (stream) {
            if (self.dead) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
            self.stream = stream;
            video.srcObject = stream;
            video.onloadedmetadata = function () {
                video.play();
                self.camAspect = (video.videoWidth || 4) / (video.videoHeight || 3);
                self.buildCamTargets();
                if (self.videoTex) self.videoTex.destroy();
                self.videoTex = new pc.Texture(self.device, {
                    width: video.videoWidth, height: video.videoHeight,
                    format: pc.PIXELFORMAT_RGBA8, mipmaps: false,
                    minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
                    addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE
                });
                self.videoTex.setSource(video);
                self.camReady = true;
                self.setStatus('');
                self.attachPreviewVideo();
                // segno quando arriva un frame nuovo della webcam
                if (video.requestVideoFrameCallback) {
                    var last = 0;
                    var cb = function (now) {
                        if (self.dead || !self.stream) return;
                        if (last) self.camInterval = pc.math.clamp((now - last) / 1000, 1 / 120, 1 / 5);
                        last = now;
                        self.camNew = true;
                        video.requestVideoFrameCallback(cb);
                    };
                    video.requestVideoFrameCallback(cb);
                } else {
                    self.useTimeCheck = true;
                }
            };
        })
        .catch(function (err) {
            self.camFailed = true;
            console.warn('[datamosh] webcam non disponibile: ' + err);
            self.setStatus('Webcam non disponibile: usa il mouse');
        });
};

Datamosh.prototype.stopWebcam = function () {
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.stream = null;
    this.camReady = false;
    if (this.video) { this.video.srcObject = null; }
};

// Anteprima della webcam in basso a sinistra (specchiata) + messaggi
Datamosh.prototype.buildPreview = function () {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:10;font-family:Helvetica,Arial,sans-serif;' +
        'font-size:12px;letter-spacing:0.04em;pointer-events:none;';
    this.statusEl = document.createElement('div');
    // testo leggibile sia su sfondo chiaro sia su sfondo scuro
    this.statusEl.style.cssText = 'margin-top:6px;color:#fff;mix-blend-mode:difference;';
    wrap.appendChild(this.statusEl);
    document.body.appendChild(wrap);
    this.previewWrap = wrap;
    this.updatePreview();
};

Datamosh.prototype.attachPreviewVideo = function () {
    if (!this.previewWrap || !this.video) return;
    var v = this.video;
    v.style.cssText = 'display:block;transform:scaleX(-1);opacity:0.85;border:1px solid rgba(128,128,128,0.5);';
    this.previewWrap.insertBefore(v, this.statusEl);
    this.updatePreview();
};

Datamosh.prototype.updatePreview = function () {
    if (!this.video) return;
    this.video.style.width = this.webcam.previewSize + 'px';
    this.video.style.display = this.webcam.showPreview ? 'block' : 'none';
};

Datamosh.prototype.setStatus = function (text) {
    if (this.statusEl) this.statusEl.textContent = text;
};

// ---------- Update ----------

Datamosh.prototype.update = function (dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this.frame++;
    var dev = this.device;
    var W = dev.width, H = dev.height;
    if (W !== this.scrW || H !== this.scrH) this.buildScreenTargets();
    var ms = this.mosh, wc = this.webcam, mo = this.mouse, rv = this.reveal, bl = this.blocks, gr = this.gravity, ed = this.edges;
    var cr = this.effBg[0], cg = this.effBg[1], cb = this.effBg[2];

    // rapporto tra schermo e webcam (la webcam copre lo schermo, come background-size: cover)
    var sA = W / H, cA = this.camAspect;
    var csx = 1, csy = 1;
    if (sA > cA) csy = cA / sA; else csx = sA / cA;

    // ---- 1 + 2: luminanza e vettori di movimento (solo quando arriva un frame nuovo) ----
    var camOn = wc.enabled && this.camReady && this.videoTex;
    var videoTexel = camOn ? [1 / this.video.videoWidth, 1 / this.video.videoHeight] : [1 / 640, 1 / 480];
    if (camOn && this.useTimeCheck && this.video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = this.video.currentTime;
        this.camNew = true;
    }
    if (camOn && this.camNew) {
        this.camNew = false;
        this.videoTex.upload();
        var tmp = this.lumaA; this.lumaA = this.lumaB; this.lumaB = tmp;   // A = nuovo, B = precedente
        this.setU('uVideo', this.videoTex);
        this.setU('uVideoTexel', videoTexel);
        pc.drawQuadWithShader(dev, this.lumaA.rt, this.shLuma);
        this.camFrames++;
        if (this.camFrames > 1) {
            this.setU('uCur', this.lumaA.tex);
            this.setU('uPrev', this.lumaB.tex);
            this.setU('uLumaTexel', [1 / this.lumaW, 1 / this.lumaH]);
            var iv = Math.max(this.camInterval, 1 / 120);
            this.setU('uToScreen', [1 / this.lumaW / csx / iv, 1 / this.lumaH / csy / iv]);
            this.setU('uThresh', wc.threshold);
            pc.drawQuadWithShader(dev, this.motion.rt, this.shMotion);
        }
    }

    // ---- mouse: velocita in uv dello schermo al secondo ----
    var mvx = this.mAccX / Math.max(dt, 1e-4), mvy = this.mAccY / Math.max(dt, 1e-4);
    this.mAccX = this.mAccY = 0;
    var km = 1 - Math.exp(-dt * 20);
    this.mVelX += (mvx - this.mVelX) * km;
    this.mVelY += (mvy - this.mVelY) * km;
    var mouseOn = mo.enabled && this.hasMouse;

    // ---- 3: campo di movimento (+ agitazione e gravita) ----
    var fsrc = this.fieldA, fdst = this.fieldB;
    this.setU('uField', fsrc.tex);
    this.setU('uMotion', this.motion.tex);
    this.setU('uCamK', 1 - Math.exp(-dt / Math.max(ms.inertia, 0.01)));
    this.setU('uCamGain', camOn ? wc.gain : 0);
    this.setU('uMouseUv', [0.5 + (this.mouseU - 0.5) * csx, 0.5 + (this.mouseV - 0.5) * csy]);
    this.setU('uMouseVel', [this.mVelX * mo.gain, this.mVelY * mo.gain]);
    this.setU('uMouseR', mo.radius * csy);
    this.setU('uMouseK', mouseOn ? 1 - Math.exp(-dt * 15) : 0);
    this.setU('uCamAspect', cA);
    this.setU('uGravOn', gr.enabled ? 1 : 0);
    this.setU('uGravAcc', gr.strength * dt);
    this.setU('uGravMax', gr.maxSpeed);
    this.setU('uHoldK', Math.exp(-dt / Math.max(gr.hold, 0.01)));
    this.setU('uTrigger', Math.max(gr.trigger, 0.001));
    this.setU('uAlways', gr.enabled && gr.always ? 1 : 0);
    pc.drawQuadWithShader(dev, fdst.rt, this.shField);
    this.fieldA = fdst; this.fieldB = fsrc;

    // ---- 4: datamosh ----
    var reset = this.needReset;
    this.needReset = false;
    var src = this.moshA, dst = this.moshB;
    var cssScale = W / (this.canvas.clientWidth || W);
    var maxB = Math.max(2, bl.maxSize * cssScale);
    var minB = Math.max(1, Math.min(bl.minSize, bl.maxSize) * cssScale);
    this.bgArr[0] = cr; this.bgArr[1] = cg; this.bgArr[2] = cb;
    var ec = ed.color;
    this.edgeCol[0] = Array.isArray(ec) ? ec[0] : ec.r;
    this.edgeCol[1] = Array.isArray(ec) ? ec[1] : ec.g;
    this.edgeCol[2] = Array.isArray(ec) ? ec[2] : ec.b;
    var ga = (gr.angle || 0) * Math.PI / 180;
    this.gravDir[0] = Math.sin(ga);      // 0 gradi = verso il basso
    this.gravDir[1] = -Math.cos(ga);
    this.setU('uPrev', src.tex);
    this.setU('uField', this.fieldA.tex);
    this.setU('uLogo', this.logoTex);
    this.setU('uVideo', camOn ? this.videoTex : this.logoTex);
    this.setU('uVideoTexel', videoTexel);
    this.setU('uRes', [W, H]);
    this.setU('uCamScale', [csx, csy]);
    this.setU('uBg', this.bgArr);
    this.setU('uGravDir', this.gravDir);
    this.setU('uDisp', dt * ms.strength);
    this.setU('uHeal', reset ? 1 : 1 - Math.exp(-ms.heal * dt));
    this.setU('uRefresh', 1 - Math.exp(-ms.refresh * dt));
    this.setU('uSeed', (this.frame % 997) * 0.731);
    this.setU('uChroma', ms.chroma * cssScale);
    this.setU('uReveal', camOn ? rv.amount * (1 - Math.exp(-dt * 12)) : 0);
    this.setU('uRevealSpeed', rv.speed);
    this.setU('uOnlyLogo', rv.onlyLogo === false ? 0 : 1);
    this.setU('uStyle', Math.round(rv.style === undefined ? 2 : rv.style));
    this.setU('uContrast', Math.min(rv.contrast, 0.98));
    this.setU('uEdgeGain', ed.intensity);
    this.setU('uEdgeGlow', ed.glow);
    this.setU('uEdgeWidth', Math.max(1, ed.width));
    this.setU('uEdgeThresh', ed.threshold);
    this.setU('uEdgeDark', ed.darkness);
    this.setU('uEdgeHeat', ed.heat ? 1 : 0);
    this.setU('uEdgeColor', this.edgeCol);
    this.setU('uMaxB', maxB);
    this.setU('uMinB', minB);
    this.setU('uSplit', bl.split);
    this.setU('uLineP', bl.lineChance);
    this.setU('uLineT', Math.max(1, bl.lineThickness * cssScale));
    this.setU('uLineLen', Math.max(1, bl.lineLength));
    this.setU('uLineV', bl.vertical);
    this.setU('uPattern', bl.changeRate > 0 ? Math.floor(this.time * bl.changeRate) % 1000 : 0);
    pc.drawQuadWithShader(dev, dst.rt, this.shMosh);
    this.moshA = dst; this.moshB = src;

    // ---- 5: uscita ----
    this.outMat.setParameter('uTex', this.moshA.tex);

    // sfondo della camera uguale a quello del logo
    if (this.camera && this.camera.camera) {
        var cc = this.camera.camera.clearColor;
        if (cc.r !== cr || cc.g !== cg || cc.b !== cb) this.camera.camera.clearColor = new pc.Color(cr, cg, cb, 1);
    }
};
