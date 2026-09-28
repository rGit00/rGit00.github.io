// bgLines.frag
// Colore pieno con bordi antialias di 1 pixel. Tutto flat.

uniform vec3  uColor;
uniform float uOpacity;
uniform float uLength;
uniform float uThickness;

varying vec2 vLocal;

void main(void) {
    float halfL = uLength * 0.5;
    float halfT = uThickness * 0.5;
    float a = 1.0 - smoothstep(halfT - 0.5, halfT + 0.5, abs(vLocal.y));
    float b = 1.0 - smoothstep(halfL - 0.5, halfL + 0.5, abs(vLocal.x));
    float alpha = a * b * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
}
