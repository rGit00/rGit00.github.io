// bgLines.vert
// Ogni lineetta e' un rettangolo (4 vertici) disegnato direttamente in pixel dello schermo.
// aPosition.xy = centro della linea in pixel (origine in basso a sinistra)
// aCorner.x = -1..1 lungo la linea, aCorner.y = -1..1 attraverso la linea
// aAngle = rotazione della linea in radianti (antiorario)

attribute vec3 aPosition;
attribute vec2 aCorner;
attribute float aAngle;

uniform vec2  uResolution;     // dimensione del canvas in pixel
uniform float uLength;         // lunghezza linea in pixel
uniform float uThickness;      // spessore linea in pixel

varying vec2 vLocal;           // coordinate in pixel dentro la linea (lungo, attraverso)

void main(void) {
    vec2 d = vec2(cos(aAngle), sin(aAngle));
    vec2 n = vec2(-d.y, d.x);

    // 1 pixel di margine per l'antialias dei bordi
    float halfL = uLength * 0.5 + 1.0;
    float halfT = uThickness * 0.5 + 1.0;
    vec2 local = vec2(aCorner.x * halfL, aCorner.y * halfT);

    vec2 p = aPosition.xy + d * local.x + n * local.y;
    vLocal = local;

    gl_Position = vec4(p / uResolution * 2.0 - 1.0, 0.0, 1.0);
}
