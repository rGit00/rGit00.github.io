// bgVoronoi.vert
// Segmenti del Voronoi e puntini, gia calcolati in pixel dallo script.
// aPosition.xy = posizione del vertice in pixel (origine in basso a sinistra)
// aPosition.z  = tipo: 0 = linea, 1 = puntino
// aLocal       = coordinate locali in pixel (per l'antialias dei bordi)

attribute vec3 aPosition;
attribute vec2 aLocal;

uniform vec2 uResolution;

varying vec2  vLocal;
varying float vType;

void main(void) {
    vLocal = aLocal;
    vType = aPosition.z;
    gl_Position = vec4(aPosition.xy / uResolution * 2.0 - 1.0, 0.0, 1.0);
}
