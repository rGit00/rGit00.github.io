// logoParticles.vert
// Ogni particella e' un punto (gl_Points) con dimensione in prospettiva.
// Il fragment shader lo disegna come una pallina illuminata.

attribute vec3 aPosition;
attribute vec3 aData;          // x = tono (0..1), y = calore (0..1), z = moltiplicatore dimensione

uniform mat4 matrix_viewProjection;
uniform mat4 matrix_view;
uniform float uSize;           // raggio della pallina in unita mondo
uniform float uProjScale;      // proiezione[1][1] della camera
uniform float uViewportHeight; // altezza del render target in pixel

varying float vTone;
varying float vHeat;

void main(void) {
    vec4 viewPos = matrix_view * vec4(aPosition, 1.0);
    gl_Position = matrix_viewProjection * vec4(aPosition, 1.0);

    // Diametro in pixel = 2 * raggio proiettato
    float radius = uSize * aData.z;
    gl_PointSize = max(1.0, 2.0 * radius * uProjScale * uViewportHeight * 0.5 / max(-viewPos.z, 0.001));

    vTone = aData.x;
    vHeat = aData.y;
}
