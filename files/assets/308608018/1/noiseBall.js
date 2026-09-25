// noiseBall.js
// Crea una sfera ad alta risoluzione con uno shader GLSL custom.
// I vertici si alzano a "montagnette" (solo verso l'esterno) su un noise 4D
// che aumenta sotto il mouse e decade con un'influenza regolabile;
// la zona toccata si colora e mostra il wireframe.
// Trascinamento elastico: clicca e trascina un punto della palla per tirarlo;
// al rilascio (o oltre la distanza di rottura) torna al suo posto rimbalzando.
// Gli shader sono negli asset noiseBall.vert / noiseBall.frag (cartella shaders).
var NoiseBall = pc.createScript('noiseBall');

NoiseBall.attributes.add('vertexShader', { type: 'asset', assetType: 'shader', title: 'Vertex shader' });
NoiseBall.attributes.add('fragmentShader', { type: 'asset', assetType: 'shader', title: 'Fragment shader' });
NoiseBall.attributes.add('cameraEntity', { type: 'entity', title: 'Camera' });

NoiseBall.attributes.add('sphere', {
    type: 'json', title: 'Sfera',
    schema: [
        { name: 'radius', type: 'number', default: 3, min: 0.1, max: 20, precision: 2, title: 'Raggio' },
        { name: 'segments', type: 'number', default: 160, min: 16, max: 300, precision: 0, step: 1, title: 'Risoluzione (segmenti)' }
    ]
});

NoiseBall.attributes.add('noise', {
    type: 'json', title: 'Noise',
    schema: [
        { name: 'baseAmp', type: 'number', default: 0.06, min: 0, max: 2, precision: 3, title: 'Ampiezza base (sempre)' },
        { name: 'baseScale', type: 'number', default: 1.5, min: 0.01, max: 20, precision: 2, title: 'Scala noise base' },
        { name: 'mouseAmp', type: 'number', default: 0.9, min: 0, max: 5, precision: 3, title: 'Ampiezza sotto il mouse' },
        { name: 'mouseScale', type: 'number', default: 4, min: 0.01, max: 30, precision: 2, title: 'Scala noise mouse' },
        { name: 'peak', type: 'number', default: 1.5, min: 0.2, max: 8, precision: 2, title: 'Forma montagne (alto = punte)' },
        { name: 'speed', type: 'number', default: 0.5, min: 0, max: 5, precision: 2, title: 'Tempo (velocita)' }
    ]
});

NoiseBall.attributes.add('influence', {
    type: 'json', title: 'Influenza mouse',
    schema: [
        { name: 'radius', type: 'number', default: 0.7, min: 0.01, max: 2, precision: 2, title: 'Raggio influenza' },
        { name: 'falloff', type: 'number', default: 1.5, min: 0.1, max: 8, precision: 2, title: 'Decadimento (alto = piu stretto)' },
        { name: 'follow', type: 'number', default: 10, min: 0.5, max: 60, precision: 1, title: 'Velocita inseguimento' },
        { name: 'fadeIn', type: 'number', default: 6, min: 0.1, max: 30, precision: 1, title: 'Velocita attivazione' },
        { name: 'fadeOut', type: 'number', default: 2, min: 0.1, max: 30, precision: 1, title: 'Velocita spegnimento' }
    ]
});

NoiseBall.attributes.add('elastic', {
    type: 'json', title: 'Trascinamento elastico',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'grabRadius', type: 'number', default: 0.9, min: 0.05, max: 2, precision: 2, title: 'Area tirata (raggio)' },
        { name: 'grabFalloff', type: 'number', default: 1.6, min: 0.2, max: 8, precision: 2, title: 'Forma del tiro (alto = punta)' },
        { name: 'maxPull', type: 'number', default: 4, min: 0.2, max: 20, precision: 2, title: 'Distanza di rottura' },
        { name: 'dragStiffness', type: 'number', default: 250, min: 5, max: 2000, precision: 0, title: 'Reattivita durante il tiro' },
        { name: 'stiffness', type: 'number', default: 70, min: 1, max: 1000, precision: 0, title: 'Rigidita ritorno' },
        { name: 'bounce', type: 'number', default: 0.82, min: 0, max: 0.98, precision: 2, title: 'Rimbalzo (0-1)' },
        { name: 'jiggle', type: 'number', default: 0.02, min: 0, max: 0.3, precision: 3, title: 'Onda di rimbalzo' },
        { name: 'rippleFreq', type: 'number', default: 7, min: 0, max: 40, precision: 1, title: 'Frequenza onda' },
        { name: 'rippleSpeed', type: 'number', default: 14, min: 0, max: 60, precision: 1, title: 'Velocita onda' },
        { name: 'stretchColor', type: 'rgb', default: [1, 0.35, 0.1], title: 'Colore stiramento' },
        { name: 'stretchIntensity', type: 'number', default: 3, min: 0, max: 20, precision: 2, title: 'Intensita colore stiramento' },
        { name: 'stretchRange', type: 'number', default: 2.5, min: 0.1, max: 20, precision: 2, title: 'Tiro per colore pieno' }
    ]
});

NoiseBall.attributes.add('look', {
    type: 'json', title: 'Colori',
    schema: [
        { name: 'baseColor', type: 'rgb', default: [0.08, 0.08, 0.12], title: 'Colore base' },
        { name: 'hotColorA', type: 'rgb', default: [1, 0.15, 0.55], title: 'Colore mouse A' },
        { name: 'hotColorB', type: 'rgb', default: [0.2, 0.55, 1], title: 'Colore mouse B' },
        { name: 'hotIntensity', type: 'number', default: 3, min: 0, max: 20, precision: 2, title: 'Intensita colore mouse' },
        { name: 'rimColor', type: 'rgb', default: [0.45, 0.2, 1], title: 'Colore rim' },
        { name: 'rimPower', type: 'number', default: 3, min: 0.1, max: 10, precision: 2, title: 'Rim: larghezza (alto = piu sottile)' },
        { name: 'rimIntensity', type: 'number', default: 1, min: 0, max: 10, precision: 2, title: 'Rim: intensita' },
        { name: 'specular', type: 'number', default: 0.4, min: 0, max: 5, precision: 2, title: 'Speculare' },
        { name: 'glossiness', type: 'number', default: 48, min: 1, max: 256, precision: 0, title: 'Lucidita' },
        { name: 'lightDir', type: 'vec3', default: [0.5, 0.8, 0.6], title: 'Direzione luce' }
    ]
});

NoiseBall.attributes.add('fillLight', {
    type: 'json', title: 'Luce dal basso (fill)',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attiva' },
        { name: 'color', type: 'rgb', default: [0.35, 0.55, 1], title: 'Colore' },
        { name: 'intensity', type: 'number', default: 0.6, min: 0, max: 10, precision: 2, title: 'Intensita' },
        { name: 'direction', type: 'vec3', default: [-0.6, -0.8, 0.4], title: 'Direzione (verso la luce)' },
        { name: 'softness', type: 'number', default: 1.5, min: 0.2, max: 10, precision: 2, title: 'Concentrazione (alto = macchia piu stretta)' },
        { name: 'specular', type: 'number', default: 0.3, min: 0, max: 5, precision: 2, title: 'Riflesso' }
    ]
});

NoiseBall.attributes.add('wire', {
    type: 'json', title: 'Wireframe',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'color', type: 'rgb', default: [0.6, 0.9, 1], title: 'Colore linee' },
        { name: 'intensity', type: 'number', default: 3, min: 0, max: 20, precision: 2, title: 'Intensita linee' },
        { name: 'width', type: 'number', default: 1.2, min: 0.2, max: 6, precision: 2, title: 'Spessore linee (px)' },
        { name: 'start', type: 'number', default: 0.1, min: 0, max: 1, precision: 2, title: 'Inizio zona (influenza minima)' },
        { name: 'softness', type: 'number', default: 0.3, min: 0.01, max: 1, precision: 2, title: 'Sfumatura bordo zona' },
        { name: 'fill', type: 'number', default: 0.25, min: 0, max: 1, precision: 2, title: 'Riempimento facce (0 = nere)' },
        { name: 'cutout', type: 'boolean', default: false, title: 'Buca le facce (vedi attraverso)' },
        { name: 'hideDiagonals', type: 'boolean', default: true, title: 'Griglia a quadrati' }
    ]
});

NoiseBall.prototype.initialize = function () {
    this.camera = this.cameraEntity || this.app.root.findComponent('camera').entity;
    this.time = 0;

    this.mouseX = 0;
    this.mouseY = 0;
    this.hasMouse = false;
    this.mouseDir = new pc.Vec3(0, 0, 1);     // punto (direzione) sulla sfera, spazio oggetto
    this.targetDir = new pc.Vec3(0, 0, 1);
    this.hitWorld = new pc.Vec3();
    this.active = 0;

    // Stato del trascinamento elastico
    this.grabbed = false;
    this.grabDir = new pc.Vec3(0, 0, 1);      // punto afferrato (spazio oggetto)
    this.grabWorld = new pc.Vec3();           // punto afferrato (mondo), origine del piano di trascinamento
    this.planeNormal = new pc.Vec3();
    this.pullTarget = new pc.Vec3();          // trazione desiderata (spazio oggetto)
    this.pull = new pc.Vec3();                // trazione attuale (molla)
    this.pullVel = new pc.Vec3();
    this.jiggle = 0;

    this.rayStart = new pc.Vec3();
    this.rayEnd = new pc.Vec3();
    this.rayDir = new pc.Vec3();
    this.tmp = new pc.Vec3();
    this.tmp2 = new pc.Vec3();
    this.invWorld = new pc.Mat4();
    this.uniforms3 = {};                        // un array per ogni uniform vec3

    this.buildMesh();
    this.buildMaterial();

    this.meshInstance = new pc.MeshInstance(this.mesh, this.material);
    this.meshInstance.cull = false;   // i vertici si spostano nello shader
    this.entity.addComponent('render', {
        meshInstances: [this.meshInstance],
        castShadows: false,
        receiveShadows: false
    });

    // Ricostruzioni quando cambiano i parametri
    this.on('attr:sphere', function () {
        this.buildMesh();
        this.meshInstance.mesh = this.mesh;
    }, this);
    this.on('attr:vertexShader', this.rebuildMaterial, this);
    this.on('attr:fragmentShader', this.rebuildMaterial, this);
    this.watchShader(this.vertexShader);
    this.watchShader(this.fragmentShader);

    // Mouse / touch
    var self = this;
    var canvas = this.app.graphicsDevice.canvas;
    this.canvas = canvas;
    this.onMove = function (e) {
        var p = e.touches ? e.touches[0] : e;
        if (!p) return;
        var rect = canvas.getBoundingClientRect();
        var x = p.clientX - rect.left;
        var y = p.clientY - rect.top;
        self.mouseX = x;
        self.mouseY = y;
        self.hasMouse = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
        if (self.grabbed) self.updateDrag();
    };
    this.onDown = function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        self.onMove(e);
        self.startDrag();
    };
    this.onUp = function () { self.releaseDrag(); };
    this.onOut = function (e) { if (!e.relatedTarget) self.hasMouse = false; };
    this.onTouchEnd = function (e) {
        if (!e.touches || !e.touches.length) {
            self.hasMouse = false;
            self.releaseDrag();
        }
    };
    window.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('touchstart', this.onMove, { passive: true });
    window.addEventListener('touchmove', this.onMove, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd);
    document.addEventListener('mouseout', this.onOut);

    this.on('destroy', function () {
        window.removeEventListener('pointermove', this.onMove);
        canvas.removeEventListener('pointerdown', this.onDown);
        window.removeEventListener('pointerup', this.onUp);
        window.removeEventListener('pointercancel', this.onUp);
        window.removeEventListener('touchstart', this.onMove);
        window.removeEventListener('touchmove', this.onMove);
        window.removeEventListener('touchend', this.onTouchEnd);
        document.removeEventListener('mouseout', this.onOut);
        if (this.mesh) this.mesh.destroy();
        if (this.material) this.material.destroy();
    }, this);
};

// ---------- Costruzione ----------

// Sfera a griglia lat/long, senza indici: ogni triangolo ha i suoi 3 vertici
// con coordinate baricentriche, così il fragment shader può disegnare il wireframe.
// Per ogni quadrato (a, b, c, d) la diagonale b-c ha la coordinata z = 0:
// ignorando z nello shader la griglia appare a quadrati.
// I triangoli sono in senso antiorario visti da fuori (faccia frontale verso l'esterno).
NoiseBall.prototype.buildMesh = function () {
    var seg = Math.round(pc.math.clamp(this.sphere.segments, 16, 300));
    var R = this.sphere.radius;
    var latN = seg, lonN = seg;

    // Griglia di punti
    var grid = [];
    for (var i = 0; i <= latN; i++) {
        var theta = i * Math.PI / latN;
        var st = Math.sin(theta), ct = Math.cos(theta);
        for (var j = 0; j <= lonN; j++) {
            var phi = j * 2 * Math.PI / lonN;
            grid.push([st * Math.cos(phi), ct, st * Math.sin(phi)]);
        }
    }

    var numTris = latN * lonN * 2;
    var positions = new Float32Array(numTris * 9);
    var normals = new Float32Array(numTris * 9);
    var bary = new Float32Array(numTris * 9);
    var v = 0;

    function put(p, bx, by, bz) {
        var o = v * 3;
        normals[o] = p[0]; normals[o + 1] = p[1]; normals[o + 2] = p[2];
        positions[o] = p[0] * R; positions[o + 1] = p[1] * R; positions[o + 2] = p[2] * R;
        bary[o] = bx; bary[o + 1] = by; bary[o + 2] = bz;
        v++;
    }

    for (var la = 0; la < latN; la++) {
        for (var lo = 0; lo < lonN; lo++) {
            var a = grid[la * (lonN + 1) + lo];
            var b = grid[la * (lonN + 1) + lo + 1];
            var c = grid[(la + 1) * (lonN + 1) + lo];
            var d = grid[(la + 1) * (lonN + 1) + lo + 1];
            // Triangolo 1: a, b, c  (a opposto alla diagonale b-c)
            put(a, 0, 0, 1); put(b, 0, 1, 0); put(c, 1, 0, 0);
            // Triangolo 2: b, d, c  (d opposto alla diagonale b-c)
            put(b, 1, 0, 0); put(d, 0, 0, 1); put(c, 0, 1, 0);
        }
    }

    var old = this.mesh;
    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setVertexStream(pc.SEMANTIC_TEXCOORD1, bary, 3);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    this.mesh = mesh;
    if (old) old.destroy();
};

NoiseBall.prototype.getShaderText = function (asset) {
    return asset && asset.resource ? asset.resource : null;
};

NoiseBall.prototype.buildMaterial = function () {
    var vs = this.getShaderText(this.vertexShader);
    var fs = this.getShaderText(this.fragmentShader);
    if (!vs || !fs) {
        console.error('[noiseBall] assegna gli asset noiseBall.vert e noiseBall.frag');
        return;
    }
    this.shaderVersion = (this.shaderVersion || 0) + 1;
    this.material = new pc.ShaderMaterial({
        uniqueName: 'noiseBall_' + this.entity.guid + '_' + this.shaderVersion,
        vertexGLSL: vs,
        fragmentGLSL: fs,
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aNormal: pc.SEMANTIC_NORMAL,
            aBary: pc.SEMANTIC_TEXCOORD1
        }
    });
    // Nessun culling: con "Buca le facce" si vede l'interno della palla
    this.material.cull = pc.CULLFACE_NONE;
    this.material.update();
};

NoiseBall.prototype.rebuildMaterial = function () {
    var old = this.material;
    this.buildMaterial();
    if (this.meshInstance && this.material) this.meshInstance.material = this.material;
    if (old && old !== this.material) old.destroy();
};

// Se modifichi il codice GLSL dall'editor, lo shader si ricarica da solo
NoiseBall.prototype.watchShader = function (asset) {
    if (!asset) return;
    asset.on('load', this.rebuildMaterial, this);
    asset.on('change', function () { this.app.assets.load(asset); }, this);
};

// ---------- Mouse ----------

NoiseBall.prototype.computeRay = function () {
    var cam = this.camera.camera;
    cam.screenToWorld(this.mouseX, this.mouseY, cam.nearClip, this.rayStart);
    cam.screenToWorld(this.mouseX, this.mouseY, cam.farClip, this.rayEnd);
    this.rayDir.sub2(this.rayEnd, this.rayStart).normalize();
};

// Ritorna true se il mouse colpisce la sfera; scrive la direzione in targetDir
// e il punto colpito (mondo) in hitWorld
NoiseBall.prototype.pickSphere = function () {
    this.computeRay();

    var center = this.entity.getPosition();
    var R = this.sphere.radius * this.entity.getScale().x;

    var oc = this.tmp.sub2(this.rayStart, center);
    var b = oc.dot(this.rayDir);
    var c = oc.lengthSq() - R * R;
    var disc = b * b - c;
    if (disc < 0) return false;

    var t = -b - Math.sqrt(disc);
    if (t < 0) t = -b + Math.sqrt(disc);
    if (t < 0) return false;

    // Punto colpito -> spazio oggetto -> direzione
    this.hitWorld.copy(this.rayDir).mulScalar(t).add(this.rayStart);
    this.invWorld.copy(this.entity.getWorldTransform()).invert();
    this.invWorld.transformPoint(this.hitWorld, this.targetDir);
    this.targetDir.normalize();
    return true;
};

// ---------- Trascinamento elastico ----------

NoiseBall.prototype.startDrag = function () {
    if (!this.elastic.enabled || !this.camera || !this.pickSphere()) return;
    this.grabbed = true;
    this.grabDir.copy(this.targetDir);
    this.grabWorld.copy(this.hitWorld);
    // Piano di trascinamento: passa per il punto afferrato, rivolto verso la camera
    this.planeNormal.copy(this.camera.forward).mulScalar(-1);
    // Si riparte da zero: il nuovo punto afferrato non eredita il tiro precedente
    this.pull.set(0, 0, 0);
    this.pullVel.set(0, 0, 0);
    this.pullTarget.set(0, 0, 0);
    this.canvas.style.cursor = 'grabbing';
};

NoiseBall.prototype.updateDrag = function () {
    this.computeRay();
    var denom = this.rayDir.dot(this.planeNormal);
    if (Math.abs(denom) < 1e-5) return;
    this.tmp.sub2(this.grabWorld, this.rayStart);
    var t = this.tmp.dot(this.planeNormal) / denom;
    // Punto sul piano -> vettore di trazione (mondo)
    this.tmp2.copy(this.rayDir).mulScalar(t).add(this.rayStart).sub(this.grabWorld);

    // Oltre la distanza di rottura il mouse si "stacca" e la palla rimbalza
    if (this.tmp2.length() > this.elastic.maxPull) {
        this.releaseDrag();
        return;
    }

    // Trazione in spazio oggetto
    this.invWorld.copy(this.entity.getWorldTransform()).invert();
    this.invWorld.transformVector(this.tmp2, this.pullTarget);
};

NoiseBall.prototype.releaseDrag = function () {
    if (!this.grabbed) return;
    this.grabbed = false;
    this.pullTarget.set(0, 0, 0);
    this.canvas.style.cursor = '';
};

NoiseBall.prototype.updateSpring = function (dt) {
    var el = this.elastic;
    var k = this.grabbed ? el.dragStiffness : el.stiffness;
    // Durante il tiro smorzamento critico (segue il mouse senza oscillare),
    // al rilascio smorzamento ridotto = rimbalzo
    var c = 2 * Math.sqrt(k) * (this.grabbed ? 1 : (1 - el.bounce));

    var steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    var h = dt / steps;
    var p = this.pull, v = this.pullVel, tg = this.pullTarget;
    for (var s = 0; s < steps; s++) {
        v.x += (k * (tg.x - p.x) - c * v.x) * h;
        v.y += (k * (tg.y - p.y) - c * v.y) * h;
        v.z += (k * (tg.z - p.z) - c * v.z) * h;
        p.x += v.x * h;
        p.y += v.y * h;
        p.z += v.z * h;
    }

    // L'onda di rimbalzo segue la velocita della molla (solo dopo il rilascio)
    var target = this.grabbed ? 0 : Math.min(v.length() * el.jiggle, 0.5);
    this.jiggle += (target - this.jiggle) * (1 - Math.exp(-10 * dt));
};

// ---------- Update ----------

// Accetta pc.Vec3, pc.Color o array [x, y, z]
NoiseBall.prototype.setVec3 = function (name, v) {
    var a = this.uniforms3[name] || (this.uniforms3[name] = new Float32Array(3));
    if (Array.isArray(v)) {
        a[0] = v[0]; a[1] = v[1]; a[2] = v[2];
    } else if (v.x !== undefined) {
        a[0] = v.x; a[1] = v.y; a[2] = v.z;
    } else {
        a[0] = v.r; a[1] = v.g; a[2] = v.b;
    }
    this.material.setParameter(name, a);
};

NoiseBall.prototype.update = function (dt) {
    if (!this.material) return;
    this.time += dt;

    var inf = this.influence;
    var hit = this.hasMouse && this.camera && this.pickSphere();

    // Il punto insegue il mouse in modo morbido (sulla sfera)
    if (hit) {
        var kf = 1 - Math.exp(-inf.follow * dt);
        this.mouseDir.lerp(this.mouseDir, this.targetDir, kf).normalize();
    }
    var target = (hit || this.grabbed) ? 1 : 0;
    var speed = target > this.active ? inf.fadeIn : inf.fadeOut;
    this.active += (target - this.active) * (1 - Math.exp(-speed * dt));

    this.updateSpring(dt);

    var m = this.material;
    var n = this.noise;
    var look = this.look;
    var fl = this.fillLight;
    var w = this.wire;
    var el = this.elastic;

    m.setParameter('uTime', this.time);
    this.setVec3('uMouse', this.mouseDir);
    m.setParameter('uMouseActive', this.active);
    m.setParameter('uInflRadius', inf.radius);
    m.setParameter('uInflFalloff', inf.falloff);
    m.setParameter('uBaseAmp', n.baseAmp);
    m.setParameter('uNoiseScale', n.baseScale);
    m.setParameter('uMouseAmp', n.mouseAmp);
    m.setParameter('uMouseNoiseScale', n.mouseScale);
    m.setParameter('uPeak', n.peak);
    m.setParameter('uNoiseSpeed', n.speed);

    this.setVec3('uGrabDir', this.grabDir);
    this.setVec3('uPull', this.pull);
    m.setParameter('uGrabRadius', el.grabRadius);
    m.setParameter('uGrabFalloff', el.grabFalloff);
    m.setParameter('uJiggle', el.enabled ? this.jiggle : 0);
    m.setParameter('uRippleFreq', el.rippleFreq);
    m.setParameter('uRippleSpeed', el.rippleSpeed);
    this.setVec3('uStretchColor', el.stretchColor);
    m.setParameter('uStretchIntensity', el.stretchIntensity);
    m.setParameter('uStretchRange', el.stretchRange);

    this.setVec3('uBaseColor', look.baseColor);
    this.setVec3('uHotColorA', look.hotColorA);
    this.setVec3('uHotColorB', look.hotColorB);
    m.setParameter('uHotIntensity', look.hotIntensity);
    this.setVec3('uRimColor', look.rimColor);
    m.setParameter('uRimPower', look.rimPower);
    m.setParameter('uRimIntensity', look.rimIntensity);
    m.setParameter('uSpecular', look.specular);
    m.setParameter('uGlossiness', look.glossiness);
    this.setVec3('uLightDir', look.lightDir);

    this.setVec3('uFillDir', fl.direction);
    this.setVec3('uFillColor', fl.color);
    m.setParameter('uFillIntensity', fl.enabled ? fl.intensity : 0);
    m.setParameter('uFillSoftness', fl.softness);
    m.setParameter('uFillSpecular', fl.specular);

    m.setParameter('uWireEnabled', w.enabled ? 1 : 0);
    this.setVec3('uWireColor', w.color);
    m.setParameter('uWireIntensity', w.intensity);
    m.setParameter('uWireWidth', w.width);
    m.setParameter('uWireStart', w.start);
    m.setParameter('uWireSoftness', w.softness);
    m.setParameter('uWireFill', w.fill);
    m.setParameter('uWireCutout', w.cutout ? 1 : 0);
    m.setParameter('uHideDiagonals', w.hideDiagonals ? 1 : 0);
};
