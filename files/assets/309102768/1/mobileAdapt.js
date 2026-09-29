// mobileAdapt.js
// Adatta gli effetti alle dimensioni dello schermo (telefono, finestra piccola,
// schermo verticale) senza toccare le impostazioni scelte nell'Inspector.
// Va messo sulla stessa entita di bgVoronoi oppure di datamosh (+ blobTrack).
//
// I valori in pixel degli altri script sono stati regolati su uno schermo di
// riferimento (il lato corto del monitor). Su uno schermo piu piccolo vengono
// ridotti nella stessa proporzione, cosi l'effetto sembra uguale, solo piu piccolo.
// Inoltre:
//  - gravita e raggio del mouse del datamosh si misurano sul lato corto dello
//    schermo (e non sull'altezza), cosi in verticale non corrono troppo
//  - con lo schermo verticale il logo usa una sua larghezza (nel file SVG il
//    disegno occupa circa il 61% della larghezza: 1.5 = disegno quasi a filo dei bordi)
//  - sugli schermi stretti la soglia di rumore della webcam e' piu alta
// Si riapplica quando la finestra cambia misura o si gira il telefono.
var MobileAdapt = pc.createScript('mobileAdapt');

MobileAdapt.attributes.add('refSize', { type: 'number', default: 1280, min: 200, max: 4000, precision: 0, title: 'Lato corto dello schermo di riferimento (px)' });
MobileAdapt.attributes.add('minScale', { type: 'number', default: 0.2, min: 0.05, max: 1, precision: 2, title: 'Riduzione massima (scala minima)' });
MobileAdapt.attributes.add('maxScale', { type: 'number', default: 1, min: 1, max: 3, precision: 2, title: 'Ingrandimento massimo sugli schermi grandi' });
MobileAdapt.attributes.add('portraitLogo', { type: 'number', default: 1.5, min: 0.05, max: 3, precision: 3, title: 'Larghezza del logo con lo schermo verticale (1.5 = quasi a filo dei bordi)' });
MobileAdapt.attributes.add('breakpoint', { type: 'number', default: 820, min: 200, max: 3000, precision: 0, title: 'Larghezza sotto cui e\' uno schermo stretto (px)' });
MobileAdapt.attributes.add('webcamThreshold', { type: 'number', default: 0.06, min: 0, max: 0.3, precision: 3, title: 'Soglia di rumore della webcam sugli schermi stretti' });

MobileAdapt.prototype.postInitialize = function () {
    this.base = null;
    this.lastKey = '';
    this.apply();
    var self = this;
    this.onResize = function () { self.apply(); };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    this.on('attr:portraitLogo', function () { this.lastKey = ''; this.apply(); }, this);
    this.on('destroy', function () {
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('orientationchange', this.onResize);
    }, this);
};

// copia dei valori originali (quelli dell'Inspector), letta una volta sola
MobileAdapt.prototype.readBase = function () {
    var s = this.entity.script, b = {};
    var v = s.bgVoronoi, d = s.datamosh, t = s.blobTrack;
    if (v) {
        b.v = {
            radius: v.mouse.radius, jitter: v.mouse.jitter, breathe: v.breathe.amplitude,
            restShift: v.logo.restShift, activeShift: v.logo.activeShift, logoSize: v.logo.size,
            refSpeed: v.trail ? v.trail.refSpeed : 0
        };
    }
    if (d) {
        b.d = {
            maxB: d.blocks.maxSize, minB: d.blocks.minSize, lineT: d.blocks.lineThickness, chroma: d.mosh.chroma,
            mouseR: d.mouse.radius, gStrength: d.gravity.strength, gMax: d.gravity.maxSpeed,
            logoSize: d.logo.size, threshold: d.webcam.threshold
        };
    }
    if (t) b.t = { minS: t.blobs.minSize, maxS: t.blobs.maxSize };
    return b;
};

MobileAdapt.prototype.apply = function () {
    if (!this.base) this.base = this.readBase();
    var b = this.base, s = this.entity.script;
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    var shortSide = Math.min(w, h);
    var k = pc.math.clamp(shortSide / this.refSize, this.minScale, this.maxScale);
    var portrait = h > w;
    var narrow = w <= this.breakpoint;
    var shortOverH = shortSide / h;           // da altezze dello schermo a lati corti
    var key = [w, h].join('x');
    if (key === this.lastKey) return;
    this.lastKey = key;

    var v = s.bgVoronoi;
    if (v && b.v) {
        v.mouse.radius = b.v.radius * k;
        v.mouse.jitter = b.v.jitter * k;
        v.breathe.amplitude = b.v.breathe * k;
        v.logo.restShift = b.v.restShift * k;
        v.logo.activeShift = b.v.activeShift * k;
        v.logo.size = portrait ? this.portraitLogo : b.v.logoSize;
        if (v.trail) v.trail.refSpeed = b.v.refSpeed * k;
    }

    var d = s.datamosh;
    if (d && b.d) {
        d.blocks.maxSize = Math.max(2, b.d.maxB * k);
        d.blocks.minSize = Math.max(1, b.d.minB * Math.max(k, 0.5));
        d.blocks.lineThickness = Math.max(1, Math.round(b.d.lineT * Math.max(k, 0.5)));
        d.mosh.chroma = b.d.chroma * k;
        d.mouse.radius = b.d.mouseR * shortOverH;
        d.gravity.strength = b.d.gStrength * shortOverH;
        d.gravity.maxSpeed = b.d.gMax * shortOverH;
        d.webcam.threshold = narrow ? Math.max(b.d.threshold, this.webcamThreshold) : b.d.threshold;
        var newSize = portrait ? this.portraitLogo : b.d.logoSize;
        if (newSize !== d.logo.size) {
            d.logo.size = newSize;
            if (d.drawLogo) d.drawLogo();
        }
    }

    var t = s.blobTrack;
    if (t && b.t) {
        t.blobs.minSize = Math.max(4, b.t.minS * Math.max(k, 0.5));
        t.blobs.maxSize = Math.max(t.blobs.minSize + 4, b.t.maxS * k);
    }
};
