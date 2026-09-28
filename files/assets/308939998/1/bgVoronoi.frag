// bgVoronoi.frag
// Linee e puntini a colore pieno con bordi antialias. Tutto flat.
// Tipo 2 = "vetro": pezzo di cella che mostra il logo; vLocal e' la posizione
// (in pixel) da cui leggere il logo, gia spostata dalla rifrazione della cella.

uniform vec3  uLineColor;
uniform vec3  uDotColor;
uniform float uHalfThickness;  // meta spessore linea (px)
uniform float uDotRadius;      // raggio puntino (px)
uniform float uLineOpacity;

uniform sampler2D uLogo;
uniform vec4  uLogoRect;       // x, y (angolo in basso a sinistra, px), larghezza, altezza
uniform float uLogoOpacity;

varying vec2  vLocal;
varying float vType;

void main(void) {
    float alpha;
    vec3 col;
    if (vType < 0.5) {
        alpha = (1.0 - smoothstep(uHalfThickness - 0.5, uHalfThickness + 0.5, abs(vLocal.y))) * uLineOpacity;
        col = uLineColor;
    } else if (vType < 1.5) {
        alpha = 1.0 - smoothstep(uDotRadius - 0.75, uDotRadius + 0.75, length(vLocal));
        col = uDotColor;
    } else {
        vec2 uv = (vLocal - uLogoRect.xy) / uLogoRect.zw;
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
        vec4 c = texture2D(uLogo, vec2(uv.x, 1.0 - uv.y));
        alpha = c.a * uLogoOpacity;
        col = c.rgb;
    }
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col, alpha);
}
