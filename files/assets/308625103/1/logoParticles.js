// logoParticles.js
// Riempie il volume di una geometria (es. il logo) con qualche migliaio di palline.
// La geometria originale viene nascosta: restano solo le particelle.
//
// Interazione guidata dalla VELOCITA del mouse:
//  - mouse fermo o lento (sotto la "zona morta"): nessuna forza
//  - passata veloce: le palline vicine ricevono un colpo nella direzione del
//    movimento (+ un po' via dal cursore) e si "agitano": una turbolenza
//    le fa vibrare per un po', poi la frenesia si spegne da sola
// Sopra la zona morta la forza cresce con una potenza della velocita
// (default: al quadrato), cosi i gesti rapidi contano molto piu di quelli medi.
// Le palline mosse diventano del colore "caldo" luminoso; una molla le riporta
// sempre al loro posto con un piccolo rimbalzo.
// Shader: logoParticles.vert / logoParticles.frag (cartella shaders).
var LogoParticles = pc.createScript('logoParticles');

LogoParticles.attributes.add('sourceEntity', { type: 'entity', title: 'Geometria da riempire' });
LogoParticles.attributes.add('cameraEntity', { type: 'entity', title: 'Camera' });
LogoParticles.attributes.add('vertexShader', { type: 'asset', assetType: 'shader', title: 'Vertex shader' });
LogoParticles.attributes.add('fragmentShader', { type: 'asset', assetType: 'shader', title: 'Fragment shader' });
LogoParticles.attributes.add('hideSource', { type: 'boolean', default: true, title: 'Nascondi la geometria' });

LogoParticles.attributes.add('fill', {
    type: 'json', title: 'Riempimento',
    schema: [
        { name: 'count', type: 'number', default: 4000, min: 100, max: 60000, precision: 0, step: 100, title: 'Numero particelle (circa)' },
        { name: 'jitter', type: 'number', default: 0.7, min: 0, max: 1, precision: 2, title: 'Casualita posizione (0 = griglia)' },
        { name: 'size', type: 'number', default: 0.055, min: 0.005, max: 0.5, precision: 3, title: 'Raggio pallina' },
        { name: 'sizeVariation', type: 'number', default: 0.35, min: 0, max: 1, precision: 2, title: 'Variazione dimensione' },
        { name: 'toneMix', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Quota grigio molto scuro' },
        { name: 'seed', type: 'number', default: 1, min: 0, max: 9999, precision: 0, step: 1, title: 'Seme casuale' }
    ]
});

LogoParticles.attributes.add('force', {
    type: 'json', title: 'Zona del mouse',
    schema: [
        { name: 'radius', type: 'number', default: 1.6, min: 0.05, max: 10, precision: 2, title: 'Raggio influenza' },
        { name: 'radiusBySpeed', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Raggio cresce con la velocita (0 = fisso)' },
        { name: 'falloff', type: 'number', default: 1.5, min: 0.1, max: 8, precision: 2, title: 'Decadimento (alto = piu concentrato sulla punta)' },
        { name: 'edgeNoise', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Bordo irregolare (0 = cerchio)' },
        { name: 'edgeScale', type: 'number', default: 1.2, min: 0.05, max: 10, precision: 2, title: 'Scala irregolarita bordo' },
        { name: 'strength', type: 'number', default: 0.3, min: 0, max: 10, precision: 2, title: 'Colpo radiale (via dal cursore)' },
        { name: 'depth', type: 'number', default: 0.35, min: -2, max: 2, precision: 2, title: 'Colpo in profondita (+ verso la camera)' },
        { name: 'randomness', type: 'number', default: 0.25, min: 0, max: 1, precision: 2, title: 'Disordine per pallina' }
    ]
});

LogoParticles.attributes.add('wind', {
    type: 'json', title: 'Velocita del mouse',
    schema: [
        { name: 'amount', type: 'number', default: 1.5, min: 0, max: 10, precision: 2, title: 'Colpo nella direzione del movimento' },
        { name: 'deadZone', type: 'number', default: 3, min: 0, max: 50, precision: 2, title: 'Zona morta (sotto questa velocita nessun effetto)' },
        { name: 'max', type: 'number', default: 14, min: 0.1, max: 80, precision: 2, title: 'Velocita di riferimento (effetto 1x)' },
        { name: 'curve', type: 'number', default: 2, min: 0.5, max: 4, precision: 2, title: 'Sensibilita alla velocita (alto = i gesti medi contano meno)' },
        { name: 'cap', type: 'number', default: 3, min: 0.5, max: 10, precision: 2, title: 'Limite effetto per gesti velocissimi' },
        { name: 'smoothing', type: 'number', default: 6, min: 0.5, max: 30, precision: 1, title: 'Morbidezza (basso = l\'effetto dura di piu dopo il gesto)' },
        { name: 'gusts', type: 'number', default: 0.4, min: 0, max: 1, precision: 2, title: 'Raffiche (variazione tra palline)' }
    ]
});

LogoParticles.attributes.add('frenzy', {
    type: 'json', title: 'Frenesia',
    schema: [
        { name: 'buildUp', type: 'number', default: 4, min: 0, max: 30, precision: 2, title: 'Accumulo (quanto si agitano a ogni passata)' },
        { name: 'duration', type: 'number', default: 1.0, min: 0.05, max: 10, precision: 2, title: 'Durata agitazione (secondi)' }
    ]
});

LogoParticles.attributes.add('turbulence', {
    type: 'json', title: 'Turbolenza (agitazione)',
    schema: [
        { name: 'amplitude', type: 'number', default: 1.0, min: 0, max: 10, precision: 2, title: 'Ampiezza' },
        { name: 'scale', type: 'number', default: 0.8, min: 0.01, max: 10, precision: 2, title: 'Scala (alto = vortici piu piccoli)' },
        { name: 'speed', type: 'number', default: 1.2, min: 0, max: 10, precision: 2, title: 'Velocita (tempo)' },
        { name: 'octaves', type: 'number', default: 2, min: 1, max: 4, precision: 0, step: 1, title: 'Dettaglio (ottave)' }
    ]
});

LogoParticles.attributes.add('spring', {
    type: 'json', title: 'Ritorno elastico',
    schema: [
        { name: 'stiffness', type: 'number', default: 60, min: 1, max: 600, precision: 0, title: 'Rigidita' },
        { name: 'bounce', type: 'number', default: 0.55, min: 0, max: 0.95, precision: 2, title: 'Rimbalzo (0-1)' }
    ]
});

LogoParticles.attributes.add('look', {
    type: 'json', title: 'Colori',
    schema: [
        { name: 'colorA', type: 'rgb', default: [0.16, 0.16, 0.17], title: 'Grigio scuro' },
        { name: 'colorB', type: 'rgb', default: [0.06, 0.06, 0.065], title: 'Grigio molto scuro' },
        { name: 'hotColor', type: 'rgb', default: [1, 0.06, 0.04], title: 'Colore spinta' },
        { name: 'hotIntensity', type: 'number', default: 4, min: 0, max: 30, precision: 2, title: 'Intensita colore spinta' },
        { name: 'heatRange', type: 'number', default: 0.6, min: 0.01, max: 5, precision: 2, title: 'Spostamento per rosso pieno' },
        { name: 'coolSpeed', type: 'number', default: 3, min: 0.1, max: 30, precision: 1, title: 'Velocita spegnimento rosso' },
        { name: 'lightDir', type: 'vec3', default: [-0.4, 0.6, 0.7], title: 'Direzione luce (schermo)' },
        { name: 'ambient', type: 'number', default: 0.35, min: 0, max: 1, precision: 2, title: 'Luce ambiente' },
        { name: 'specular', type: 'number', default: 0.25, min: 0, max: 3, precision: 2, title: 'Riflesso' },
        { name: 'glossiness', type: 'number', default: 24, min: 1, max: 256, precision: 0, title: 'Lucidita' }
    ]
});

// Scale interne: trasformano i parametri in forze (accelerazioni).
// Il cursore passa sopra una pallina per pochi centesimi di secondo,
// quindi il colpo deve essere forte per farla volare.
LogoParticles.KICK_FORCE = 400;
LogoParticles.TURB_FORCE = 60;
LogoParticles.AGIT_RATE = 4;

// ---------- Numeri casuali ripetibili ----------

LogoParticles.rng = function (seed) {
    var s = (seed * 9301 + 49297) % 233280 || 1;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
};

// ---------- Noise 3D (value noise liscio) ----------

LogoParticles.hash3 = function (x, y, z) {
    var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// Ritorna un valore liscio tra -1 e 1
LogoParticles.noise3 = function (x, y, z) {
    var H = LogoParticles.hash3;
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    var a = H(xi, yi, zi), b = H(xi + 1, yi, zi), c = H(xi, yi + 1, zi), d = H(xi + 1, yi + 1, zi);
    var e = H(xi, yi, zi + 1), f = H(xi + 1, yi, zi + 1), g = H(xi, yi + 1, zi + 1), h = H(xi + 1, yi + 1, zi + 1);
    var x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (h - g) * u;
    var y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
    return (y1 + (y2 - y1) * w) * 2 - 1;
};

LogoParticles.fbm3 = function (x, y, z, octaves) {
    var sum = 0, amp = 1, norm = 0;
    for (var o = 0; o < octaves; o++) {
        sum += LogoParticles.noise3(x, y, z) * amp;
        norm += amp;
        amp *= 0.5;
        x *= 2.03; y *= 2.03; z *= 2.03;
    }
    return sum / norm;
};

// ---------- Init ----------

LogoParticles.prototype.initialize = function () {
    this.camera = this.cameraEntity || this.app.root.findComponent('camera').entity;
    this.mouseX = 0;
    this.mouseY = 0;
    this.hasMouse = false;
    this.time = 0;

    this.rayStart = new pc.Vec3();
    this.rayEnd = new pc.Vec3();
    this.rayDir = new pc.Vec3();
    this.mouseWorld = new pc.Vec3();
    this.prevMouseWorld = new pc.Vec3();
    this.hasPrevMouse = false;
    this.moveDir = new pc.Vec3();     // direzione del movimento del mouse (smussata)
    this.speedNorm = 0;               // fattore di velocita: 0 = fermo, 1 = velocita di riferimento
    this.u3 = {};

    this.readSourceTriangles();
    this.buildParticles();
    this.buildMaterial();

    this.meshInstance = new pc.MeshInstance(this.mesh, this.material);
    this.meshInstance.cull = false;
    this.particlesEntity = new pc.Entity('LogoParticlesMesh');
    this.particlesEntity.addComponent('render', {
        meshInstances: [this.meshInstance],
        castShadows: false,
        receiveShadows: false
    });
    this.app.root.addChild(this.particlesEntity);

    if (this.sourceEntity && this.sourceEntity.render && this.hideSource) {
        this.sourceEntity.render.enabled = false;
    }

    // Ricostruzione quando cambiano i parametri di riempimento
    this.on('attr:fill', function () {
        this.buildParticles();
        this.meshInstance.mesh = this.mesh;
    }, this);
    this.on('attr:hideSource', function () {
        if (this.sourceEntity && this.sourceEntity.render) this.sourceEntity.render.enabled = !this.hideSource;
    }, this);

    // Mouse / touch
    var self = this;
    var canvas = this.app.graphicsDevice.canvas;
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
    this.onOut = function (e) { if (!e.relatedTarget) self.hasMouse = false; };
    this.onTouchEnd = function (e) { if (!e.touches || !e.touches.length) self.hasMouse = false; };
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
        if (this.particlesEntity) this.particlesEntity.destroy();
        if (this.mesh) this.mesh.destroy();
        if (this.material) this.material.destroy();
    }, this);
};

// ---------- Lettura della geometria ----------

// Legge i triangoli della geometria sorgente in coordinate mondo
LogoParticles.prototype.readSourceTriangles = function () {
    var tris = [];
    var src = this.sourceEntity;
    if (!src || !src.render || !src.render.meshInstances.length) {
        console.error('[logoParticles] assegna una geometria con componente render');
        this.tris = new Float32Array(0);
        this.bmin = [0, 0, 0];
        this.bmax = [0, 0, 0];
        this.center = new pc.Vec3();
        return;
    }
    var wt = src.getWorldTransform();
    var p = new pc.Vec3();
    var mis = src.render.meshInstances;
    for (var m = 0; m < mis.length; m++) {
        var mesh = mis[m].mesh;
        var pos = [];
        mesh.getPositions(pos);
        var idx = [];
        var hasIdx = mesh.getIndices(idx) > 0;
        var nTri = hasIdx ? idx.length / 3 : pos.length / 9;
        var world = new Float32Array(pos.length);
        for (var v = 0; v < pos.length; v += 3) {
            p.set(pos[v], pos[v + 1], pos[v + 2]);
            wt.transformPoint(p, p);
            world[v] = p.x; world[v + 1] = p.y; world[v + 2] = p.z;
        }
        for (var t = 0; t < nTri; t++) {
            for (var k = 0; k < 3; k++) {
                var vi = hasIdx ? idx[t * 3 + k] : t * 3 + k;
                tris.push(world[vi * 3], world[vi * 3 + 1], world[vi * 3 + 2]);
            }
        }
    }
    this.tris = new Float32Array(tris);

    // Ingombro
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < this.tris.length; i += 3) {
        for (var a = 0; a < 3; a++) {
            mn[a] = Math.min(mn[a], this.tris[i + a]);
            mx[a] = Math.max(mx[a], this.tris[i + a]);
        }
    }
    this.bmin = mn;
    this.bmax = mx;
    this.center = new pc.Vec3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
};

// Punto dentro la geometria? Conta quante volte un raggio attraversa la superficie
// (numero dispari = dentro). Direzione un po' storta per evitare spigoli e vertici.
LogoParticles.prototype.isInside = function (px, py, pz) {
    var dx = 0.8723, dy = 0.3912, dz = 0.2934;
    var T = this.tris;
    var hits = 0;
    for (var i = 0; i < T.length; i += 9) {
        var e1x = T[i + 3] - T[i], e1y = T[i + 4] - T[i + 1], e1z = T[i + 5] - T[i + 2];
        var e2x = T[i + 6] - T[i], e2y = T[i + 7] - T[i + 1], e2z = T[i + 8] - T[i + 2];
        var hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
        var a = e1x * hx + e1y * hy + e1z * hz;
        if (a > -1e-9 && a < 1e-9) continue;
        var f = 1 / a;
        var sx = px - T[i], sy = py - T[i + 1], sz = pz - T[i + 2];
        var u = f * (sx * hx + sy * hy + sz * hz);
        if (u < 0 || u > 1) continue;
        var qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        var v = f * (dx * qx + dy * qy + dz * qz);
        if (v < 0 || u + v > 1) continue;
        var t = f * (e2x * qx + e2y * qy + e2z * qz);
        if (t > 1e-7) hits++;
    }
    return (hits & 1) === 1;
};

// ---------- Particelle ----------

LogoParticles.prototype.buildParticles = function () {
    var fill = this.fill;
    var rand = LogoParticles.rng(Math.round(fill.seed) + 1);
    var mn = this.bmin, mx = this.bmax;
    var sx = mx[0] - mn[0], sy = mx[1] - mn[1], sz = mx[2] - mn[2];
    var rest = [];

    if (this.tris.length) {
        // Stimo la frazione di volume occupata dal logo, poi scelgo il passo della griglia
        var inside = 0, probes = 3000;
        for (var i = 0; i < probes; i++) {
            if (this.isInside(mn[0] + rand() * sx, mn[1] + rand() * sy, mn[2] + rand() * sz)) inside++;
        }
        var volume = Math.max(inside / probes, 0.01) * sx * sy * sz;
        var step = Math.cbrt(volume / Math.max(fill.count, 1));

        // Griglia con disturbo casuale: riempimento uniforme ma "a grani"
        var j = fill.jitter * step;
        for (var x = mn[0] + step * 0.5; x < mx[0]; x += step) {
            for (var y = mn[1] + step * 0.5; y < mx[1]; y += step) {
                for (var z = mn[2] + step * 0.5; z < mx[2]; z += step) {
                    var px = x + (rand() - 0.5) * j;
                    var py = y + (rand() - 0.5) * j;
                    var pz = z + (rand() - 0.5) * j;
                    if (this.isInside(px, py, pz)) rest.push(px, py, pz);
                }
            }
        }
    }

    var n = rest.length / 3;
    this.count = n;
    this.rest = new Float32Array(rest);
    this.pos = new Float32Array(rest);
    this.offset = new Float32Array(n * 3);   // spostamento attuale
    this.vel = new Float32Array(n * 3);
    this.dirJit = new Float32Array(n * 3);   // disordine per pallina
    this.agit = new Float32Array(n);         // agitazione 0..1 (frenesia)
    this.heat = new Float32Array(n);
    this.data = new Float32Array(n * 3);     // tono, calore, dimensione

    for (var p = 0; p < n; p++) {
        this.data[p * 3] = rand() < fill.toneMix ? 1 : 0;
        this.data[p * 3 + 1] = 0;
        this.data[p * 3 + 2] = 1 + (rand() * 2 - 1) * fill.sizeVariation;
        this.dirJit[p * 3] = rand() * 2 - 1;
        this.dirJit[p * 3 + 1] = rand() * 2 - 1;
        this.dirJit[p * 3 + 2] = rand() * 2 - 1;
    }

    var old = this.mesh;
    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(this.pos);
    mesh.setVertexStream(pc.SEMANTIC_TEXCOORD0, this.data, 3);
    mesh.update(pc.PRIMITIVE_POINTS, false);
    this.mesh = mesh;
    if (old) old.destroy();

    console.log('[logoParticles] particelle: ' + n);
};

LogoParticles.prototype.buildMaterial = function () {
    var vs = this.vertexShader && this.vertexShader.resource;
    var fs = this.fragmentShader && this.fragmentShader.resource;
    if (!vs || !fs) {
        console.error('[logoParticles] assegna gli asset logoParticles.vert e logoParticles.frag');
        return;
    }
    this.material = new pc.ShaderMaterial({
        uniqueName: 'logoParticles_' + this.entity.guid,
        vertexGLSL: vs,
        fragmentGLSL: fs,
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aData: pc.SEMANTIC_TEXCOORD0
        }
    });
    this.material.cull = pc.CULLFACE_NONE;
    this.material.update();
};

// ---------- Velocita del mouse ----------

// Segue il punto del mouse sul piano del logo e ne ricava velocita e direzione.
// speedNorm = ((velocita - zona morta) / velocita di riferimento) ^ sensibilita,
// con un limite. Sotto la zona morta vale 0: i movimenti lenti non fanno nulla.
// Si smorza nel tempo: quando ti fermi scende a zero.
LogoParticles.prototype.updateMouseSpeed = function (dt, active) {
    var wd = this.wind;
    var targetSpeed = 0;
    var tmp = LogoParticles._tmpV || (LogoParticles._tmpV = new pc.Vec3());

    if (active) {
        // Intersezione del raggio col piano del logo, rivolto verso la camera
        var n = this.camera.forward;
        var denom = this.rayDir.dot(n);
        if (Math.abs(denom) > 1e-5) {
            var t = (this.center.x - this.rayStart.x) * n.x + (this.center.y - this.rayStart.y) * n.y + (this.center.z - this.rayStart.z) * n.z;
            t /= denom;
            this.mouseWorld.copy(this.rayDir).mulScalar(t).add(this.rayStart);
            if (this.hasPrevMouse && dt > 0) {
                tmp.sub2(this.mouseWorld, this.prevMouseWorld);
                var dist = tmp.length();
                if (dist > 1e-6) {
                    var speed = dist / dt;
                    var over = Math.max(0, speed - (wd.deadZone || 0));
                    var ratio = over / Math.max(wd.max, 0.01);
                    targetSpeed = Math.min(Math.pow(ratio, wd.curve), wd.cap);
                    tmp.mulScalar(1 / dist);
                    // la direzione segue il movimento
                    var kd = 1 - Math.exp(-20 * dt);
                    this.moveDir.lerp(this.moveDir, tmp, kd);
                }
            }
            this.prevMouseWorld.copy(this.mouseWorld);
            this.hasPrevMouse = true;
        }
    } else {
        this.hasPrevMouse = false;
    }

    // Sale subito, scende con la morbidezza impostata
    if (targetSpeed > this.speedNorm) this.speedNorm = targetSpeed;
    else this.speedNorm += (targetSpeed - this.speedNorm) * (1 - Math.exp(-wd.smoothing * dt));
};

// ---------- Update ----------

LogoParticles.prototype.setVec3 = function (name, v) {
    var a = this.u3[name] || (this.u3[name] = new Float32Array(3));
    if (Array.isArray(v)) { a[0] = v[0]; a[1] = v[1]; a[2] = v[2]; }
    else if (v.x !== undefined) { a[0] = v.x; a[1] = v.y; a[2] = v.z; }
    else { a[0] = v.r; a[1] = v.g; a[2] = v.b; }
    this.material.setParameter(name, a);
};

LogoParticles.prototype.update = function (dt) {
    if (!this.material || !this.count) return;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;

    var cam = this.camera.camera;
    var active = this.hasMouse;
    if (active) {
        cam.screenToWorld(this.mouseX, this.mouseY, cam.nearClip, this.rayStart);
        cam.screenToWorld(this.mouseX, this.mouseY, cam.farClip, this.rayEnd);
        this.rayDir.sub2(this.rayEnd, this.rayStart).normalize();
    }
    this.updateMouseSpeed(dt, active);

    var f = this.force, tb = this.turbulence, wd = this.wind, fr = this.frenzy, sp = this.spring, look = this.look;
    var sN = this.speedNorm;
    var hitting = active && sN > 0.001;

    // Il raggio d'influenza cresce con la velocita (fino alla velocita di riferimento)
    var sR = Math.min(sN, 1);
    var R = f.radius * (1 - f.radiusBySpeed + f.radiusBySpeed * sR);
    var Rmax = R * (1 + f.edgeNoise);
    var Rmax2 = Rmax * Rmax;
    var ox = this.rayStart.x, oy = this.rayStart.y, oz = this.rayStart.z;
    var dx = this.rayDir.x, dy = this.rayDir.y, dz = this.rayDir.z;
    var depth = f.depth;

    var tScale = tb.scale, tAmp = tb.amplitude * LogoParticles.TURB_FORCE;
    var tt = this.time * tb.speed;
    var oct = Math.max(1, Math.round(tb.octaves));
    var eScale = f.edgeScale, eAmt = f.edgeNoise;
    var mdx = this.moveDir.x, mdy = this.moveDir.y, mdz = this.moveDir.z;
    var windAmt = wd.amount, gusts = wd.gusts;
    var kickBase = sN * LogoParticles.KICK_FORCE;
    var N3 = LogoParticles.noise3, F3 = LogoParticles.fbm3;

    var buildUp = fr.buildUp * LogoParticles.AGIT_RATE * sN * dt;
    var agitDecay = Math.exp(-dt / Math.max(fr.duration, 0.01));

    var k = sp.stiffness, c = 2 * Math.sqrt(k) * (1 - sp.bounce);
    var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    var h = dt / steps;
    var coolK = 1 - Math.exp(-look.coolSpeed * dt);
    var heatRange = look.heatRange;

    var rest = this.rest, off = this.offset, vel = this.vel, pos = this.pos;
    var jit = this.dirJit, agit = this.agit, heat = this.heat, data = this.data;
    var rnd = f.randomness;

    for (var i = 0; i < this.count; i++) {
        var i3 = i * 3;
        var rx = rest[i3], ry = rest[i3 + 1], rz = rest[i3 + 2];
        var fx = 0, fy = 0, fz = 0;

        // Colpo del mouse: solo se il mouse si sta muovendo abbastanza veloce
        if (hitting) {
            var vx = rx - ox, vy = ry - oy, vz = rz - oz;
            var t = vx * dx + vy * dy + vz * dz;
            var px = vx - dx * t, py = vy - dy * t, pz = vz - dz * t;
            var d2 = px * px + py * py + pz * pz;
            if (d2 < Rmax2) {
                // Bordo irregolare: il raggio d'influenza cambia nello spazio e nel tempo
                var edge = N3(rx * eScale + 11.3, ry * eScale - 7.1, rz * eScale + tt * 0.5);
                var Rloc = R * (1 + edge * eAmt);
                var d = Math.sqrt(d2);
                if (d < Rloc) {
                    var x = 1 - d / Rloc;
                    var w = Math.pow(x * x * (3 - 2 * x), f.falloff);
                    var inv = d > 1e-5 ? 1 / d : 0;
                    var g = 1 + (jit[i3] * 0.5 + jit[i3 + 1] * 0.5) * gusts;
                    var kick = kickBase * w;

                    fx = (mdx * windAmt * g + px * inv * f.strength + jit[i3] * rnd - dx * depth) * kick;
                    fy = (mdy * windAmt * g + py * inv * f.strength + jit[i3 + 1] * rnd - dy * depth) * kick;
                    fz = (mdz * windAmt * g + pz * inv * f.strength + jit[i3 + 2] * rnd - dz * depth) * kick;

                    // Frenesia: ogni passata veloce aumenta l'agitazione
                    agit[i] = Math.min(1, agit[i] + buildUp * w);
                }
            }
        }

        // Agitazione: turbolenza che con
        
        //tinua per un po' e poi si spegne
        agit[i] *= agitDecay;
        var a = agit[i];
        if (a > 0.002) {
            var sxn = rx * tScale, syn = ry * tScale, szn = rz * tScale;
            var ta = tAmp * a;
            fx += F3(sxn + tt, syn, szn, oct) * ta;
            fy += F3(sxn + 31.7, syn + tt, szn, oct) * ta;
            fz += F3(sxn, syn - 17.9, szn + tt, oct) * ta;
        }

        // Molla verso il posto di riposo + forze del mouse
        for (var s = 0; s < steps; s++) {
            vel[i3] += (fx - k * off[i3] - c * vel[i3]) * h;
            vel[i3 + 1] += (fy - k * off[i3 + 1] - c * vel[i3 + 1]) * h;
            vel[i3 + 2] += (fz - k * off[i3 + 2] - c * vel[i3 + 2]) * h;
            off[i3] += vel[i3] * h;
            off[i3 + 1] += vel[i3 + 1] * h;
            off[i3 + 2] += vel[i3 + 2] * h;
        }

        pos[i3] = rx + off[i3];
        pos[i3 + 1] = ry + off[i3 + 1];
        pos[i3 + 2] = rz + off[i3 + 2];

        // Calore: spostamento o agitazione, si spegne con calma
        var disp = Math.sqrt(off[i3] * off[i3] + off[i3 + 1] * off[i3 + 1] + off[i3 + 2] * off[i3 + 2]);
        var target = Math.max(Math.min(disp / heatRange, 1), a * 0.8);
        heat[i] = target > heat[i] ? target : heat[i] + (target - heat[i]) * coolK;
        data[i3 + 1] = heat[i];
    }

    this.mesh.setPositions(pos);
    this.mesh.setVertexStream(pc.SEMANTIC_TEXCOORD0, data, 3);
    this.mesh.update(pc.PRIMITIVE_POINTS, false);

    // Uniform
    var m = this.material;
    m.setParameter('uSize', this.fill.size);
    m.setParameter('uProjScale', cam.projectionMatrix.data[5]);
    m.setParameter('uViewportHeight', this.app.graphicsDevice.height);
    this.setVec3('uColorA', look.colorA);
    this.setVec3('uColorB', look.colorB);
    this.setVec3('uHotColor', look.hotColor);
    m.setParameter('uHotIntensity', look.hotIntensity);
    this.setVec3('uLightDir', look.lightDir);
    m.setParameter('uAmbient', look.ambient);
    m.setParameter('uSpecular', look.specular);
    m.setParameter('uGlossiness', look.glossiness);
};
