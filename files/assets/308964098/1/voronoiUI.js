// voronoiUI.js
// Piccola interfaccia HTML in sovrimpressione (in alto a sinistra) per
// accendere/spegnere i puntini e le linee del Voronoi di bgVoronoi.
// Va messo sulla stessa entita dello script bgVoronoi.
var VoronoiUI = pc.createScript('voronoiUI');

VoronoiUI.attributes.add('ui', {
    type: 'json', title: 'Interfaccia',
    schema: [
        { name: 'offsetLeft', type: 'number', default: 20, min: 0, max: 500, precision: 0, title: 'Distanza dal bordo sinistro (px)' },
        { name: 'offsetTop', type: 'number', default: 20, min: 0, max: 500, precision: 0, title: 'Distanza dal bordo in alto (px)' },
        { name: 'fontSize', type: 'number', default: 13, min: 8, max: 32, precision: 0, title: 'Dimensione testo (px)' },
        { name: 'textColor', type: 'rgb', default: [0, 0, 0], title: 'Colore testo' },
        { name: 'lineOnOpacity', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Opacita linee quando accese' }
    ]
});

VoronoiUI.prototype.initialize = function () {
    this.vor = this.entity.script && this.entity.script.bgVoronoi;
    if (!this.vor) {
        console.error('[voronoiUI] serve lo script bgVoronoi sulla stessa entita');
        return;
    }
    var look = this.vor.look;
    this.linesOn = look.lineOpacity > 0;

    var root = document.createElement('div');
    root.className = 'voronoi-ui';
    this.root = root;

    var style = document.createElement('style');
    style.textContent =
        '.voronoi-ui{position:fixed;z-index:10;display:flex;flex-direction:column;gap:8px;' +
        'font-family:Helvetica,Arial,sans-serif;letter-spacing:0.04em;user-select:none;}' +
        '.voronoi-ui button{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;}' +
        '.voronoi-ui .box{width:0.9em;height:0.9em;border:1px solid currentColor;box-sizing:border-box;' +
        'display:inline-block;position:relative;}' +
        '.voronoi-ui button.on .box::after{content:"";position:absolute;inset:2px;background:currentColor;}' +
        '.voronoi-ui button:not(.on){opacity:0.45;}';
    this.style = style;
    document.head.appendChild(style);

    var self = this;
    this.btnDots = this.makeButton('Point', function () {
        self.vor.look.showDots = !self.vor.look.showDots;
        self.refresh();
    });
    this.btnLines = this.makeButton('Line', function () {
        self.linesOn = !self.linesOn;
        self.vor.look.lineOpacity = self.linesOn ? self.ui.lineOnOpacity : 0;
        self.refresh();
    });
    root.appendChild(this.btnDots);
    root.appendChild(this.btnLines);
    document.body.appendChild(root);

    // lo stato iniziale delle linee segue il cursore dell'opacita
    if (this.linesOn) look.lineOpacity = this.ui.lineOnOpacity;
    this.applyStyle();
    this.refresh();

    this.on('attr:ui', function () {
        this.applyStyle();
        if (this.linesOn) this.vor.look.lineOpacity = this.ui.lineOnOpacity;
    }, this);

    this.on('destroy', function () {
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        if (this.style && this.style.parentNode) this.style.parentNode.removeChild(this.style);
    }, this);
};

VoronoiUI.prototype.makeButton = function (label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    var box = document.createElement('span');
    box.className = 'box';
    var txt = document.createElement('span');
    txt.textContent = label;
    b.appendChild(box);
    b.appendChild(txt);
    b.addEventListener('click', onClick);
    return b;
};

VoronoiUI.prototype.applyStyle = function () {
    var u = this.ui, c = u.textColor;
    var cr = Array.isArray(c) ? c[0] : c.r, cg = Array.isArray(c) ? c[1] : c.g, cb = Array.isArray(c) ? c[2] : c.b;
    var s = this.root.style;
    s.left = u.offsetLeft + 'px';
    s.top = u.offsetTop + 'px';
    s.fontSize = u.fontSize + 'px';
    s.color = 'rgb(' + Math.round(cr * 255) + ',' + Math.round(cg * 255) + ',' + Math.round(cb * 255) + ')';
};

VoronoiUI.prototype.refresh = function () {
    this.btnDots.classList.toggle('on', !!this.vor.look.showDots);
    this.btnLines.classList.toggle('on', this.linesOn);
};
