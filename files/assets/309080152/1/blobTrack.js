// blobTrack.js
// Blob tracking in sovrimpressione: trova le zone in movimento nella webcam,
// le segue da un frame all'altro e disegna su ognuna un mirino quadrato (che
// cambia dimensione con la zona) e dei numeri "tecnici" (ID, posizione, misura)
// con 4 cifre dopo la virgola che sfarfallano.
// In piu, un blob agganciato al mouse: compare quando il mouse si muove ed e'
// tanto piu grande quanto piu il mouse va veloce.
// Usa la webcam e il mouse dello script datamosh sulla stessa entita.
// Pulsante "Blob" in alto a sinistra (sotto "Invert") per accenderli e spegnerli.
//
// Come trova i blob: il video viene rimpicciolito (80 x 60 circa), si confronta
// ogni frame con il precedente, i pixel cambiati formano una maschera e i gruppi
// di pixel vicini (componenti connesse) diventano i blob. Tutto sulla CPU, leggero.
// La misura del mirino dipende da quanto movimento c'e' nella zona (la sua area):
// zone piccole = mirino piccolo, zone grandi = mirino grande.
var BlobTrack = pc.createScript('blobTrack');

BlobTrack.attributes.add('blobs', {
    type: 'json', title: 'Blob',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'showButton', type: 'boolean', default: true, title: 'Mostra il pulsante in alto a sinistra' },
        { name: 'buttonLabel', type: 'string', default: 'Blob', title: 'Scritta del pulsante' },
        { name: 'count', type: 'number', default: 8, min: 1, max: 40, precision: 0, step: 1, title: 'Numero massimo di blob' },
        { name: 'color', type: 'rgb', default: [1, 0.9, 0.1], title: 'Colore del mirino' },
        { name: 'opacity', type: 'number', default: 1, min: 0, max: 1, precision: 2, title: 'Opacita del mirino' },
        { name: 'lineWidth', type: 'number', default: 1.5, min: 0.5, max: 6, precision: 1, title: 'Spessore linee (px)' },
        { name: 'corner', type: 'number', default: 0.25, min: 0.05, max: 0.5, precision: 2, title: 'Lunghezza degli angoli (0.5 = quadrato pieno)' },
        { name: 'cross', type: 'boolean', default: true, title: 'Crocetta al centro' },
        { name: 'minSize', type: 'number', default: 28, min: 4, max: 400, precision: 0, title: 'Misura minima del mirino (px)' },
        { name: 'maxSize', type: 'number', default: 360, min: 20, max: 2000, precision: 0, title: 'Misura massima del mirino (px)' },
        { name: 'bigArea', type: 'number', default: 0.04, min: 0.002, max: 0.5, precision: 3, title: 'Zona che da il mirino piu grande (frazione dell\'inquadratura)' },
        { name: 'sizeCurve', type: 'number', default: 0.6, min: 0.1, max: 3, precision: 2, title: 'Differenza tra le misure (basso = piu grandi, alto = piu piccoli)' },
        { name: 'smoothing', type: 'number', default: 0.12, min: 0, max: 1, precision: 2, title: 'Morbidezza del movimento (s)' }
    ]
});

BlobTrack.attributes.add('mouseBlob', {
    type: 'json', title: 'Blob del mouse',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'speedForMax', type: 'number', default: 1.5, min: 0.05, max: 10, precision: 2, title: 'Velocita per il mirino piu grande (schermi al secondo)' },
        { name: 'minSpeed', type: 'number', default: 0.05, min: 0, max: 2, precision: 3, title: 'Velocita minima per farlo comparire' },
        { name: 'hold', type: 'number', default: 0.4, min: 0, max: 5, precision: 2, title: 'Quanto resta quando il mouse si ferma (s)' },
        { name: 'sizeSmoothing', type: 'number', default: 0.15, min: 0, max: 2, precision: 2, title: 'Morbidezza del cambio di misura (s)' },
        { name: 'ownColor', type: 'boolean', default: false, title: 'Colore diverso dagli altri blob' },
        { name: 'color', type: 'rgb', default: [1, 0.2, 0.2], title: 'Colore del mirino del mouse' }
    ]
});

BlobTrack.attributes.add('detect', {
    type: 'json', title: 'Rilevamento',
    schema: [
        { name: 'threshold', type: 'number', default: 0.08, min: 0.01, max: 0.5, precision: 3, title: 'Soglia di movimento (alto = solo movimenti forti)' },
        { name: 'minArea', type: 'number', default: 6, min: 1, max: 400, precision: 0, title: 'Area minima di un blob (celle)' },
        { name: 'hold', type: 'number', default: 0.5, min: 0, max: 5, precision: 2, title: 'Quanto resta un blob quando il movimento finisce (s)' },
        { name: 'match', type: 'number', default: 0.15, min: 0.02, max: 0.6, precision: 2, title: 'Distanza per riconoscere lo stesso blob (frazione schermo)' },
        { name: 'resolution', type: 'number', default: 80, min: 32, max: 200, precision: 0, step: 1, title: 'Risoluzione di analisi (larghezza)' }
    ]
});

BlobTrack.attributes.add('labels', {
    type: 'json', title: 'Numeri',
    schema: [
        { name: 'show', type: 'boolean', default: true, title: 'Mostra i numeri' },
        { name: 'color', type: 'rgb', default: [0, 1, 1], title: 'Colore dei numeri' },
        { name: 'opacity', type: 'number', default: 1, min: 0, max: 1, precision: 2, title: 'Opacita dei numeri' },
        { name: 'fontSize', type: 'number', default: 11, min: 6, max: 32, precision: 0, title: 'Dimensione (px)' },
        { name: 'font', type: 'string', default: 'Menlo, Consolas, monospace', title: 'Font' },
        { name: 'flicker', type: 'number', default: 8, min: 0, max: 60, precision: 1, title: 'Sfarfallio delle cifre (volte al secondo, 0 = fermo)' },
        { name: 'lines', type: 'number', default: 4, min: 1, max: 4, precision: 0, step: 1, title: 'Righe (1 = ID, 2 = +X, 3 = +Y, 4 = +S)' }
    ]
});

BlobTrack.toCss = function (c, a) {
    var r = Array.isArray(c) ? c[0] : c.r, g = Array.isArray(c) ? c[1] : c.g, b = Array.isArray(c) ? c[2] : c.b;
    return 'rgba(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ',' + a + ')';
};

BlobTrack.prototype.initialize = function () {
    this.tracks = [];
    this.nextId = 1;
    this.lastVideoTime = -1;
    this.prevLuma = null;
    this.time = 0;
    this.flickT = 0;
    this.mt = null;          // blob del mouse

    // canvas piccolo per l'analisi della webcam
    this.small = document.createElement('canvas');
    this.sctx = this.small.getContext('2d', { willReadFrequently: true });

    // canvas di disegno sopra la pagina
    var cv = this.overlay = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    document.body.appendChild(cv);
    this.octx = cv.getContext('2d');

    this.on('attr:blobs', this.refreshButton, this);

    this.on('destroy', function () {
        if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
        if (this.btn && this.btn.parentNode) this.btn.parentNode.removeChild(this.btn);
    }, this);
};

// Il pulsante va sotto "Invert", nello stesso riquadro (creato da datamosh in initialize)
BlobTrack.prototype.postInitialize = function () {
    var dm = this.entity.script && this.entity.script.datamosh;
    var wrap = dm && dm.invertWrap;
    if (!wrap) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.style.marginTop = '0.6em';
    var box = document.createElement('span');
    box.className = 'box';
    this.btnLabel = document.createElement('span');
    btn.appendChild(box);
    btn.appendChild(this.btnLabel);
    var self = this;
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.blobs.enabled = !self.blobs.enabled;
        self.refreshButton();
    });
    wrap.appendChild(btn);
    this.btn = btn;
    this.refreshButton();
};

BlobTrack.prototype.refreshButton = function () {
    if (!this.btn) return;
    var bl = this.blobs;
    this.btn.style.display = bl.showButton === false ? 'none' : 'flex';
    this.btnLabel.textContent = bl.buttonLabel || 'Blob';
    this.btn.classList.toggle('on', !!bl.enabled);
};

// Analizza un nuovo frame della webcam e restituisce i blob (in uv del video, 0..1, gia specchiati)
BlobTrack.prototype.findBlobs = function (video) {
    var cfg = this.detect;
    var w = Math.max(16, Math.round(cfg.resolution));
    var h = Math.max(12, Math.round(w * video.videoHeight / Math.max(1, video.videoWidth)));
    if (this.small.width !== w || this.small.height !== h) {
        this.small.width = w; this.small.height = h;
        this.prevLuma = null;
    }
    var ctx = this.sctx;
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, w, 0);         // specchiato, come l'anteprima
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
    var px = ctx.getImageData(0, 0, w, h).data;
    var n = w * h;
    var luma = new Float32Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) luma[i] = (px[j] * 0.299 + px[j + 1] * 0.587 + px[j + 2] * 0.114) / 255;
    var prev = this.prevLuma;
    this.prevLuma = luma;
    if (!prev) return [];

    // maschera dei pixel cambiati
    var thr = cfg.threshold;
    var mask = new Uint8Array(n);
    for (var k = 0; k < n; k++) mask[k] = Math.abs(luma[k] - prev[k]) > thr ? 1 : 0;
    // piccola dilatazione: unisce pezzi vicini dello stesso oggetto
    var dil = new Uint8Array(n);
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            if (!mask[y * w + x]) continue;
            for (var oy = -1; oy <= 1; oy++) {
                var yy = y + oy; if (yy < 0 || yy >= h) continue;
                for (var ox = -1; ox <= 1; ox++) {
                    var xx = x + ox; if (xx < 0 || xx >= w) continue;
                    dil[yy * w + xx] = 1;
                }
            }
        }
    }
    // componenti connesse (flood fill); l'area conta solo i pixel davvero cambiati
    var label = new Int32Array(n);
    var stack = new Int32Array(n);
    var blobs = [];
    var cur = 0;
    for (var s = 0; s < n; s++) {
        if (!dil[s] || label[s]) continue;
        cur++;
        var sp = 0; stack[sp++] = s; label[s] = cur;
        var area = 0, moved = 0, sx = 0, sy = 0;
        while (sp > 0) {
            var p = stack[--sp];
            var px0 = p % w, py0 = (p - px0) / w;
            area++; moved += mask[p]; sx += px0; sy += py0;
            if (px0 > 0 && dil[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1; }
            if (px0 < w - 1 && dil[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1; }
            if (py0 > 0 && dil[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w; }
            if (py0 < h - 1 && dil[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w; }
        }
        if (area < cfg.minArea) continue;
        blobs.push({ x: (sx / area + 0.5) / w, y: (sy / area + 0.5) / h, area: moved / n });
    }
    blobs.sort(function (a, b) { return b.area - a.area; });
    return blobs.slice(0, Math.max(1, Math.round(this.blobs.count)));
};

// Aggancia i blob nuovi a quelli gia seguiti (il piu vicino), crea i nuovi
BlobTrack.prototype.track = function (found) {
    var tracks = this.tracks;
    var maxD = this.detect.match;
    for (var t = 0; t < tracks.length; t++) tracks[t].matched = false;
    for (var i = 0; i < found.length; i++) {
        var f = found[i], best = -1, bestD = maxD;
        for (var k = 0; k < tracks.length; k++) {
            if (tracks[k].matched) continue;
            var dx = tracks[k].tx - f.x, dy = tracks[k].ty - f.y;
            var dd = Math.sqrt(dx * dx + dy * dy);
            if (dd < bestD) { bestD = dd; best = k; }
        }
        if (best >= 0) {
            var tr = tracks[best];
            tr.tx = f.x; tr.ty = f.y; tr.ta = f.area;
            tr.matched = true; tr.lastSeen = this.time;
        } else if (tracks.length < Math.round(this.blobs.count)) {
            tracks.push({
                id: this.newId(), x: f.x, y: f.y, tx: f.x, ty: f.y, a: f.area, ta: f.area,
                matched: true, lastSeen: this.time, born: this.time, jit: [0.5, 0.5, 0.5]
            });
        }
    }
};

BlobTrack.prototype.newId = function () {
    var id = this.nextId;
    this.nextId = this.nextId % 99 + 1;
    return id;
};

// Disegna un mirino con i suoi numeri. cx, cy, size in pixel CSS; nx, ny, ns = numeri mostrati
BlobTrack.prototype.drawBlob = function (ctx, cw, cx, cy, size, alpha, id, nx, ny, ns, jit, lineCol, txtCol) {
    var bl = this.blobs, lb = this.labels;
    var hs = size * 0.5;
    var x0 = cx - hs, y0 = cy - hs, x1 = cx + hs, y1 = cy + hs;
    var cl = size * bl.corner;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = lineCol;
    ctx.beginPath();
    // angoli del mirino quadrato
    ctx.moveTo(x0, y0 + cl); ctx.lineTo(x0, y0); ctx.lineTo(x0 + cl, y0);
    ctx.moveTo(x1 - cl, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + cl);
    ctx.moveTo(x1, y1 - cl); ctx.lineTo(x1, y1); ctx.lineTo(x1 - cl, y1);
    ctx.moveTo(x0 + cl, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - cl);
    if (bl.cross) {
        var cs = Math.max(3, size * 0.06);
        ctx.moveTo(cx - cs, cy); ctx.lineTo(cx + cs, cy);
        ctx.moveTo(cx, cy - cs); ctx.lineTo(cx, cy + cs);
    }
    ctx.stroke();

    if (!lb.show) return;
    var jx = (jit[0] - 0.5) * 0.002, jy = (jit[1] - 0.5) * 0.002, js = (jit[2] - 0.5) * 0.002;
    var rows = ['ID ' + (id < 10 ? '0' : '') + id];
    if (lb.lines >= 2) rows.push('X ' + Math.abs(nx + jx).toFixed(4));
    if (lb.lines >= 3) rows.push('Y ' + Math.abs(ny + jy).toFixed(4));
    if (lb.lines >= 4) rows.push('S ' + Math.abs(ns + js).toFixed(4));
    ctx.fillStyle = txtCol;
    var lh = lb.fontSize * 1.2;
    var tx = x1 + 6, ty = y0;
    // se esce a destra, metto i numeri a sinistra del mirino
    var maxW = 0;
    for (var r = 0; r < rows.length; r++) maxW = Math.max(maxW, ctx.measureText(rows[r]).width);
    if (tx + maxW > cw - 4) tx = x0 - 6 - maxW;
    for (var q = 0; q < rows.length; q++) ctx.fillText(rows[q], tx, ty + q * lh);
};

BlobTrack.prototype.update = function (dt) {
    this.time += dt;
    var cv = this.overlay, ctx = this.octx;
    var dpr = window.devicePixelRatio || 1;
    var cw = window.innerWidth, ch = window.innerHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
        cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    var bl = this.blobs;
    var dm = this.entity.script && this.entity.script.datamosh;
    if (!bl.enabled || !dm) { this.tracks.length = 0; this.mt = null; return; }
    var lb = this.labels, hold = this.detect.hold;
    var k = bl.smoothing > 0 ? 1 - Math.exp(-dt / bl.smoothing) : 1;
    var minS = Math.min(bl.minSize, bl.maxSize), maxS = Math.max(bl.minSize, bl.maxSize);

    // sfarfallio delle ultime cifre
    var flick = false;
    if (lb.flicker > 0) {
        this.flickT += dt;
        if (this.flickT >= 1 / lb.flicker) { this.flickT = 0; flick = true; }
    }

    var lineCol = BlobTrack.toCss(bl.color, bl.opacity);
    var txtCol = BlobTrack.toCss(lb.color, lb.opacity);
    ctx.lineWidth = bl.lineWidth;
    ctx.font = lb.fontSize + 'px ' + lb.font;
    ctx.textBaseline = 'top';

    // ---- blob della webcam ----
    var video = dm.camReady && dm.video;
    if (video && video.readyState >= 2) {
        // analisi solo quando arriva un frame nuovo
        if (video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = video.currentTime;
            this.track(this.findBlobs(video));
        }
        // la webcam copre lo schermo (come background-size: cover): da uv del video a pixel
        var vA = video.videoWidth / Math.max(1, video.videoHeight), sA = cw / ch;
        var sx = 1, sy = 1;
        if (sA > vA) sy = vA / sA; else sx = sA / vA;

        var tracks = this.tracks;
        for (var i = tracks.length - 1; i >= 0; i--) {
            var t = tracks[i];
            if (this.time - t.lastSeen > hold + 0.25) { tracks.splice(i, 1); continue; }
            t.x += (t.tx - t.x) * k; t.y += (t.ty - t.y) * k;
            t.a += (t.ta - t.a) * k;
        }
        for (var j = 0; j < tracks.length; j++) {
            var tr = tracks[j];
            var fadeIn = Math.min(1, (this.time - tr.born) / 0.15);
            var gone = this.time - tr.lastSeen;
            var fadeOut = gone > hold ? Math.max(0, 1 - (gone - hold) / 0.25) : 1;
            var a = fadeIn * fadeOut;
            if (a <= 0) continue;
            if (flick) tr.jit = [Math.random(), Math.random(), Math.random()];
            var st = Math.min(1, Math.max(0, tr.a / Math.max(bl.bigArea, 1e-4)));
            var size = minS + (maxS - minS) * Math.pow(st, bl.sizeCurve);
            this.drawBlob(ctx, cw,
                (0.5 + (tr.x - 0.5) / sx) * cw, (0.5 + (tr.y - 0.5) / sy) * ch, size, a,
                tr.id, tr.x, 1 - tr.y, tr.a, tr.jit, lineCol, txtCol);
        }
    } else {
        this.tracks.length = 0;
    }

    // ---- blob agganciato al mouse ----
    var mb = this.mouseBlob;
    if (mb.enabled && dm.mouse && dm.mouse.enabled) {
        var aspect = cw / ch;
        var speed = Math.sqrt(dm.mVelX * dm.mVelX * aspect * aspect + dm.mVelY * dm.mVelY);   // altezze dello schermo al secondo
        var moving = dm.hasMouse && speed > mb.minSpeed;
        var m = this.mt;
        if (moving) {
            if (!m) m = this.mt = { id: this.newId(), s: 0, born: this.time, last: this.time, jit: [0.5, 0.5, 0.5] };
            m.last = this.time;
            var ts = Math.pow(Math.min(1, speed / Math.max(mb.speedForMax, 0.01)), bl.sizeCurve);
            var ks = mb.sizeSmoothing > 0 ? 1 - Math.exp(-dt / mb.sizeSmoothing) : 1;
            m.s += (ts - m.s) * ks;
        } else if (m) {
            // da fermo si restringe piano verso la misura minima
            var ks2 = mb.sizeSmoothing > 0 ? 1 - Math.exp(-dt / mb.sizeSmoothing) : 1;
            m.s += (0 - m.s) * ks2;
        }
        if (m) {
            var mg = this.time - m.last;
            if (mg > mb.hold + 0.25) {
                this.mt = null;
            } else {
                var ma = Math.min(1, (this.time - m.born) / 0.1) * (mg > mb.hold ? Math.max(0, 1 - (mg - mb.hold) / 0.25) : 1);
                if (flick) m.jit = [Math.random(), Math.random(), Math.random()];
                var mcol = mb.ownColor ? BlobTrack.toCss(mb.color, bl.opacity) : lineCol;
                this.drawBlob(ctx, cw,
                    dm.mouseU * cw, (1 - dm.mouseV) * ch, minS + (maxS - minS) * m.s, ma,
                    m.id, dm.mouseU, dm.mouseV, m.s, m.jit, mcol, txtCol);
            }
        }
    } else {
        this.mt = null;
    }
    ctx.globalAlpha = 1;
};
