// plexus.js
// Da mettere sull'entità padre dei cubi, insieme a cubeRepel.
// Disegna linee tra i cubi che si stanno spostando:
// più i cubi sono spinti e vicini, più la linea è forte.
// Le linee sono nastri rivolti verso la camera, così hanno uno spessore reale.
//
// Modalità:
//  - Solido:   colore pieno e coprente, la dissolvenza è fatta con l'opacità
//  - Additivo: la linea si somma allo sfondo (effetto luce/neon, ma sbiadisce su fondi chiari)
var Plexus = pc.createScript('plexus');

Plexus.attributes.add('mode', {
    type: 'number', default: 0, title: 'Modalita',
    enum: [{ 'Solido': 0 }, { 'Additivo': 1 }]
});
Plexus.attributes.add('lineColor', { type: 'rgb', default: [0.6, 0.15, 1], title: 'Colore linee' });
Plexus.attributes.add('intensity', { type: 'number', default: 1, min: 0, max: 10, title: 'Intensita' });
Plexus.attributes.add('lineWidth', { type: 'number', default: 0.05, min: 0.001, max: 1, title: 'Spessore linee' });
Plexus.attributes.add('maxDistance', { type: 'number', default: 5, min: 0.1, title: 'Distanza max collegamento' });
Plexus.attributes.add('fadePower', { type: 'number', default: 0.35, min: 0.05, max: 3, title: 'Curva dissolvenza (basso = piu pieno)' });
Plexus.attributes.add('threshold', { type: 'number', default: 0.03, min: 0, max: 1, title: 'Soglia attivazione' });
Plexus.attributes.add('maxLines', { type: 'number', default: 600, min: 10, max: 5000, title: 'Linee max' });
Plexus.attributes.add('depthTest', { type: 'boolean', default: true, title: 'Nascoste dai cubi' });

Plexus.prototype.initialize = function () {
    this.maxLinesInt = Math.floor(this.maxLines);
    var nVerts = this.maxLinesInt * 4;
    this.positions = new Float32Array(nVerts * 3);
    this.colors = new Uint8Array(nVerts * 4);

    // Indici fissi: 2 triangoli per nastro
    var indices = new Uint16Array(this.maxLinesInt * 6);
    for (var i = 0; i < this.maxLinesInt; i++) {
        var v = i * 4, o = i * 6;
        indices[o] = v; indices[o + 1] = v + 1; indices[o + 2] = v + 2;
        indices[o + 3] = v + 2; indices[o + 4] = v + 1; indices[o + 5] = v + 3;
    }

    // Materiale senza luci: il colore arriva tutto dall'emissive
    var mat = new pc.StandardMaterial();
    mat.useLighting = false;
    mat.useSkybox = false;
    mat.useFog = false;
    mat.diffuse.set(0, 0, 0);
    mat.emissiveVertexColor = true;
    mat.emissiveVertexColorChannel = 'rgb';
    mat.opacityVertexColor = true;
    mat.opacityVertexColorChannel = 'a';
    mat.depthWrite = false;
    mat.cull = pc.CULLFACE_NONE;
    this.material = mat;
    this.updateMaterial();

    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(this.positions);
    mesh.setColors32(this.colors);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    mesh.primitive[0].count = 0;
    this.mesh = mesh;

    var mi = new pc.MeshInstance(mesh, mat);
    mi.cull = false;

    // Entità nello spazio mondo (non sotto il padre ruotato dei cubi)
    this.linesEntity = new pc.Entity('PlexusLines');
    this.linesEntity.addComponent('render', {
        meshInstances: [mi],
        castShadows: false,
        receiveShadows: false
    });
    this.app.root.addChild(this.linesEntity);

    this.on('attr:mode', this.updateMaterial, this);
    this.on('attr:lineColor', this.updateMaterial, this);
    this.on('attr:intensity', this.updateMaterial, this);
    this.on('attr:depthTest', this.updateMaterial, this);

    this.active = [];
    this.seg = new pc.Vec3();
    this.toCam = new pc.Vec3();
    this.side = new pc.Vec3();

    this.on('destroy', function () {
        this.linesEntity.destroy();
    }, this);
};

Plexus.prototype.updateMaterial = function () {
    var mat = this.material;
    mat.emissive.copy(this.lineColor);
    mat.emissiveIntensity = this.intensity;
    mat.blendType = this.mode === 1 ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;
    mat.depthTest = this.depthTest;
    mat.update();
};

// postUpdate: le posizioni dei cubi sono già state aggiornate da cubeRepel
Plexus.prototype.postUpdate = function () {
    var repel = this.entity.script && this.entity.script.cubeRepel;
    if (!repel || !repel.cubes || !repel.camera) return;

    var cubes = repel.cubes;
    var push = Math.max(repel.push, 0.0001);
    var camPos = repel.camera.getPosition();
    var additive = this.mode === 1;

    // Cubi attivi (spinti oltre la soglia)
    var active = this.active;
    active.length = 0;
    for (var i = 0; i < cubes.length; i++) {
        var a = pc.math.clamp(cubes[i].amount / push, 0, 1);
        if (a > this.threshold) {
            active.push({ pos: cubes[i].entity.getPosition(), a: a });
        }
    }

    var maxD = this.maxDistance;
    var maxD2 = maxD * maxD;
    var halfW = this.lineWidth * 0.5;
    var p = this.positions;
    var c = this.colors;
    var seg = this.seg, toCam = this.toCam, side = this.side;
    var n = 0;

    for (var j = 0; j < active.length && n < this.maxLinesInt; j++) {
        var A = active[j];
        for (var k = j + 1; k < active.length && n < this.maxLinesInt; k++) {
            var B = active[k];
            seg.sub2(B.pos, A.pos);
            var d2 = seg.lengthSq();
            if (d2 > maxD2 || d2 < 1e-6) continue;

            // Forza della linea: attività dei due cubi x vicinanza,
            // poi la curva la "riempie" (fadePower < 1 = più piena)
            var near = 1 - Math.sqrt(d2) / maxD;
            var w = Math.pow(pc.math.clamp(Math.min(A.a, B.a) * near, 0, 1), this.fadePower);
            var v = Math.round(w * 255);
            if (v < 2) continue;

            // Lato del nastro perpendicolare al segmento e alla direzione della camera
            toCam.set(
                camPos.x - (A.pos.x + B.pos.x) * 0.5,
                camPos.y - (A.pos.y + B.pos.y) * 0.5,
                camPos.z - (A.pos.z + B.pos.z) * 0.5
            );
            side.cross(seg, toCam);
            var sl = side.length();
            if (sl < 1e-6) continue;
            side.mulScalar(halfW / sl);

            var o = n * 12;
            p[o]      = A.pos.x - side.x; p[o + 1]  = A.pos.y - side.y; p[o + 2]  = A.pos.z - side.z;
            p[o + 3]  = A.pos.x + side.x; p[o + 4]  = A.pos.y + side.y; p[o + 5]  = A.pos.z + side.z;
            p[o + 6]  = B.pos.x - side.x; p[o + 7]  = B.pos.y - side.y; p[o + 8]  = B.pos.z - side.z;
            p[o + 9]  = B.pos.x + side.x; p[o + 10] = B.pos.y + side.y; p[o + 11] = B.pos.z + side.z;

            // Solido: colore pieno, dissolvenza nell'alpha
            // Additivo: alpha pieno, dissolvenza scurendo il colore
            var rgb = additive ? v : 255;
            var alpha = additive ? 255 : v;
            var q = n * 16;
            for (var t = 0; t < 4; t++) {
                c[q + t * 4] = rgb; c[q + t * 4 + 1] = rgb; c[q + t * 4 + 2] = rgb; c[q + t * 4 + 3] = alpha;
            }
            n++;
        }
    }

    if (n > 0 || this.lastCount > 0) {
        this.mesh.setPositions(p);
        this.mesh.setColors32(c);
        this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
        this.mesh.primitive[0].count = n * 6;
    }
    this.lastCount = n;
};
