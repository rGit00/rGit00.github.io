// cubeRepel.js
// Da mettere sull'entità padre dei cubi (cubi_001).
// Quando il mouse passa vicino alla sfera, i cubi sotto il cursore si
// spingono verso l'esterno; quelli vicini seguono con un'influenza minore.
// Quando il mouse si allontana tornano al loro posto con un ritorno elastico.
// Mentre si spostano ruotano leggermente e si illuminano (emissive).
// I cubi spinti fluttuano con un noise sui due assi perpendicolari alla spinta.
var CubeRepel = pc.createScript('cubeRepel');

CubeRepel.attributes.add('cameraEntity', { type: 'entity', title: 'Camera' });
CubeRepel.attributes.add('radius', { type: 'number', default: 3, min: 0.01, title: 'Raggio influenza' });
CubeRepel.attributes.add('push', { type: 'number', default: 2.5, title: 'Spinta verso esterno' });
CubeRepel.attributes.add('falloff', { type: 'number', default: 1.5, min: 0.1, max: 8, title: 'Morbidezza falloff' });

// Molla
CubeRepel.attributes.add('stiffness', { type: 'number', default: 90, min: 1, max: 600, title: 'Rigidita molla' });
CubeRepel.attributes.add('bounce', { type: 'number', default: 0.35, min: 0, max: 0.95, title: 'Rimbalzo (0-1)' });

// Rotazione
CubeRepel.attributes.add('maxAngle', { type: 'number', default: 35, min: 0, max: 180, title: 'Rotazione max (gradi)' });

// Emissive
CubeRepel.attributes.add('glowColor', { type: 'rgb', default: [1, 0.45, 0.1], title: 'Colore glow' });
CubeRepel.attributes.add('glowIntensity', { type: 'number', default: 2, min: 0, max: 10, title: 'Intensita glow' });

// Fluttuazione (noise)
CubeRepel.attributes.add('float', {
    type: 'json', title: 'Fluttuazione (noise)',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'posAmplitude', type: 'number', default: 0.3, min: 0, max: 3, precision: 2, title: 'Ampiezza posizione' },
        { name: 'posSpeed', type: 'number', default: 0.5, min: 0, max: 5, precision: 2, title: 'Tempo posizione (velocita)' },
        { name: 'rotAmplitude', type: 'number', default: 10, min: 0, max: 90, precision: 1, title: 'Ampiezza rotazione (gradi)' },
        { name: 'rotSpeed', type: 'number', default: 0.4, min: 0, max: 5, precision: 2, title: 'Tempo rotazione (velocita)' },
        { name: 'phase', type: 'number', default: 1, min: 0, max: 1, precision: 2, title: 'Fase (0 = cubi sincronizzati)' },
        { name: 'octaves', type: 'number', default: 2, min: 1, max: 4, precision: 0, step: 1, title: 'Dettaglio noise (ottave)' },
        { name: 'roughness', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Ruvidita ottave' },
        { name: 'activation', type: 'number', default: 2, min: 0.1, max: 8, precision: 2, title: 'Curva attivazione (alto = solo i piu spinti)' }
    ]
});

CubeRepel.attributes.add('debug', { type: 'boolean', default: false, title: 'Debug log' });

// ---------- Noise 1D (value noise liscio + ottave) ----------

CubeRepel.hash = function (n) {
    var s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
};

CubeRepel.noise1 = function (x) {
    var i = Math.floor(x);
    var f = x - i;
    var u = f * f * f * (f * (f * 6 - 15) + 10);   // interpolazione quintica
    var a = CubeRepel.hash(i);
    var b = CubeRepel.hash(i + 1);
    return (a + (b - a) * u) * 2 - 1;               // -1..1
};

CubeRepel.fbm = function (x, octaves, roughness) {
    var sum = 0, amp = 1, norm = 0, freq = 1;
    for (var o = 0; o < octaves; o++) {
        sum += CubeRepel.noise1(x * freq + o * 19.19) * amp;
        norm += amp;
        amp *= roughness;
        freq *= 2;
    }
    return norm > 0 ? sum / norm : 0;
};

CubeRepel.prototype.initialize = function () {
    this.camera = this.cameraEntity || this.app.root.findComponent('camera').entity;
    this.time = 0;

    // Posizioni/rotazioni di riposo (locali) e centro della sfera
    this.cubes = [];
    var center = new pc.Vec3();
    var children = this.entity.children;
    for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (!c.render) continue;

        // Asse di rotazione casuale per ogni cubo (nello spazio locale del cubo)
        var axis = new pc.Vec3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (axis.lengthSq() < 0.0001) axis.set(0, 1, 0);
        axis.normalize();

        this.cubes.push({
            entity: c,
            rest: c.getLocalPosition().clone(),
            restRot: c.getLocalRotation().clone(),
            dir: new pc.Vec3(),
            tan1: new pc.Vec3(),
            tan2: new pc.Vec3(),
            axis: axis,
            spin: Math.random() < 0.5 ? -1 : 1,
            seeds: [Math.random(), Math.random(), Math.random(), Math.random()],
            amount: 0,
            vel: 0,
            materials: [],
            glow: -1
        });
        center.add(c.getLocalPosition());
    }
    if (this.cubes.length) center.mulScalar(1 / this.cubes.length);
    this.centerLocal = center;

    // Direzione di spinta (dal centro verso il cubo), i due assi perpendicolari
    // su cui fluttua, e raggio medio della sfera
    var r = 0;
    var up = new pc.Vec3(0, 1, 0);
    var right = new pc.Vec3(1, 0, 0);
    for (var j = 0; j < this.cubes.length; j++) {
        var cube = this.cubes[j];
        cube.dir.sub2(cube.rest, center);
        r += cube.dir.length();
        cube.dir.normalize();

        cube.tan1.cross(cube.dir, up);
        if (cube.tan1.lengthSq() < 1e-4) cube.tan1.cross(cube.dir, right);
        cube.tan1.normalize();
        cube.tan2.cross(cube.dir, cube.tan1).normalize();
    }
    this.sphereRadiusLocal = this.cubes.length ? r / this.cubes.length : 1;

    // Materiale proprio per ogni cubo, così il glow è indipendente
    this.setupMaterials();
    this.on('attr:glowColor', this.applyGlowColor, this);

    // Mouse / touch: posizione in pixel CSS relativa al canvas
    this.mouseX = 0;
    this.mouseY = 0;
    this.hasMouse = false;
    this.strength = 0;

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
    };
    this.onOut = function (e) {
        if (!e.relatedTarget) self.hasMouse = false;   // uscito dalla finestra
    };
    this.onTouchEnd = function (e) {
        if (!e.touches || !e.touches.length) self.hasMouse = false;
    };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('touchstart', this.onMove, { passive: true });
    window.addEventListener('touchmove', this.onMove, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd);
    document.addEventListener('mouseout', this.onOut);

    // Vettori riutilizzati
    this.rayStart = new pc.Vec3();
    this.rayEnd = new pc.Vec3();
    this.rayDir = new pc.Vec3();
    this.hit = new pc.Vec3();
    this.tmp = new pc.Vec3();
    this.centerWorld = new pc.Vec3();
    this.restWorld = new pc.Vec3();
    this.newPos = new pc.Vec3();
    this.qSpin = new pc.Quat();
    this.qBase = new pc.Quat();
    this.qW1 = new pc.Quat();
    this.qW2 = new pc.Quat();
    this.newRot = new pc.Quat();

    if (this.debug) {
        window.cubeRepel = this;
        console.log('[cubeRepel] cubi:', this.cubes.length, 'raggio sfera:', this.sphereRadiusLocal.toFixed(2));
        this._logTimer = 0;
    }

    this.on('destroy', function () {
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('mousemove', this.onMove);
        window.removeEventListener('touchstart', this.onMove);
        window.removeEventListener('touchmove', this.onMove);
        window.removeEventListener('touchend', this.onTouchEnd);
        document.removeEventListener('mouseout', this.onOut);
    }, this);
};

CubeRepel.prototype.setupMaterials = function () {
    for (var i = 0; i < this.cubes.length; i++) {
        var cube = this.cubes[i];
        var mis = cube.entity.render.meshInstances;
        for (var m = 0; m < mis.length; m++) {
            var mat = mis[m].material.clone();
            // Il colore emissive resta fisso: varia solo l'intensità,
            // così lo shader non viene ricompilato
            mat.emissive.copy(this.glowColor);
            mat.emissiveIntensity = 0;
            mat.update();
            mis[m].material = mat;
            cube.materials.push(mat);
        }
    }
};

CubeRepel.prototype.applyGlowColor = function () {
    for (var i = 0; i < this.cubes.length; i++) {
        var mats = this.cubes[i].materials;
        for (var m = 0; m < mats.length; m++) {
            mats[m].emissive.copy(this.glowColor);
            mats[m].update();
        }
    }
};

// Calcola il punto "toccato" sulla superficie della sfera.
// Ritorna un fattore 0..1: 1 se il raggio colpisce la sfera, cala se il
// mouse passa fuori dalla silhouette.
CubeRepel.prototype.computeHit = function () {
    var cam = this.camera.camera;
    cam.screenToWorld(this.mouseX, this.mouseY, cam.nearClip, this.rayStart);
    cam.screenToWorld(this.mouseX, this.mouseY, cam.farClip, this.rayEnd);
    this.rayDir.sub2(this.rayEnd, this.rayStart).normalize();

    var wt = this.entity.getWorldTransform();
    wt.transformPoint(this.centerLocal, this.centerWorld);
    var R = this.sphereRadiusLocal * this.entity.getScale().x;

    // Intersezione raggio-sfera
    var oc = this.tmp.sub2(this.rayStart, this.centerWorld);
    var b = oc.dot(this.rayDir);
    var c = oc.lengthSq() - R * R;
    var disc = b * b - c;

    if (disc >= 0) {
        var t = -b - Math.sqrt(disc);   // lato rivolto verso la camera
        if (t < 0) t = -b + Math.sqrt(disc);
        this.hit.copy(this.rayDir).mulScalar(t).add(this.rayStart);
        return 1;
    }

    // Il raggio manca la sfera: punto più vicino sul raggio, proiettato sulla superficie
    var tc = Math.max(-b, 0);
    this.hit.copy(this.rayDir).mulScalar(tc).add(this.rayStart);
    this.tmp.sub2(this.hit, this.centerWorld);
    var miss = this.tmp.length() - R;
    this.tmp.normalize().mulScalar(R);
    this.hit.add2(this.centerWorld, this.tmp);

    var worldRadius = this.radius * this.entity.getScale().x;
    var f = 1 - pc.math.clamp(miss / worldRadius, 0, 1);
    return f * f * (3 - 2 * f);
};

CubeRepel.prototype.update = function (dt) {
    this.time += dt;

    var strength = 0;
    if (this.hasMouse && this.camera) strength = this.computeHit();
    this.strength = strength;

    if (this.debug) {
        this._logTimer += dt;
        if (this._logTimer > 1) {
            this._logTimer = 0;
            console.log('[cubeRepel] mouse', this.hasMouse, Math.round(this.mouseX), Math.round(this.mouseY), 'forza', strength.toFixed(2));
        }
    }

    var wt = this.entity.getWorldTransform();
    var worldRadius = this.radius * this.entity.getScale().x;

    // Molla smorzata: bounce 0 = nessun rimbalzo, vicino a 1 = molto elastico
    var k = this.stiffness;
    var damping = 2 * Math.sqrt(k) * (1 - this.bounce);
    var push = Math.max(this.push, 0.0001);

    // Sotto-passi per stabilità anche con frame lenti
    var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    var h = dt / steps;

    // Fluttuazione
    var fl = this.float;
    var octaves = Math.max(1, Math.round(fl.octaves));
    var tPos = this.time * fl.posSpeed;
    var tRot = this.time * fl.rotSpeed;

    for (var i = 0; i < this.cubes.length; i++) {
        var cube = this.cubes[i];
        var target = 0;

        if (strength > 0) {
            wt.transformPoint(cube.rest, this.restWorld);
            var d = this.restWorld.distance(this.hit);
            var x = 1 - pc.math.clamp(d / worldRadius, 0, 1);
            // Smoothstep + esponente: il cubo sotto il mouse va al massimo,
            // i vicini meno, con una curva morbida
            var infl = Math.pow(x * x * (3 - 2 * x), this.falloff);
            target = infl * strength * this.push;
        }

        for (var s = 0; s < steps; s++) {
            var acc = k * (target - cube.amount) - damping * cube.vel;
            cube.vel += acc * h;
            cube.amount += cube.vel * h;
        }

        var n = cube.amount / push;

        // Peso della fluttuazione: cresce con lo spostamento (0 a riposo)
        var fw = fl.enabled ? Math.pow(pc.math.clamp(n, 0, 1), fl.activation) : 0;

        // Posizione: spinta radiale + noise sui due assi perpendicolari
        this.newPos.copy(cube.dir).mulScalar(cube.amount).add(cube.rest);

        var a1 = 0, a2 = 0;
        if (fw > 0.0001) {
            // Fase per cubo e per canale: con Fase = 0 tutti i cubi si muovono insieme
            var ph = fl.phase * 1000;
            var o1 = CubeRepel.fbm(tPos + cube.seeds[0] * ph + 3.1, octaves, fl.roughness);
            var o2 = CubeRepel.fbm(tPos + cube.seeds[1] * ph + 57.7, octaves, fl.roughness);
            var amp = fl.posAmplitude * fw;
            this.newPos.x += (cube.tan1.x * o1 + cube.tan2.x * o2) * amp;
            this.newPos.y += (cube.tan1.y * o1 + cube.tan2.y * o2) * amp;
            this.newPos.z += (cube.tan1.z * o1 + cube.tan2.z * o2) * amp;

            var ramp = fl.rotAmplitude * fw;
            a1 = CubeRepel.fbm(tRot + cube.seeds[2] * ph + 101.3, octaves, fl.roughness) * ramp;
            a2 = CubeRepel.fbm(tRot + cube.seeds[3] * ph + 211.9, octaves, fl.roughness) * ramp;
        }
        cube.entity.setLocalPosition(this.newPos);

        // Rotazione: proporzionale allo spostamento (rimbalza insieme alla molla)
        this.qSpin.setFromAxisAngle(cube.axis, n * this.maxAngle * cube.spin);
        this.qBase.mul2(cube.restRot, this.qSpin);

        // + oscillazione noise sui due assi perpendicolari alla spinta
        if (a1 !== 0 || a2 !== 0) {
            this.qW1.setFromAxisAngle(cube.tan1, a1);
            this.qW2.setFromAxisAngle(cube.tan2, a2);
            this.qW1.mul(this.qW2);
            this.newRot.mul2(this.qW1, this.qBase);
        } else {
            this.newRot.copy(this.qBase);
        }
        cube.entity.setLocalRotation(this.newRot);

        // Glow: solo in uscita (clamp 0..1), aggiorno il materiale se cambia
        var glow = pc.math.clamp(n, 0, 1) * this.glowIntensity;
        if (Math.abs(glow - cube.glow) > 0.002) {
            cube.glow = glow;
            for (var m = 0; m < cube.materials.length; m++) {
                cube.materials[m].emissiveIntensity = glow;
                cube.materials[m].update();
            }
        }
    }
};
