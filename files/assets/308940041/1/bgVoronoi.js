// bgVoronoi.js
// Sfondo flat a celle di Voronoi su tutta la pagina, come UN UNICO sistema di
// particelle che collidono:
//  - ogni punto ha una "bolla" d'ingombro: grande lontano dal mouse, piccola vicino
//  - i punti si respingono tra loro (collisioni), quindi le celle si comprimono
//    e si deformano in modo naturale, senza un bordo netto tra zone
//  - Celle di base: tornano lentamente al loro posto con una molla (lasciano una
//    scia di celle deformate) e "respirano" lentissimamente
//  - Punti del mouse: nascono gradualmente mentre il mouse resta sulla pagina,
//    lo seguono, a mouse fermo tremolano con un noise, spariscono gradualmente
//    quando il mouse esce
//  - Forma della zona fitta: i punti esterni seguono il mouse con piu ritardo
//    (effetto cometa) e il bordo e' deformato da un noise che cambia nel tempo
//  - Scia: muovendo il mouse alcuni punti si staccano e restano indietro, poi le
//    loro celle si allargano e spariscono
// Ogni frame: triangolazione di Delaunay dei punti -> linee del Voronoi.
// Linee e puntini sono disegnati in pixel dello schermo, con bordi antialias.
//
// Logo (opzionale): un SVG al centro della pagina visto "attraverso" le celle,
// come pezzi di vetro. Ogni cella sposta il logo di un offset suo e lo ingrandisce
// o rimpicciolisce un po' (effetto lente), quindi il logo si spezza lungo le
// linee del Voronoi. Vicino al mouse (celle piccole) la rifrazione e' piu forte.
//
// Shader: bgVoronoi.vert / bgVoronoi.frag (cartella shaders).
// Prestazioni: tutta la memoria (triangoli, griglia collisioni, tabella dei lati,
// buffer della mesh) viene preparata una volta e riusata, cosi a ogni frame non
// si crea spazzatura per il garbage collector.
var BgVoronoi = pc.createScript('bgVoronoi');

BgVoronoi.attributes.add('vertexShader', { type: 'asset', assetType: 'shader', title: 'Vertex shader' });
BgVoronoi.attributes.add('fragmentShader', { type: 'asset', assetType: 'shader', title: 'Fragment shader' });
BgVoronoi.attributes.add('cameraEntity', { type: 'entity', title: 'Camera (per il colore di sfondo)' });

BgVoronoi.attributes.add('cells', {
    type: 'json', title: 'Celle di base',
    schema: [
        { name: 'count', type: 'number', default: 80, min: 4, max: 600, precision: 0, step: 1, title: 'Numero celle' },
        { name: 'jitter', type: 'number', default: 0.85, min: 0, max: 1, precision: 2, title: 'Casualita (0 = griglia regolare)' },
        { name: 'margin', type: 'number', default: 0.06, min: 0, max: 0.5, precision: 2, title: 'Celle oltre i bordi (frazione pagina)' },
        { name: 'seed', type: 'number', default: 1, min: 0, max: 9999, precision: 0, step: 1, title: 'Seme casuale' }
    ]
});

BgVoronoi.attributes.add('breathe', {
    type: 'json', title: 'Respiro della pagina',
    schema: [
        { name: 'amplitude', type: 'number', default: 25, min: 0, max: 300, precision: 1, title: 'Ampiezza (px)' },
        { name: 'speed', type: 'number', default: 0.05, min: 0, max: 2, precision: 3, title: 'Velocita' }
    ]
});

BgVoronoi.attributes.add('mouse', {
    type: 'json', title: 'Punti intorno al mouse',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'count', type: 'number', default: 60, min: 0, max: 300, precision: 0, step: 1, title: 'Numero massimo di punti' },
        { name: 'spawnRate', type: 'number', default: 25, min: 1, max: 500, precision: 1, title: 'Nascita (punti al secondo)' },
        { name: 'despawnRate', type: 'number', default: 60, min: 1, max: 1000, precision: 1, title: 'Scomparsa (punti al secondo)' },
        { name: 'radius', type: 'number', default: 260, min: 10, max: 2000, precision: 0, title: 'Raggio della zona fitta (px)' },
        { name: 'cluster', type: 'number', default: 1.6, min: 0.3, max: 5, precision: 2, title: 'Concentrazione al centro (alto = piu punti vicino al cursore)' },
        { name: 'follow', type: 'number', default: 40, min: 1, max: 400, precision: 0, title: 'Quanto seguono il mouse (rigidita)' },
        { name: 'jitter', type: 'number', default: 5, min: 0, max: 100, precision: 1, title: 'Tremolio (px)' },
        { name: 'jitterSpeed', type: 'number', default: 1.2, min: 0, max: 10, precision: 2, title: 'Velocita tremolio' }
    ]
});

BgVoronoi.attributes.add('shape', {
    type: 'json', title: 'Forma della zona fitta',
    schema: [
        { name: 'lag', type: 'number', default: 0.6, min: 0, max: 1, precision: 2, title: 'Ritardo dei punti esterni (effetto cometa, 0 = blocco rigido)' },
        { name: 'edgeNoise', type: 'number', default: 0.35, min: 0, max: 0.9, precision: 2, title: 'Irregolarita del bordo (0 = cerchio)' },
        { name: 'edgeDetail', type: 'number', default: 1, min: 1, max: 4, precision: 0, step: 1, title: 'Dettaglio del bordo (numero di lobi)' },
        { name: 'edgeSpeed', type: 'number', default: 0.25, min: 0, max: 3, precision: 2, title: 'Velocita di deformazione del bordo' }
    ]
});

BgVoronoi.attributes.add('trail', {
    type: 'json', title: 'Scia di punti che si staccano',
    schema: [
        { name: 'rate', type: 'number', default: 15, min: 0, max: 200, precision: 1, title: 'Punti che si staccano al secondo (a mouse veloce, 0 = nessuna scia)' },
        { name: 'refSpeed', type: 'number', default: 1500, min: 50, max: 10000, precision: 0, title: 'Velocita del mouse per il distacco massimo (px/s)' },
        { name: 'life', type: 'number', default: 2.5, min: 0.1, max: 15, precision: 2, title: 'Durata della scia (s)' },
        { name: 'drag', type: 'number', default: 3, min: 0, max: 20, precision: 2, title: 'Frenata dei punti staccati' }
    ]
});

BgVoronoi.attributes.add('physics', {
    type: 'json', title: 'Collisioni',
    schema: [
        { name: 'nearScale', type: 'number', default: 0.12, min: 0.02, max: 1, precision: 3, title: 'Dimensione celle vicino al mouse (rispetto a quelle lontane)' },
        { name: 'cellFill', type: 'number', default: 0.8, min: 0.1, max: 1.5, precision: 2, title: 'Ingombro delle celle (alto = si spingono di piu)' },
        { name: 'strength', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Forza delle collisioni' },
        { name: 'iterations', type: 'number', default: 2, min: 1, max: 6, precision: 0, step: 1, title: 'Precisione collisioni (iterazioni)' },
        { name: 'pressure', type: 'number', default: 0.6, min: 0, max: 5, precision: 2, title: 'Spinta extra sulle celle di base vicino al mouse' },
        { name: 'returnStiffness', type: 'number', default: 2.5, min: 0.1, max: 100, precision: 2, title: 'Ritorno delle celle di base (basso = scia lunga)' },
        { name: 'damping', type: 'number', default: 1, min: 0, max: 2, precision: 2, title: 'Smorzamento (0 = oscilla, 1 = senza rimbalzo)' },
        { name: 'presenceFade', type: 'number', default: 0.6, min: 0.05, max: 5, precision: 2, title: 'Transizione dimensioni quando il mouse entra/esce (s)' }
    ]
});

BgVoronoi.attributes.add('look', {
    type: 'json', title: 'Aspetto',
    schema: [
        { name: 'background', type: 'rgb', default: [1, 1, 1], title: 'Colore sfondo' },
        { name: 'lineColor', type: 'rgb', default: [0, 0, 0], title: 'Colore linee' },
        { name: 'lineWidth', type: 'number', default: 1, min: 0.25, max: 10, precision: 2, title: 'Spessore linee (px)' },
        { name: 'lineOpacity', type: 'number', default: 1, min: 0, max: 1, precision: 2, title: 'Opacita linee' },
        { name: 'dotColor', type: 'rgb', default: [0, 0, 0], title: 'Colore puntini' },
        { name: 'dotRadius', type: 'number', default: 3, min: 0.5, max: 20, precision: 2, title: 'Raggio puntini (px)' },
        { name: 'showDots', type: 'boolean', default: true, title: 'Mostra puntini' }
    ]
});

BgVoronoi.attributes.add('logoAsset', { type: 'asset', title: 'Logo (file SVG, vuoto = nessun logo)' });

BgVoronoi.attributes.add('logo', {
    type: 'json', title: 'Logo e rifrazione',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Mostra logo' },
        { name: 'size', type: 'number', default: 0.48, min: 0.05, max: 1.5, precision: 3, title: 'Larghezza (frazione della pagina)' },
        { name: 'offsetX', type: 'number', default: 0, min: -0.5, max: 0.5, precision: 3, title: 'Spostamento orizzontale (frazione pagina)' },
        { name: 'offsetY', type: 'number', default: 0, min: -0.5, max: 0.5, precision: 3, title: 'Spostamento verticale (frazione pagina)' },
        { name: 'opacity', type: 'number', default: 1, min: 0, max: 1, precision: 2, title: 'Opacita' },
        { name: 'restShift', type: 'number', default: 6, min: 0, max: 200, precision: 1, title: 'Spostamento dei pezzi a riposo (px)' },
        { name: 'activeShift', type: 'number', default: 30, min: 0, max: 300, precision: 1, title: 'Spostamento dei pezzi vicino al mouse (px)' },
        { name: 'restLens', type: 'number', default: 0.04, min: 0, max: 0.9, precision: 3, title: 'Effetto lente a riposo' },
        { name: 'activeLens', type: 'number', default: 0.15, min: 0, max: 0.9, precision: 3, title: 'Effetto lente vicino al mouse' },
        { name: 'wobble', type: 'number', default: 0.3, min: 0, max: 5, precision: 2, title: 'Velocita di oscillazione dei pezzi' }
    ]
});

BgVoronoi.MAX_MOUSE = 300;
BgVoronoi.MAX_TRAIL = 300;
BgVoronoi.GHOSTS = 8;
BgVoronoi.MAX_QUADS = 16383;   // limite degli indici a 16 bit (65535 / 4 vertici)

// ---------- Utility ----------

BgVoronoi.rng = function (seed) {
    var s = (seed * 9301 + 49297) % 233280 || 1;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
};

// Noise liscio 1D: somma di sinusoidi con fasi diverse (valore circa -1..1)
BgVoronoi.wave = function (t, p) {
    return 0.55 * Math.sin(t + p) + 0.3 * Math.sin(t * 1.73 + p * 2.1) + 0.15 * Math.sin(t * 2.97 + p * 3.7);
};

// Deformazione del bordo della zona fitta in funzione dell'angolo intorno al
// cursore (valore circa -1..1). Usa solo frequenze intere, quindi e' continua
// su tutto il giro; 'det' moltiplica il numero di lobi.
BgVoronoi.edge = function (ang, t, det) {
    return 0.5 * Math.sin(2 * det * ang + 1.3 + t) +
        0.3 * Math.sin(3 * det * ang + 4.1 - t * 1.37) +
        0.2 * Math.sin(5 * det * ang + 2.7 + t * 0.71);
};

// Fattore di scala del raggio della zona fitta in una direzione
BgVoronoi.edgeScale = function (ang, en, t, det) {
    if (en <= 0) return 1;
    var f = 1 + en * BgVoronoi.edge(ang, t, det);
    return f < 0.25 ? 0.25 : f;
};

// Raggio della "bolla" di un punto: piccola vicino al mouse, grande lontano.
// a = [cx, cy, R, rNear, pres, edgeNoise, edgeTime, edgeDetail]
BgVoronoi.bubble = function (x, y, rFar, a) {
    var dx = x - a[0], dy = y - a[1];
    var d = Math.sqrt(dx * dx + dy * dy);
    var Re = a[2];
    if (a[5] > 0 && d > 1e-3) Re *= BgVoronoi.edgeScale(Math.atan2(dy, dx), a[5], a[6], a[7]);
    var s = d / Re;
    if (s > 1) s = 1;
    s = s * s * (3 - 2 * s);
    var rr = a[3] + (rFar - a[3]) * s;
    return rFar + (rr - rFar) * a[4];
};

// ---------- Init ----------

BgVoronoi.prototype.initialize = function () {
    this.device = this.app.graphicsDevice;
    this.canvas = this.device.canvas;
    this.camera = this.cameraEntity || (this.app.root.findComponent('camera') || {}).entity;
    this.time = 0;

    this.hasMouse = false;
    this.mouseX = 0;      // pixel del canvas, origine in basso a sinistra
    this.mouseY = 0;
    this.presence = 0;    // 0..1: quanto il mouse "c'e'" (sfuma le dimensioni delle celle)
    this.lastMX = 0;
    this.lastMY = 0;
    this.prevActive = false;
    this.mSpeed = 0;      // velocita del mouse (px CSS al secondo, smussata)

    // Punti del mouse (pool)
    var MM = BgVoronoi.MAX_MOUSE;
    this.mx = new Float32Array(MM); this.my = new Float32Array(MM);
    this.mvx = new Float32Array(MM); this.mvy = new Float32Array(MM);
    this.mox = new Float32Array(MM); this.moy = new Float32Array(MM);   // offset dal cursore (frazione del raggio)
    this.mph = new Float32Array(MM * 3);                                 // fasi e velocita del tremolio
    this.mCount = 0;
    this.spawnAcc = 0;
    this.rand = BgVoronoi.rng(12345);

    // Punti della scia (staccati dalla zona fitta)
    var MT = BgVoronoi.MAX_TRAIL;
    this.tx = new Float32Array(MT); this.ty = new Float32Array(MT);
    this.tvx = new Float32Array(MT); this.tvy = new Float32Array(MT);
    this.tAge = new Float32Array(MT);
    this.tR0 = new Float32Array(MT);      // raggio della bolla al momento del distacco
    this.tRad = new Float32Array(MT);     // raggio attuale
    this.tph = new Float32Array(MT * 2);
    this.tCount = 0;
    this.detachAcc = 0;

    this.u2 = new Float32Array(2);
    this.u3 = {};
    this.u4 = new Float32Array(4);
    this.bArgs = new Float64Array(8);
    this.bgColor = new pc.Color(1, 1, 1, 1);

    // Buffer riusati
    this.dCap = 0;          // capacita delle strutture di Delaunay (numero punti)
    this.gridCap = 0;       // capacita della griglia collisioni (numero celle)
    this.order = null;      // indici dei punti ordinati per X (persistente tra i frame)
    this.orderN = 0;
    this.hashGen = 0;
    this.meshCap = 0;

    // Logo
    this.logoSvg = null;
    this.logoAspect = 1;
    this.logoTex = null;
    this.logoRasterW = 0;
    this.logoRasterH = 0;
    this.logoBusy = false;
    this.logoCanvas = document.createElement('canvas');
    this.emptyTex = new pc.Texture(this.device, {
        width: 1, height: 1, format: pc.PIXELFORMAT_RGBA8, mipmaps: false
    });
    var px = this.emptyTex.lock();
    px[0] = px[1] = px[2] = px[3] = 0;
    this.emptyTex.unlock();

    this.buildSites();
    this.buildMaterial();
    this.ensureMesh(3 * (this.baseCount + BgVoronoi.GHOSTS) + this.baseCount);

    this.meshInstance = new pc.MeshInstance(this.mesh, this.material);
    this.meshInstance.cull = false;
    this.drawEntity = new pc.Entity('BgVoronoiMesh');
    this.drawEntity.addComponent('render', {
        meshInstances: [this.meshInstance],
        castShadows: false,
        receiveShadows: false
    });
    this.app.root.addChild(this.drawEntity);

    this.on('attr:cells', this.buildSites, this);
    this.on('attr:logoAsset', this.loadLogo, this);
    this.loadLogo();

    // Rapporto tra pixel del canvas e pixel CSS (aggiornato solo al resize)
    this.updatePixelRatio();
    this.app.graphicsDevice.on('resizecanvas', this.updatePixelRatio, this);

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
        var r = self.device.width / (rect.width || 1);
        self.mouseX = cx * r;
        self.mouseY = (rect.height - cy) * r;
        self.hasMouse = true;
    };
    this.onOut = function (e) { if (!e.relatedTarget) self.hasMouse = false; };
    this.onTouchEnd = function (e) { if (!e.touches || !e.touches.length) self.hasMouse = false; };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('touchstart', this.onMove, { passive: true });
    window.addEventListener('touchmove', this.onMove, { passive: true });
    window.addEventListener('touchend', this.onTouchEnd);
    document.addEventListener('mouseout', this.onOut);

    this.on('destroy', function () {
        this.dead = true;
        window.removeEventListener('pointermove', this.onMove);
        window.removeEventListener('touchstart', this.onMove);
        window.removeEventListener('touchmove', this.onMove);
        window.removeEventListener('touchend', this.onTouchEnd);
        document.removeEventListener('mouseout', this.onOut);
        this.app.graphicsDevice.off('resizecanvas', this.updatePixelRatio, this);
        if (this.drawEntity) this.drawEntity.destroy();
        if (this.mesh) this.mesh.destroy();
        if (this.material) this.material.destroy();
        if (this.logoTex) this.logoTex.destroy();
        if (this.emptyTex) this.emptyTex.destroy();
    }, this);
};

BgVoronoi.prototype.updatePixelRatio = function () {
    var w = this.canvas.clientWidth || this.device.width;
    this.pxRatio = this.device.width / w;
};

// Posizioni di casa delle celle di base (in frazione della pagina, cosi si
// adattano al resize) + stato fisico
BgVoronoi.prototype.buildSites = function () {
    var c = this.cells;
    var rand = BgVoronoi.rng(Math.round(c.seed) + 1);
    var W = this.device.width || 1, H = this.device.height || 1;
    var N = Math.max(4, Math.round(c.count));

    // Griglia "scossa": distribuzione uniforme ma irregolare, come un Voronoi classico
    var cols = Math.max(1, Math.round(Math.sqrt(N * W / H)));
    var rows = Math.max(1, Math.ceil(N / cols));
    var mg = c.margin;
    var spanX = 1 + 2 * mg, spanY = 1 + 2 * mg;
    var home = [];
    for (var j = 0; j < rows; j++) {
        for (var i = 0; i < cols; i++) {
            if (home.length / 4 >= N) break;
            var u = -mg + (i + 0.5 + (rand() - 0.5) * c.jitter) / cols * spanX;
            var v = -mg + (j + 0.5 + (rand() - 0.5) * c.jitter) / rows * spanY;
            home.push(u, v, rand() * 100, rand() * 100);   // casa + fasi del respiro
        }
    }
    this.home = new Float32Array(home);
    this.baseCount = home.length / 4;
    this.bx = new Float32Array(this.baseCount);
    this.by = new Float32Array(this.baseCount);
    this.bvx = new Float32Array(this.baseCount);
    this.bvy = new Float32Array(this.baseCount);
    for (var b = 0; b < this.baseCount; b++) {
        this.bx[b] = this.home[b * 4] * W;
        this.by[b] = this.home[b * 4 + 1] * H;
    }

    var total = this.baseCount + BgVoronoi.MAX_MOUSE + BgVoronoi.MAX_TRAIL + BgVoronoi.GHOSTS + 3;
    this.X = new Float64Array(total);
    this.Y = new Float64Array(total);
    this.R = new Float32Array(total);
    this.PH = new Float32Array(total * 2);     // fasi casuali per punto (rifrazione del logo)
    this.gOX = new Float32Array(total);        // rifrazione per cella: offset e lente
    this.gOY = new Float32Array(total);
    this.gLens = new Float32Array(total);
    this.ensureDelaunay(total);
};

// Strutture di Delaunay dimensionate per N punti (compreso il super-triangolo)
BgVoronoi.prototype.ensureDelaunay = function (N) {
    if (this.dCap >= N) return;
    this.dCap = N;
    var T = 2 * N + 16;                           // triangoli massimi
    this.tA = new Int32Array(T); this.tB = new Int32Array(T); this.tC = new Int32Array(T);
    this.tX = new Float64Array(T); this.tY = new Float64Array(T); this.tR = new Float64Array(T);
    this.oA = new Int32Array(T); this.oB = new Int32Array(T); this.oC = new Int32Array(T);
    this.oX = new Float64Array(T); this.oY = new Float64Array(T); this.oR = new Float64Array(T);
    this.eBuf = new Int32Array(6 * T);
    this.edgeList = new Int32Array(12 * T);
    var hs = 1;
    while (hs < 6 * T) hs <<= 1;
    this.hMask = hs - 1;
    this.hKey = new Int32Array(hs);
    this.hTri = new Int32Array(hs);
    this.hGen = new Uint32Array(hs);
    this.hashGen = 0;
    var order = new Int32Array(N);
    if (this.order) order.set(this.order.subarray(0, Math.min(this.orderN, N)));
    this.order = order;
    this.orderN = Math.min(this.orderN, N);
    this.pCell = new Int32Array(N);
    this.cellItems = new Int32Array(N);
};

// Mesh con capacita per 'quads' rettangoli; viene ricreata solo quando serve
// molto piu (o molto meno) spazio, cosi alla GPU arriva solo il necessario
BgVoronoi.prototype.ensureMesh = function (quads) {
    quads = Math.min(BgVoronoi.MAX_QUADS, Math.max(64, quads));
    if (this.meshCap && quads <= this.meshCap && quads >= this.meshCap / 3) return;
    var Q = Math.min(BgVoronoi.MAX_QUADS, Math.ceil(quads * 1.3));
    this.meshCap = Q;
    this.pos = new Float32Array(Q * 12);
    this.local = new Float32Array(Q * 8);
    var idx = new Uint16Array(Q * 6);
    for (var q = 0; q < Q; q++) {
        var b = q * 4, t = q * 6;
        idx[t] = b; idx[t + 1] = b + 1; idx[t + 2] = b + 2;
        idx[t + 3] = b + 2; idx[t + 4] = b + 1; idx[t + 5] = b + 3;
    }
    var mesh = new pc.Mesh(this.device);
    mesh.setPositions(this.pos);
    mesh.setVertexStream(pc.SEMANTIC_TEXCOORD0, this.local, 2);
    mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    mesh.primitive[0].count = 0;
    var old = this.mesh;
    this.mesh = mesh;
    if (this.meshInstance) this.meshInstance.mesh = mesh;
    if (old) old.destroy();
};

BgVoronoi.prototype.buildMaterial = function () {
    var vs = this.vertexShader && this.vertexShader.resource;
    var fs = this.fragmentShader && this.fragmentShader.resource;
    if (!vs || !fs) {
        console.error('[bgVoronoi] assegna gli asset bgVoronoi.vert e bgVoronoi.frag');
        return;
    }
    this.material = new pc.ShaderMaterial({
        uniqueName: 'bgVoronoi_' + this.entity.guid,
        vertexGLSL: vs,
        fragmentGLSL: fs,
        attributes: {
            aPosition: pc.SEMANTIC_POSITION,
            aLocal: pc.SEMANTIC_TEXCOORD0
        }
    });
    this.material.cull = pc.CULLFACE_NONE;
    this.material.depthTest = false;
    this.material.depthWrite = false;
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.update();
};

// ---------- Logo ----------

// Legge il testo dell'SVG dall'asset (asset di testo o file binario)
BgVoronoi.prototype.loadLogo = function () {
    this.logoSvg = null;
    this.logoRasterW = this.logoRasterH = 0;
    var a = this.logoAsset;
    if (!a) return;
    var self = this;
    var onReady = function (asset) {
        if (self.dead || asset !== self.logoAsset) return;
        var res = asset.resource, txt = null;
        if (typeof res === 'string') txt = res;
        else if (res instanceof ArrayBuffer) txt = new TextDecoder().decode(res);
        else if (res && res.buffer instanceof ArrayBuffer) txt = new TextDecoder().decode(res);
        if (!txt || txt.indexOf('<svg') < 0) {
            console.error('[bgVoronoi] il logo deve essere un file SVG');
            return;
        }
        var vb = /viewBox\s*=\s*["']([^"']+)["']/.exec(txt);
        var p = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : null;
        self.logoAspect = (p && p[2] > 0) ? p[3] / p[2] : 1;
        self.logoSvg = txt;
    };
    if (a.loaded) onReady(a);
    else { a.ready(onReady); this.app.assets.load(a); }
};

// Disegna l'SVG in una texture alla risoluzione esatta in cui appare (nitido)
BgVoronoi.prototype.rasterizeLogo = function (w, h) {
    this.logoRasterW = w;
    this.logoRasterH = h;
    if (this.logoBusy) { this.logoAgain = true; return; }
    this.logoBusy = true;
    this.logoAgain = false;
    var svg = this.logoSvg;
    // tolgo eventuali width/height dal tag <svg> e metto quelli giusti
    svg = svg.replace(/<svg\b[^>]*>/, function (tag) {
        return tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/g, '')
            .replace(/<svg\b/, '<svg width="' + w + '" height="' + h + '" preserveAspectRatio="none"');
    });
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    var img = new Image();
    var self = this;
    var done = function () {
        URL.revokeObjectURL(url);
        self.logoBusy = false;
        if (self.dead) return;
        if (self.logoAgain) self.rasterizeLogo(self.logoRasterW, self.logoRasterH);
    };
    img.onload = function () {
        if (!self.dead) {
            var cv = self.logoCanvas;
            cv.width = w; cv.height = h;
            var ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            if (!self.logoTex || self.logoTex.width !== w || self.logoTex.height !== h) {
                if (self.logoTex) self.logoTex.destroy();
                self.logoTex = new pc.Texture(self.device, {
                    width: w, height: h,
                    format: pc.PIXELFORMAT_RGBA8,
                    mipmaps: false,
                    minFilter: pc.FILTER_LINEAR,
                    magFilter: pc.FILTER_LINEAR,
                    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
                    addressV: pc.ADDRESS_CLAMP_TO_EDGE
                });
            }
            self.logoTex.setSource(cv);
        }
        done();
    };
    img.onerror = function () {
        console.error('[bgVoronoi] impossibile leggere l\'SVG del logo');
        done();
    };
    img.src = url;
};

// Pezzo di vetro: triangolo (centro cella, due vertici del Voronoi) che mostra
// il logo letto da una posizione spostata: p - offset - (p - centro) * lente
BgVoronoi.prototype.pushGlass = function (q, sx, sy, ax, ay, bx, by, ox, oy, k) {
    var p = this.pos, l = this.local, o = q * 12, o2 = q * 8;
    p[o] = sx; p[o + 1] = sy; p[o + 2] = 2;
    p[o + 3] = ax; p[o + 4] = ay; p[o + 5] = 2;
    p[o + 6] = bx; p[o + 7] = by; p[o + 8] = 2;
    p[o + 9] = bx; p[o + 10] = by; p[o + 11] = 2;
    l[o2] = sx - ox; l[o2 + 1] = sy - oy;
    l[o2 + 2] = ax - ox - (ax - sx) * k; l[o2 + 3] = ay - oy - (ay - sy) * k;
    l[o2 + 4] = bx - ox - (bx - sx) * k; l[o2 + 5] = by - oy - (by - sy) * k;
    l[o2 + 6] = l[o2 + 4]; l[o2 + 7] = l[o2 + 5];
    return q + 1;
};

// ---------- Delaunay ----------

// Scrive nel triangolo attivo k i vertici e la circonferenza circoscritta
// (centro + raggio al quadrato)
BgVoronoi.prototype.setTri = function (k, a, b, c) {
    var X = this.X, Y = this.Y;
    this.tA[k] = a; this.tB[k] = b; this.tC[k] = c;
    var ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    var D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(D) < 1e-12) {
        this.tX[k] = 0; this.tY[k] = 0; this.tR[k] = Infinity;
        return;
    }
    var a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    var ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D;
    var uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D;
    var dx = ax - ux, dy = ay - uy;
    this.tX[k] = ux; this.tY[k] = uy; this.tR[k] = dx * dx + dy * dy;
};

// Triangolazione di Delaunay (Bowyer-Watson) sui punti 0..n-1, visitati in
// ordine di X: un triangolo il cui cerchio e' tutto a sinistra del punto
// corrente non puo piu cambiare, quindi viene spostato tra quelli "finiti" e
// non viene piu controllato. Ritorna il numero di triangoli in oA/oB/oC/oX/oY/oR.
BgVoronoi.prototype.triangulate = function (n) {
    var X = this.X, Y = this.Y;
    var order = this.order;

    // Ordine per X: i punti si muovono poco tra un frame e l'altro, quindi
    // un insertion sort sull'ordine del frame prima costa quasi niente
    if (this.orderN > n) {
        var w = 0;
        for (var i0 = 0; i0 < this.orderN; i0++) if (order[i0] < n) order[w++] = order[i0];
        this.orderN = w;
    }
    for (var i1 = this.orderN; i1 < n; i1++) order[i1] = i1;
    this.orderN = n;
    for (var i = 1; i < n; i++) {
        var v = order[i], xv = X[v], j = i - 1;
        while (j >= 0 && X[order[j]] > xv) { order[j + 1] = order[j]; j--; }
        order[j + 1] = v;
    }

    // Super-triangolo che contiene tutti i punti (indici n, n+1, n+2)
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var b = 0; b < n; b++) {
        if (X[b] < minX) minX = X[b];
        if (Y[b] < minY) minY = Y[b];
        if (X[b] > maxX) maxX = X[b];
        if (Y[b] > maxY) maxY = Y[b];
    }
    var d = Math.max(maxX - minX, maxY - minY) || 1;
    var mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    X[n] = mx - 20 * d; Y[n] = my - d;
    X[n + 1] = mx; Y[n + 1] = my + 20 * d;
    X[n + 2] = mx + 20 * d; Y[n + 2] = my - d;

    var tA = this.tA, tB = this.tB, tC = this.tC, tX = this.tX, tY = this.tY, tR = this.tR;
    var oA = this.oA, oB = this.oB, oC = this.oC, oX = this.oX, oY = this.oY, oR = this.oR;
    var E = this.eBuf;
    var na = 0, no = 0, last;
    this.setTri(na++, n, n + 1, n + 2);

    for (var s = 0; s < n; s++) {
        var p = order[s];
        var px = X[p], py = Y[p];
        var ne = 0;
        for (var k = na - 1; k >= 0; k--) {
            var dx = px - tX[k];
            if (dx > 0 && dx * dx > tR[k]) {
                // finito: sposto tra i triangoli definitivi
                oA[no] = tA[k]; oB[no] = tB[k]; oC[no] = tC[k];
                oX[no] = tX[k]; oY[no] = tY[k]; oR[no] = tR[k]; no++;
            } else {
                var dy = py - tY[k];
                if (dx * dx + dy * dy > tR[k]) continue;
                E[ne++] = tA[k]; E[ne++] = tB[k];
                E[ne++] = tB[k]; E[ne++] = tC[k];
                E[ne++] = tC[k]; E[ne++] = tA[k];
            }
            // rimuovo il triangolo k (lo sostituisco con l'ultimo attivo)
            last = --na;
            tA[k] = tA[last]; tB[k] = tB[last]; tC[k] = tC[last];
            tX[k] = tX[last]; tY[k] = tY[last]; tR[k] = tR[last];
        }
        // Tengo solo i bordi della "cavita" (quelli non condivisi)
        for (var e = 0; e < ne; e += 2) {
            if (E[e] < 0) continue;
            for (var f = e + 2; f < ne; f += 2) {
                if (E[f] < 0) continue;
                if ((E[e] === E[f] && E[e + 1] === E[f + 1]) ||
                    (E[e] === E[f + 1] && E[e + 1] === E[f])) {
                    E[e] = E[e + 1] = E[f] = E[f + 1] = -1;
                    break;
                }
            }
        }
        for (var g = 0; g < ne; g += 2) {
            if (E[g] < 0) continue;
            this.setTri(na++, E[g], E[g + 1], p);
        }
    }
    for (var r = 0; r < na; r++) {
        oA[no] = tA[r]; oB[no] = tB[r]; oC[no] = tC[r];
        oX[no] = tX[r]; oY[no] = tY[r]; oR[no] = tR[r]; no++;
    }
    return no;
};

// Tabella dei lati (hash con indirizzamento aperto). Ritorna il triangolo che
// aveva gia registrato il lato (a,b), oppure -1 e registra 'tri'.
BgVoronoi.prototype.edgeLookup = function (a, b, K, tri) {
    var key = a < b ? a * K + b : b * K + a;
    var mask = this.hMask, gen = this.hashGen;
    var hKey = this.hKey, hGen = this.hGen;
    var h = (Math.imul(key, 0x9E3779B1) >>> 0) & mask;
    while (hGen[h] === gen) {
        if (hKey[h] === key) return this.hTri[h];
        h = (h + 1) & mask;
    }
    hGen[h] = gen; hKey[h] = key; this.hTri[h] = tri;
    return -1;
};

// ---------- Collisioni ----------

// Le bolle si respingono: correzione di posizione, cercando i vicini in una
// griglia spaziale (celle grandi quanto la bolla piu grande).
// I punti da 'ts' in poi sono quelli della scia, con il loro raggio in tRad.
BgVoronoi.prototype.collide = function (n, nb, ts, rFar, strength, bArgs) {
    var X = this.X, Y = this.Y, RR = this.R, tRad = this.tRad;
    var farLimit = rFar * 0.999;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var p = 0; p < n; p++) {
        RR[p] = p < ts ? BgVoronoi.bubble(X[p], Y[p], rFar, bArgs) : tRad[p - ts];
        if (X[p] < minX) minX = X[p];
        if (Y[p] < minY) minY = Y[p];
        if (X[p] > maxX) maxX = X[p];
        if (Y[p] > maxY) maxY = Y[p];
    }
    var cs = Math.max(2 * rFar, 1);
    var gw = Math.floor((maxX - minX) / cs) + 1, gh = Math.floor((maxY - minY) / cs) + 1;
    while (gw * gh > 65536) { cs *= 2; gw = Math.floor((maxX - minX) / cs) + 1; gh = Math.floor((maxY - minY) / cs) + 1; }
    var nc = gw * gh;
    if (this.gridCap < nc + 1) {
        this.gridCap = Math.max(nc + 1, this.gridCap * 2);
        this.cellStart = new Int32Array(this.gridCap);
    }
    var start = this.cellStart, items = this.cellItems, pCell = this.pCell;
    start.fill(0, 0, nc + 1);
    var inv = 1 / cs;
    for (var a = 0; a < n; a++) {
        var c = Math.floor((X[a] - minX) * inv) + Math.floor((Y[a] - minY) * inv) * gw;
        pCell[a] = c;
        start[c + 1]++;
    }
    for (var s = 0; s < nc; s++) start[s + 1] += start[s];
    // inserisco i punti nelle celle usando start[] come contatore di posizione
    for (var b = 0; b < n; b++) items[start[pCell[b]]++] = b;
    // start[c] ora punta alla fine della cella c: ripristino gli inizi
    for (var s2 = nc; s2 > 0; s2--) start[s2] = start[s2 - 1];
    start[0] = 0;

    // stessa forza della versione originale: meta' correzione per ciascun punto
    var k = strength * 0.25;
    for (var p1 = 0; p1 < n; p1++) {
        var c1 = pCell[p1];
        var gx = c1 % gw, gy = (c1 - gx) / gw;
        var r1 = RR[p1];
        var base1 = p1 < nb && r1 >= farLimit;
        for (var oy = -1; oy <= 1; oy++) {
            var yy = gy + oy;
            if (yy < 0 || yy >= gh) continue;
            for (var ox = -1; ox <= 1; ox++) {
                var xx = gx + ox;
                if (xx < 0 || xx >= gw) continue;
                var cc = xx + yy * gw;
                for (var it = start[cc], end = start[cc + 1]; it < end; it++) {
                    var p2 = items[it];
                    if (p2 <= p1) continue;
                    // due celle di base lontane dal mouse restano dove sono (niente collisioni a riposo)
                    if (base1 && p2 < nb && RR[p2] >= farLimit) continue;
                    var dx = X[p2] - X[p1], dy = Y[p2] - Y[p1];
                    var D = r1 + RR[p2];
                    var d2 = dx * dx + dy * dy;
                    if (d2 >= D * D) continue;
                    var dist = Math.sqrt(d2) || 0.001;
                    var corr = (D - dist) / dist * k;
                    X[p1] -= dx * corr; Y[p1] -= dy * corr;
                    X[p2] += dx * corr; Y[p2] += dy * corr;
                }
            }
        }
    }
};

// ---------- Punti del mouse ----------

BgVoronoi.prototype.spawnMousePoint = function (R) {
    var i = this.mCount++;
    var rnd = this.rand;
    var m = this.mouse;
    // offset casuale, piu fitto al centro
    var d = Math.pow(rnd(), m.cluster) * 0.6;
    var a = rnd() * Math.PI * 2;
    this.mox[i] = Math.cos(a) * d;
    this.moy[i] = Math.sin(a) * d;
    // nasce vicino al cursore (un po' sparso, poi si assesta)
    this.mx[i] = this.mouseX + this.mox[i] * R * 0.5;
    this.my[i] = this.mouseY + this.moy[i] * R * 0.5;
    this.mvx[i] = 0;
    this.mvy[i] = 0;
    this.mph[i * 3] = rnd() * 100;
    this.mph[i * 3 + 1] = rnd() * 100;
    this.mph[i * 3 + 2] = 0.7 + rnd() * 0.6;
};

// Rimuove il punto del mouse i mantenendo l'ordine di nascita
BgVoronoi.prototype.removeMousePoint = function (i) {
    var n = this.mCount;
    if (i < 0 || i >= n) return;
    this.mx.copyWithin(i, i + 1, n); this.my.copyWithin(i, i + 1, n);
    this.mvx.copyWithin(i, i + 1, n); this.mvy.copyWithin(i, i + 1, n);
    this.mox.copyWithin(i, i + 1, n); this.moy.copyWithin(i, i + 1, n);
    this.mph.copyWithin(i * 3, (i + 1) * 3, n * 3);
    this.mCount = n - 1;
};

BgVoronoi.prototype.removeOldestMousePoint = function () {
    this.removeMousePoint(0);
};

// Stacca un punto dalla zona fitta (preferisce quelli esterni) e lo mette nella scia
BgVoronoi.prototype.detachMousePoint = function (rFar, bArgs) {
    if (!this.mCount || this.tCount >= BgVoronoi.MAX_TRAIL) return;
    var rnd = this.rand, best = -1, bestOff = -1;
    for (var tries = 0; tries < 3; tries++) {
        var c = Math.floor(rnd() * this.mCount);
        var off = this.mox[c] * this.mox[c] + this.moy[c] * this.moy[c];
        if (off > bestOff) { bestOff = off; best = c; }
    }
    var t = this.tCount++;
    this.tx[t] = this.mx[best]; this.ty[t] = this.my[best];
    this.tvx[t] = this.mvx[best] * 0.5; this.tvy[t] = this.mvy[best] * 0.5;
    this.tAge[t] = 0;
    this.tR0[t] = BgVoronoi.bubble(this.mx[best], this.my[best], rFar, bArgs);
    this.tRad[t] = this.tR0[t];
    this.tph[t * 2] = this.mph[best * 3];
    this.tph[t * 2 + 1] = this.mph[best * 3 + 1];
    this.removeMousePoint(best);
};

BgVoronoi.prototype.removeTrailPoint = function (i) {
    var n = this.tCount;
    this.tx.copyWithin(i, i + 1, n); this.ty.copyWithin(i, i + 1, n);
    this.tvx.copyWithin(i, i + 1, n); this.tvy.copyWithin(i, i + 1, n);
    this.tAge.copyWithin(i, i + 1, n); this.tR0.copyWithin(i, i + 1, n);
    this.tRad.copyWithin(i, i + 1, n);
    this.tph.copyWithin(i * 2, (i + 1) * 2, n * 2);
    this.tCount = n - 1;
};

// ---------- Disegno ----------

// Rettangolo sottile tra due punti (linea)
BgVoronoi.prototype.pushSegment = function (q, ax, ay, bx, by, h) {
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-4) return q;
    dx /= len; dy /= len;
    // allungo di mezzo pixel per chiudere bene gli incroci
    ax -= dx * 0.5; ay -= dy * 0.5; bx += dx * 0.5; by += dy * 0.5;
    var nx = -dy * h, ny = dx * h;
    var p = this.pos, l = this.local, o = q * 12, o2 = q * 8;
    p[o] = ax - nx; p[o + 1] = ay - ny; p[o + 2] = 0;
    p[o + 3] = ax + nx; p[o + 4] = ay + ny; p[o + 5] = 0;
    p[o + 6] = bx - nx; p[o + 7] = by - ny; p[o + 8] = 0;
    p[o + 9] = bx + nx; p[o + 10] = by + ny; p[o + 11] = 0;
    l[o2] = 0; l[o2 + 1] = -h; l[o2 + 2] = 0; l[o2 + 3] = h;
    l[o2 + 4] = 0; l[o2 + 5] = -h; l[o2 + 6] = 0; l[o2 + 7] = h;
    return q + 1;
};

// Quadrato intorno a un punto (puntino)
BgVoronoi.prototype.pushDot = function (q, x, y, s) {
    var p = this.pos, l = this.local, o = q * 12, o2 = q * 8;
    p[o] = x - s; p[o + 1] = y - s; p[o + 2] = 1;
    p[o + 3] = x + s; p[o + 4] = y - s; p[o + 5] = 1;
    p[o + 6] = x - s; p[o + 7] = y + s; p[o + 8] = 1;
    p[o + 9] = x + s; p[o + 10] = y + s; p[o + 11] = 1;
    l[o2] = -s; l[o2 + 1] = -s; l[o2 + 2] = s; l[o2 + 3] = -s;
    l[o2 + 4] = -s; l[o2 + 5] = s; l[o2 + 6] = s; l[o2 + 7] = s;
    return q + 1;
};

// ---------- Update ----------

BgVoronoi.prototype.setVec3 = function (name, c) {
    var a = this.u3[name] || (this.u3[name] = new Float32Array(3));
    if (Array.isArray(c)) { a[0] = c[0]; a[1] = c[1]; a[2] = c[2]; }
    else { a[0] = c.r; a[1] = c.g; a[2] = c.b; }
    this.material.setParameter(name, a);
};

BgVoronoi.prototype.update = function (dt) {
    if (!this.material) return;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    var t = this.time;
    var W = this.device.width, H = this.device.height;
    var r = this.pxRatio;
    var m = this.mouse, ph = this.physics, sh = this.shape, tr = this.trail;

    // ---- Presenza e velocita del mouse ----
    var active = m.enabled && this.hasMouse;
    var spd = 0;
    if (active && this.prevActive && dt > 0) {
        var vdx = this.mouseX - this.lastMX, vdy = this.mouseY - this.lastMY;
        spd = Math.sqrt(vdx * vdx + vdy * vdy) / dt / r;
    }
    this.mSpeed += (spd - this.mSpeed) * (1 - Math.exp(-dt * 8));
    this.prevActive = active;
    if (active) { this.lastMX = this.mouseX; this.lastMY = this.mouseY; }
    var target = active ? 1 : 0;
    this.presence += (target - this.presence) * (1 - Math.exp(-dt / Math.max(ph.presenceFade, 0.01) * 3));

    var R = m.radius * r;
    var maxM = Math.min(BgVoronoi.MAX_MOUSE, Math.round(m.count));
    if (active && this.mCount < maxM) {
        this.spawnAcc += m.spawnRate * dt;
        while (this.spawnAcc >= 1 && this.mCount < maxM) { this.spawnMousePoint(R); this.spawnAcc -= 1; }
    } else if (!active && this.mCount > 0) {
        this.spawnAcc += m.despawnRate * dt;
        while (this.spawnAcc >= 1 && this.mCount > 0) { this.removeOldestMousePoint(); this.spawnAcc -= 1; }
    } else {
        this.spawnAcc = 0;
    }
    while (this.mCount > maxM) this.removeOldestMousePoint();

    var cx0 = this.lastMX, cy0 = this.lastMY;   // centro della zona fitta
    var pres = this.presence;

    var nb = this.baseCount;
    var spacing = Math.sqrt(W * H / Math.max(nb, 1));
    var rFar = spacing * 0.5 * ph.cellFill;
    var rNear = rFar * ph.nearScale;

    // parametri della bolla (anche il bordo irregolare)
    var en = sh.edgeNoise, et = t * sh.edgeSpeed, edet = Math.max(1, Math.round(sh.edgeDetail));
    var bArgs = this.bArgs;
    bArgs[0] = cx0; bArgs[1] = cy0; bArgs[2] = R; bArgs[3] = rNear; bArgs[4] = pres;
    bArgs[5] = en; bArgs[6] = et; bArgs[7] = edet;

    // ---- Scia: a mouse veloce alcuni punti si staccano ----
    if (active && tr.rate > 0 && this.mCount > 0) {
        var sn = Math.min(this.mSpeed / Math.max(tr.refSpeed, 1), 1);
        this.detachAcc += tr.rate * sn * dt;
        while (this.detachAcc >= 1 && this.mCount > 0 && this.tCount < BgVoronoi.MAX_TRAIL) {
            this.detachMousePoint(rFar, bArgs);
            this.detachAcc -= 1;
        }
        if (this.detachAcc > 1) this.detachAcc = 1;
    } else {
        this.detachAcc = 0;
    }
    // invecchiano, frenano e le loro celle si allargano fino a sparire
    var life = Math.max(tr.life, 0.05), drag = Math.exp(-tr.drag * dt);
    for (var ti = this.tCount - 1; ti >= 0; ti--) {
        this.tAge[ti] += dt;
        if (this.tAge[ti] >= life) { this.removeTrailPoint(ti); continue; }
        this.tvx[ti] *= drag; this.tvy[ti] *= drag;
        this.tx[ti] += this.tvx[ti] * dt; this.ty[ti] += this.tvy[ti] * dt;
        var u = this.tAge[ti] / life;
        u = u * u * (3 - 2 * u);
        this.tRad[ti] = this.tR0[ti] + (rFar - this.tR0[ti]) * u;
    }

    // ---- Forze: molle verso casa (base) e verso il cursore (mouse) ----
    var br = this.breathe, bAmp = br.amplitude * r, bT = t * br.speed * 6.2831;
    var kH = ph.returnStiffness, cH = 2 * Math.sqrt(kH) * ph.damping;
    var home = this.home, bx = this.bx, by = this.by, bvx = this.bvx, bvy = this.bvy;
    var press = ph.pressure * pres;
    for (var i = 0; i < nb; i++) {
        var o = i * 4;
        var hx = home[o] * W + BgVoronoi.wave(bT, home[o + 2]) * bAmp;
        var hy = home[o + 1] * H + BgVoronoi.wave(bT * 0.93, home[o + 3]) * bAmp;
        var ax = kH * (hx - bx[i]) - cH * bvx[i];
        var ay = kH * (hy - by[i]) - cH * bvy[i];
        // spinta extra via dalla zona del mouse
        if (press > 0) {
            var ddx = bx[i] - cx0, ddy = by[i] - cy0;
            var dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd < R && dd > 1e-3) {
                var f = press * (1 - dd / R) * R * 4 / dd;
                ax += ddx * f;
                ay += ddy * f;
            }
        }
        bvx[i] += ax * dt; bvy[i] += ay * dt;
        bx[i] += bvx[i] * dt; by[i] += bvy[i] * dt;
    }

    // punti del mouse: i piu esterni seguono con piu ritardo (effetto cometa),
    // e la loro posizione segue la forma irregolare del bordo
    var kF = m.follow, lag = sh.lag;
    var J = m.jitter * r, jt = t * m.jitterSpeed * 6.2831;
    var mx = this.mx, my = this.my, mvx = this.mvx, mvy = this.mvy, mox = this.mox, moy = this.moy, mph = this.mph;
    for (var j = 0; j < this.mCount; j++) {
        var off = Math.sqrt(mox[j] * mox[j] + moy[j] * moy[j]);
        var on = Math.min(off / 0.6, 1);
        var jj = J * (0.25 + 0.75 * on);
        var ef = en > 0 && off > 1e-4 ? BgVoronoi.edgeScale(Math.atan2(moy[j], mox[j]), en, et, edet) : 1;
        var tx = cx0 + mox[j] * R * ef + BgVoronoi.wave(jt * mph[j * 3 + 2], mph[j * 3]) * jj;
        var ty = cy0 + moy[j] * R * ef + BgVoronoi.wave(jt * mph[j * 3 + 2] * 1.1, mph[j * 3 + 1]) * jj;
        var kj = kF * (1 - lag * 0.97 * Math.pow(on, 1.5));
        var cj = 2 * Math.sqrt(kj);
        var fx = kj * (tx - mx[j]) - cj * mvx[j];
        var fy = kj * (ty - my[j]) - cj * mvy[j];
        mvx[j] += fx * dt; mvy[j] += fy * dt;
        mx[j] += mvx[j] * dt; my[j] += mvy[j] * dt;
    }

    // ---- Collisioni: base, mouse, scia ----
    var mC = this.mCount, tC = this.tCount;
    var ts = nb + mC;
    var n = ts + tC;
    var X = this.X, Y = this.Y, PH = this.PH;
    for (var a1 = 0; a1 < nb; a1++) {
        X[a1] = bx[a1]; Y[a1] = by[a1];
        PH[a1 * 2] = home[a1 * 4 + 2]; PH[a1 * 2 + 1] = home[a1 * 4 + 3];
    }
    for (var a2 = 0; a2 < mC; a2++) {
        var ia = nb + a2;
        X[ia] = mx[a2]; Y[ia] = my[a2];
        PH[ia * 2] = mph[a2 * 3]; PH[ia * 2 + 1] = mph[a2 * 3 + 1];
    }
    for (var a3 = 0; a3 < tC; a3++) {
        var ib = ts + a3;
        X[ib] = this.tx[a3]; Y[ib] = this.ty[a3];
        PH[ib * 2] = this.tph[a3 * 2]; PH[ib * 2 + 1] = this.tph[a3 * 2 + 1];
    }

    var iters = Math.max(1, Math.round(ph.iterations));
    for (var it = 0; it < iters; it++) this.collide(n, nb, ts, rFar, ph.strength, bArgs);

    // riporto le posizioni corrette nello stato fisico
    for (var b1 = 0; b1 < nb; b1++) { bx[b1] = X[b1]; by[b1] = Y[b1]; }
    for (var b2 = 0; b2 < mC; b2++) { mx[b2] = X[nb + b2]; my[b2] = Y[nb + b2]; }
    for (var b3 = 0; b3 < tC; b3++) { this.tx[b3] = X[ts + b3]; this.ty[b3] = Y[ts + b3]; }

    // ---- Punti "fantasma" lontani: chiudono le celle dei bordi fuori dallo schermo ----
    var real = n;
    var gcx = W / 2, gcy = H / 2, G = Math.max(W, H) * 3;
    for (var g = 0; g < BgVoronoi.GHOSTS; g++) {
        var ga = g / BgVoronoi.GHOSTS * Math.PI * 2;
        X[n] = gcx + Math.cos(ga) * G;
        Y[n] = gcy + Math.sin(ga) * G;
        n++;
    }

    // ---- Delaunay -> lati del Voronoi: ogni lato condiviso da due triangoli collega i due centri ----
    var look = this.look;
    var nt = this.triangulate(n);
    var oA = this.oA, oB = this.oB, oC = this.oC, oX = this.oX, oY = this.oY, oR = this.oR;
    var EL = this.edgeList, nE = 0;
    if (++this.hashGen > 0xFFFFFFF0) { this.hGen.fill(0); this.hashGen = 1; }
    for (var k = 0; k < nt; k++) {
        for (var e = 0; e < 3; e++) {
            var va = e === 0 ? oA[k] : (e === 1 ? oB[k] : oC[k]);
            var vb = e === 0 ? oB[k] : (e === 1 ? oC[k] : oA[k]);
            if (va >= n || vb >= n) continue;              // lati del super-triangolo
            var other = this.edgeLookup(va, vb, n, k);
            if (other < 0) continue;
            if (va >= real && vb >= real) continue;        // tra due fantasmi: fuori schermo
            if (oR[k] === Infinity || oR[other] === Infinity) continue;
            EL[nE++] = k; EL[nE++] = other; EL[nE++] = va; EL[nE++] = vb;
        }
    }

    // ---- Logo: rettangolo, texture e rifrazione di ogni cella ----
    var lg = this.logo;
    var drawLogo = lg.enabled && this.logoSvg;
    var lx = 0, ly = 0, lw = 0, lh = 0, nGlass = 0;
    var gx0 = 0, gy0 = 0, gx1 = 0, gy1 = 0;
    if (drawLogo) {
        lw = lg.size * W;
        lh = lw * this.logoAspect;
        lx = W * 0.5 - lw * 0.5 + lg.offsetX * W;
        ly = H * 0.5 - lh * 0.5 + lg.offsetY * H;
        var rw = Math.max(1, Math.min(4096, Math.round(lw)));
        var rh = Math.max(1, Math.min(4096, Math.round(lh)));
        if (Math.abs(rw - this.logoRasterW) > 1 || Math.abs(rh - this.logoRasterH) > 1) this.rasterizeLogo(rw, rh);
        drawLogo = !!this.logoTex;
    }
    if (drawLogo) {
        // area in cui un pezzo di vetro puo mostrare il logo
        var maxShift = (lg.restShift + lg.activeShift) * r;
        var mgx = maxShift + lw * 0.5, mgy = maxShift + lh * 0.5;
        gx0 = lx - mgx; gy0 = ly - mgy; gx1 = lx + lw + mgx; gy1 = ly + lh + mgy;

        // rifrazione per cella: vicino al mouse (celle piccole) piu forte
        var gOX = this.gOX, gOY = this.gOY, gL = this.gLens;
        var wt = t * lg.wobble;
        for (var c = 0; c < real; c++) {
            var dxm = X[c] - cx0, dym = Y[c] - cy0;
            var s = Math.sqrt(dxm * dxm + dym * dym) / R;
            if (s > 1) s = 1;
            s = s * s * (3 - 2 * s);
            var prox = (1 - s) * pres;
            var pa = PH[c * 2], pb = PH[c * 2 + 1];
            var amt = (lg.restShift + lg.activeShift * prox) * r;
            var ang = pa * 6.2831 + BgVoronoi.wave(wt, pb) * 1.2;
            gOX[c] = Math.cos(ang) * amt;
            gOY[c] = Math.sin(ang) * amt;
            // lente: alcune celle ingrandiscono, altre rimpiccioliscono
            var lens = (lg.restLens + lg.activeLens * prox) * Math.sin(pb * 3.1 + BgVoronoi.wave(wt * 0.7, pa) * 0.5);
            gL[c] = lens > 0.9 ? 0.9 : lens;
        }

        // conto i pezzi di vetro che toccano l'area del logo
        for (var ce = 0; ce < nE; ce += 4) {
            var ka = EL[ce], kb = EL[ce + 1];
            var exMin = Math.min(oX[ka], oX[kb]), exMax = Math.max(oX[ka], oX[kb]);
            var eyMin = Math.min(oY[ka], oY[kb]), eyMax = Math.max(oY[ka], oY[kb]);
            for (var sIdx = 2; sIdx < 4; sIdx++) {
                var st = EL[ce + sIdx];
                if (st >= real) continue;
                if (Math.max(exMax, X[st]) < gx0 || Math.min(exMin, X[st]) > gx1 ||
                    Math.max(eyMax, Y[st]) < gy0 || Math.min(eyMin, Y[st]) > gy1) continue;
                nGlass++;
            }
        }
    }

    this.ensureMesh(nGlass + nE / 4 + (look.showDots ? real : 0));
    var halfT = look.lineWidth * r * 0.5;
    var hq = halfT + 1;
    var q = 0, MAXQ = this.meshCap;

    // 1) pezzi di vetro con il logo (sotto le linee)
    if (drawLogo) {
        for (var ge = 0; ge < nE && q < MAXQ; ge += 4) {
            var k1 = EL[ge], k2 = EL[ge + 1];
            var ax1 = oX[k1], ay1 = oY[k1], bx1 = oX[k2], by1 = oY[k2];
            var eMinX = Math.min(ax1, bx1), eMaxX = Math.max(ax1, bx1);
            var eMinY = Math.min(ay1, by1), eMaxY = Math.max(ay1, by1);
            for (var si = 2; si < 4 && q < MAXQ; si++) {
                var sc = EL[ge + si];
                if (sc >= real) continue;
                var sx = X[sc], sy = Y[sc];
                if (Math.max(eMaxX, sx) < gx0 || Math.min(eMinX, sx) > gx1 ||
                    Math.max(eMaxY, sy) < gy0 || Math.min(eMinY, sy) > gy1) continue;
                q = this.pushGlass(q, sx, sy, ax1, ay1, bx1, by1, this.gOX[sc], this.gOY[sc], this.gLens[sc]);
            }
        }
    }

    // 2) linee del Voronoi
    for (var le = 0; le < nE && q < MAXQ; le += 4) {
        var t1 = EL[le], t2 = EL[le + 1];
        q = this.pushSegment(q, oX[t1], oY[t1], oX[t2], oY[t2], hq);
    }

    // 3) puntini
    var dotR = look.dotRadius * r;
    if (look.showDots) {
        for (var dd2 = 0; dd2 < real && q < MAXQ; dd2++) {
            q = this.pushDot(q, X[dd2], Y[dd2], dotR + 1);
        }
    }

    this.mesh.setPositions(this.pos);
    this.mesh.setVertexStream(pc.SEMANTIC_TEXCOORD0, this.local, 2);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    this.mesh.primitive[0].count = q * 6;

    // Uniform
    var mat = this.material;
    this.u2[0] = W;
    this.u2[1] = H;
    mat.setParameter('uResolution', this.u2);
    mat.setParameter('uHalfThickness', halfT);
    mat.setParameter('uDotRadius', dotR);
    mat.setParameter('uLineOpacity', look.lineOpacity);
    this.setVec3('uLineColor', look.lineColor);
    this.setVec3('uDotColor', look.dotColor);
    this.u4[0] = lx; this.u4[1] = ly; this.u4[2] = lw || 1; this.u4[3] = lh || 1;
    mat.setParameter('uLogoRect', this.u4);
    mat.setParameter('uLogo', drawLogo ? this.logoTex : this.emptyTex);
    mat.setParameter('uLogoOpacity', lg.opacity);

    // Colore di sfondo sulla camera
    if (this.camera && this.camera.camera) {
        var bg = look.background;
        var cr = Array.isArray(bg) ? bg[0] : bg.r, cg = Array.isArray(bg) ? bg[1] : bg.g, cb = Array.isArray(bg) ? bg[2] : bg.b;
        var cc = this.camera.camera.clearColor;
        if (cc.r !== cr || cc.g !== cg || cc.b !== cb) {
            this.bgColor.set(cr, cg, cb, 1);
            this.camera.camera.clearColor = this.bgColor;
        }
    }
};
