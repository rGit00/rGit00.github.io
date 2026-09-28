// bgLines.js
// Sfondo flat di lineette orizzontali disposte a griglia su tutto il canvas.
// Passando col mouse le lineette ruotano in senso antiorario fino a 90 gradi,
// con una sfumatura intorno al cursore. Dove il mouse e' passato restano girate
// (scia); ogni lineetta ha il suo timer: dopo "Attesa prima del ritorno" dall'ultimo
// passaggio del mouse torna orizzontale, in modo morbido e senza rimbalzo.
// Tutte le misure sono in pixel dello schermo (CSS), quindi l'effetto e' uguale
// su qualsiasi monitor e la griglia si riempie da sola al ridimensionamento.
// Shader: bgLines.vert / bgLines.frag (cartella shaders).
var BgLines = pc.createScript('bgLines');

BgLines.attributes.add('vertexShader', { type: 'asset', assetType: 'shader', title: 'Vertex shader' });
BgLines.attributes.add('fragmentShader', { type: 'asset', assetType: 'shader', title: 'Fragment shader' });
BgLines.attributes.add('cameraEntity', { type: 'entity', title: 'Camera (per il colore di sfondo)' });

BgLines.attributes.add('grid', {
    type: 'json', title: 'Griglia',
    schema: [
        { name: 'spacing', type: 'number', default: 14, min: 3, max: 200, precision: 1, title: 'Spaziatura tra le linee (px)' },
        { name: 'length', type: 'number', default: 9, min: 1, max: 200, precision: 1, title: 'Lunghezza linea (px)' },
        { name: 'thickness', type: 'number', default: 1.5, min: 0.25, max: 20, precision: 2, title: 'Spessore linea (px)' }
    ]
});

BgLines.attributes.add('look', {
    type: 'json', title: 'Colori',
    schema: [
        { name: 'background', type: 'rgb', default: [0, 0, 0], title: 'Colore sfondo' },
        { name: 'lineColor', type: 'rgb', default: [1, 1, 1], title: 'Colore linee' },
        { name: 'opacity', type: 'number', default: 1, min: 0, max: 1, precision: 2, title: 'Opacita linee' }
    ]
});

BgLines.attributes.add('mouse', {
    type: 'json', title: 'Mouse',
    schema: [
        { name: 'radius', type: 'number', default: 120, min: 5, max: 1500, precision: 0, title: 'Raggio d\'influenza (px)' },
        { name: 'falloff', type: 'number', default: 1.5, min: 0.1, max: 8, precision: 2, title: 'Sfumatura (alto = 90 gradi solo vicino al cursore)' },
        { name: 'maxAngle', type: 'number', default: 90, min: 0, max: 360, precision: 1, title: 'Rotazione massima (gradi)' },
        { name: 'counterClockwise', type: 'boolean', default: true, title: 'Senso antiorario' }
    ]
});

BgLines.attributes.add('timing', {
    type: 'json', title: 'Tempi',
    schema: [
        { name: 'riseTime', type: 'number', default: 0.12, min: 0.01, max: 3, precision: 2, title: 'Velocita della rotazione (s)' },
        { name: 'hold', type: 'number', default: 1.5, min: 0, max: 30, precision: 2, title: 'Attesa prima del ritorno (s)' },
        { name: 'returnTime', type: 'number', default: 0.8, min: 0.05, max: 10, precision: 2, title: 'Durata del ritorno (s)' }
    ]
});

BgLines.prototype.initialize = function () {
    this.device = this.app.graphicsDevice;
    this.canvas = this.device.canvas;
    this.camera = this.cameraEntity || (this.app.root.findComponent('camera') || {}).entity;
    this.time = 0;

    this.hasMouse = false;
    this.mouseX = 0;           // pixel del canvas, origine in basso a sinistra
    this.mouseY = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.hasPrev = false;
    this.moved = false;

    this.u2 = new Float32Array(2);
    this.u3 = {};

    this.buildMaterial();
    this.buildGrid();

    this.meshInstance = new pc.MeshInstance(this.mesh, this.material);
    this.meshInstance.cull = false;
    this.linesEntity = new pc.Entity('BgLinesMesh');
    this.linesEntity.addComponent('render', {
        meshInstances: [this.meshInstance],
        castShadows: false,
        receiveShadows: false
    });
    this.app.root.addChild(this.linesEntity);

    // Ricostruisco la griglia se cambia la finestra o la griglia
    this.onResize = function () { this.rebuild(); };
    this.device.on('resizecanvas', this.onResize, this);
    this.on('attr:grid', this.rebuild, this);

    // Mouse / touch
    var self = this;
    this.onMove = function (e) {
        var p = e.touches ? e.touches[0] : e;
        if (!p) return;
        var rect = self.canvas.getBoundingClientRect();
        var cx = p.clientX - rect.left;
        var cy = p.clientY - rect.top;
        if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) {
            self.hasMouse = false;
            return;
        }
        var r = self.pixelRatio();
        self.mouseX = cx * r;
        self.mouseY = (rect.height - cy) * r;
        self.hasMouse = true;
        self.moved = true;
    };
    this.onOut = function (e) { if (!e.relatedTarget) { self.hasMouse = false; self.hasPrev = false; } };
    this.onTouchEnd = function (e) { if (!e.touches || !e.touches.length) { self.hasMouse = false; self.hasPrev = false; } };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('touchstart', this.onMove, { passive: true });
    window.addEventListener('touchmove', this.onMove, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd);
    document.addEventListener('mouseout', this.onOut);

    this.on('destroy', function () {
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('touchstart', this.onMove);
        window.removeEventListener('touchmove', this.onMove);
        window.removeEventListener('touchend', this.onTouchEnd);
        document.removeEventListener('mouseout', this.onOut);
        this.device.off('resizecanvas', this.onResize, this);
        if (this.linesEntity) this.linesEntity.destroy();
        if (this.mesh) this.mesh.destroy();
        if (this.material) this.material.destroy();
    }, this);
};

// Pixel del render target per ogni pixel CSS (schermi ad alta densita)
BgLines.prototype.pixelRatio = function () {
    var w = this.canvas.clientWidth || this.device.width;
    return this.device.width / w;
};

BgLines.prototype.rebuild = function () {
    this.buildGrid();
    if (this.meshInstance) this.meshInstance.mesh = this.mesh;
};

// ---------- Costruzione ----------

BgLines.prototype.buildGrid = function () {
    var r = this.pixelRatio();
    var W = this.device.width, H = this.device.height;
    var sp = Math.max(1, this.grid.spacing * r);

    // Griglia centrata che copre tutto il canvas
    var cols = Math.ceil(W / sp) + 1;
    var rows = Math.ceil(H / sp) + 1;
    var x0 = (W - (cols - 1) * sp) * 0.5;
    var y0 = (H - (rows - 1) * sp) * 0.5;

    var n = cols * rows;
    this.cols = cols;
    this.rows = rows;
    this.x0 = x0;
    this.y0 = y0;
    this.sp = sp;
    this.count = n;

    var pos = new Float32Array(n * 12);
    var corner = new Float32Array(n * 8);
    var cx = [-1, 1, -1, 1], cy = [-1, -1, 1, 1];
    var idx = new Uint32Array(n * 6);

    for (var j = 0; j < rows; j++) {
        for (var i = 0; i < cols; i++) {
            var k = j * cols + i;
            var px = x0 + i * sp, py = y0 + j * sp;
            for (var v = 0; v < 4; v++) {
                var o = (k * 4 + v);
                pos[o * 3] = px; pos[o * 3 + 1] = py; pos[o * 3 + 2] = 0;
                corner[o * 2] = cx[v]; corner[o * 2 + 1] = cy[v];
            }
            var b = k * 4, t = k * 6;
            idx[t] = b; idx[t + 1] = b + 1; idx[t + 2] = b + 2;
            idx[t + 3] = b + 2; idx[t + 4] = b + 1; idx[t + 5] = b + 3;
        }
    }

    // Stato di ogni lineetta
    this.angle = new Float32Array(n);     // angolo attuale (radianti)
    this.peak = new Float32Array(n);      // quanto e' stata girata (0..1) nell'ultimo passaggio
    this.touched = new Float32Array(n);   // istante dell'ultimo passaggio del mouse
    for (var q = 0; q < n; q++) this.touched[q] = -1e9;
    this.angleStream = new Float32Array(n * 4);

    var old = this.mesh;
    var mesh = new pc.Mesh(this.device);
    mesh.setPositions(pos);
    mesh.setVertexStream(pc.SEMANTIC_TEXCOORD0, corner, 2);
    mesh.setVertexStream(pc.SEMANTIC_TEXCOORD1, this.angleStream, 1);
    mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    this.mesh = mesh;
    if (old) old.destroy();
    this.dirty = false;
};

BgLines.prototype.buildMaterial = function () {
    var vs = this.vertexShader && this.vertexShader.resource;
    var fs = this.fragmentShader && this.fragmentShader.resource;
    if (!vs || !fs) {
        console.error('[bgLines] assegna gli asset bgLines.vert e bgLines.frag');
        return;
    }
    this.material = new pc.ShaderMaterial({
        uniqueName: 'bgLines_' + this.entity.guid,
        vertexGLSL: vs,
        fragmentGLSL: fs,
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aCorner: pc.SEMANTIC_TEXCOORD0,
            aAngle: pc.SEMANTIC_TEXCOORD1
        }
    });
    this.material.cull = pc.CULLFACE_NONE;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.update();
};

// ---------- Mouse ----------

// Segna le lineette vicine a un punto (x, y) in pixel del canvas
BgLines.prototype.touchAt = function (x, y) {
    var m = this.mouse;
    var R = m.radius * this.pixelRatio();
    var sp = this.sp, cols = this.cols, rows = this.rows;
    var i0 = Math.max(0, Math.floor((x - R - this.x0) / sp));
    var i1 = Math.min(cols - 1, Math.ceil((x + R - this.x0) / sp));
    var j0 = Math.max(0, Math.floor((y - R - this.y0) / sp));
    var j1 = Math.min(rows - 1, Math.ceil((y + R - this.y0) / sp));
    var now = this.time, peak = this.peak, touched = this.touched, hold = this.timing.hold;

    for (var j = j0; j <= j1; j++) {
        var dy = this.y0 + j * sp - y;
        for (var i = i0; i <= i1; i++) {
            var dx = this.x0 + i * sp - x;
            var d = Math.sqrt(dx * dx + dy * dy);
            if (d >= R) continue;
            var t = 1 - d / R;
            var w = Math.pow(t * t * (3 - 2 * t), m.falloff);
            if (w < 0.01) continue;
            var k = j * cols + i;
            // Se il timer e' ancora attivo tengo la rotazione massima raggiunta
            var active = now - touched[k] < hold;
            peak[k] = active ? Math.max(peak[k], w) : w;
            touched[k] = now;
        }
    }
};

// ---------- Update ----------

BgLines.prototype.setVec3 = function (name, c) {
    var a = this.u3[name] || (this.u3[name] = new Float32Array(3));
    if (Array.isArray(c)) { a[0] = c[0]; a[1] = c[1]; a[2] = c[2]; }
    else { a[0] = c.r; a[1] = c.g; a[2] = c.b; }
    this.material.setParameter(name, a);
};

BgLines.prototype.update = function (dt) {
    if (!this.material || !this.count) return;
    this.time += dt;

    // Il mouse conta solo mentre si muove: la scia viene "disegnata" lungo il percorso
    if (this.hasMouse && this.moved) {
        var x = this.mouseX, y = this.mouseY;
        if (this.hasPrev) {
            var ddx = x - this.prevX, ddy = y - this.prevY;
            var dist = Math.sqrt(ddx * ddx + ddy * ddy);
            var step = Math.max(2, this.mouse.radius * this.pixelRatio() * 0.25);
            var n = Math.min(64, Math.ceil(dist / step));
            for (var s = 1; s <= n; s++) this.touchAt(this.prevX + ddx * s / n, this.prevY + ddy * s / n);
        } else {
            this.touchAt(x, y);
        }
        this.prevX = x;
        this.prevY = y;
        this.hasPrev = true;
    }
    this.moved = false;

    // Animazione delle rotazioni
    var tm = this.timing, m = this.mouse;
    var maxA = m.maxAngle * pc.math.DEG_TO_RAD * (m.counterClockwise ? 1 : -1);
    var kRise = 1 - Math.exp(-dt / Math.max(tm.riseTime, 0.001) * 3);
    var kFall = 1 - Math.exp(-dt / Math.max(tm.returnTime, 0.001) * 4);
    var now = this.time, hold = tm.hold;
    var angle = this.angle, peak = this.peak, touched = this.touched, stream = this.angleStream;
    var changed = false;

    for (var k = 0; k < this.count; k++) {
        if (peak[k] > 0 && now - touched[k] >= hold) peak[k] = 0;   // timer scaduto: torna
        var target = peak[k] * maxA;
        var a = angle[k];
        if (a === target) continue;
        var going = Math.abs(target) > Math.abs(a);
        a += (target - a) * (going ? kRise : kFall);
        if (Math.abs(target - a) < 0.0005) a = target;
        angle[k] = a;
        var o = k * 4;
        stream[o] = a; stream[o + 1] = a; stream[o + 2] = a; stream[o + 3] = a;
        changed = true;
    }

    if (changed) {
        this.mesh.setVertexStream(pc.SEMANTIC_TEXCOORD1, stream, 1);
        this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    }

    // Uniform
    var r = this.pixelRatio();
    var mat = this.material;
    this.u2[0] = this.device.width;
    this.u2[1] = this.device.height;
    mat.setParameter('uResolution', this.u2);
    mat.setParameter('uLength', this.grid.length * r);
    mat.setParameter('uThickness', this.grid.thickness * r);
    this.setVec3('uColor', this.look.lineColor);
    mat.setParameter('uOpacity', this.look.opacity);

    // Colore di sfondo sulla camera
    if (this.camera && this.camera.camera) {
        var bg = this.look.background;
        var cc = this.camera.camera.clearColor;
        var br = Array.isArray(bg) ? bg[0] : bg.r, bgc = Array.isArray(bg) ? bg[1] : bg.g, bb = Array.isArray(bg) ? bg[2] : bg.b;
        if (cc.r !== br || cc.g !== bgc || cc.b !== bb) {
            this.camera.camera.clearColor = new pc.Color(br, bgc, bb, 1);
        }
    }
};
