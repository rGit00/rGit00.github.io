// sceneMenu.js
// Menu HTML in alto a destra per passare da una scena all'altra durante il Launch.
// Va messo in una scena "launcher": all'avvio carica la prima scena della lista
// (o quella indicata in "Scena iniziale") e il menu resta a schermo anche
// quando le scene cambiano, perche vive nella pagina e non in un'entita.
// Cliccando una voce compare sotto il menu la sua descrizione (dopo un ritardo
// regolabile), che dopo qualche secondo sfuma via. Nella descrizione "\n" va a capo.
// All'avvio (se attivo) la descrizione della prima scena compare subito, senza ritardo.
// Scorciatoie: tasti 1, 2, 3... per le voci del menu nell'ordine.
var SceneMenu = pc.createScript('sceneMenu');

SceneMenu.attributes.add('items', {
    type: 'json', array: true, title: 'Voci del menu',
    schema: [
        { name: 'label', type: 'string', default: 'Scena', title: 'Scritta' },
        { name: 'scene', type: 'string', default: '', title: 'Nome scena' },
        { name: 'description', type: 'string', default: '', title: 'Descrizione (\\n = a capo)' }
    ]
});
SceneMenu.attributes.add('startScene', { type: 'string', default: '', title: 'Scena iniziale (vuoto = la prima)' });
SceneMenu.attributes.add('numberKeys', { type: 'boolean', default: true, title: 'Scorciatoie tasti 1, 2, 3...' });

SceneMenu.attributes.add('style', {
    type: 'json', title: 'Aspetto',
    schema: [
        { name: 'vertical', type: 'boolean', default: true, title: 'Voci una sopra l\'altra' },
        { name: 'offsetRight', type: 'number', default: 28, min: 0, max: 1500, precision: 0, title: 'Distanza dal bordo destro (px)' },
        { name: 'offsetTop', type: 'number', default: 28, min: 0, max: 1500, precision: 0, title: 'Distanza dal bordo in alto (px)' },
        { name: 'font', type: 'string', default: 'Helvetica, Arial, sans-serif', title: 'Font' },
        { name: 'fontSize', type: 'number', default: 16, min: 8, max: 60, precision: 0, title: 'Dimensione (px)' },
        { name: 'color', type: 'rgb', default: [1, 1, 1], title: 'Colore' },
        { name: 'opacity', type: 'number', default: 0.55, min: 0, max: 1, precision: 2, title: 'Opacita voci non attive' },
        { name: 'activeColor', type: 'rgb', default: [1, 1, 1], title: 'Colore voce attiva' },
        { name: 'hoverColor', type: 'rgb', default: [0.6, 0.85, 1], title: 'Colore al passaggio del mouse' },
        { name: 'spacing', type: 'number', default: 12, min: 0, max: 200, precision: 0, title: 'Spazio tra le voci (px)' },
        { name: 'letterSpacing', type: 'number', default: 2, min: 0, max: 20, precision: 1, title: 'Spaziatura lettere (px)' },
        { name: 'uppercase', type: 'boolean', default: true, title: 'Maiuscolo' }
    ]
});

SceneMenu.attributes.add('caption', {
    type: 'json', title: 'Descrizione',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attiva' },
        { name: 'delay', type: 'number', default: 0.5, min: 0, max: 20, precision: 2, title: 'Ritardo di comparsa (secondi)' },
        { name: 'duration', type: 'number', default: 10, min: 1, max: 60, precision: 1, title: 'Durata (secondi)' },
        { name: 'fade', type: 'number', default: 0.8, min: 0, max: 5, precision: 2, title: 'Dissolvenza (secondi)' },
        { name: 'showOnStart', type: 'boolean', default: true, title: 'Mostra subito all\'avvio' },
        { name: 'gap', type: 'number', default: 24, min: 0, max: 400, precision: 0, title: 'Distanza dal menu (px)' },
        { name: 'fontSize', type: 'number', default: 14, min: 8, max: 60, precision: 0, title: 'Dimensione (px)' },
        { name: 'lineHeight', type: 'number', default: 1.5, min: 0.8, max: 3, precision: 2, title: 'Interlinea' },
        { name: 'maxWidth', type: 'number', default: 360, min: 80, max: 1500, precision: 0, title: 'Larghezza massima (px)' },
        { name: 'color', type: 'rgb', default: [1, 1, 1], title: 'Colore' },
        { name: 'opacity', type: 'number', default: 0.8, min: 0, max: 1, precision: 2, title: 'Opacita' },
        { name: 'italic', type: 'boolean', default: false, title: 'Corsivo' },
        { name: 'alignRight', type: 'boolean', default: true, title: 'Allineata a destra' }
    ]
});

SceneMenu.MENU_ID = 'pc-scene-menu';

SceneMenu.toCss = function (c, a) {
    var r = Math.round((c.r !== undefined ? c.r : c[0]) * 255);
    var g = Math.round((c.g !== undefined ? c.g : c[1]) * 255);
    var b = Math.round((c.b !== undefined ? c.b : c[2]) * 255);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a === undefined ? 1 : a) + ')';
};

SceneMenu.prototype.initialize = function () {
    var app = this.app;
    var items = (this.items || []).filter(function (it) { return it && it.scene; });
    if (!items.length) {
        console.warn('[sceneMenu] nessuna voce nel menu');
        return;
    }

    // Il menu e' unico per tutta la pagina
    var old = document.getElementById(SceneMenu.MENU_ID);
    if (old) old.parentNode.removeChild(old);
    if (window.__sceneMenuKeys) window.removeEventListener('keydown', window.__sceneMenuKeys);
    clearTimeout(window.__sceneMenuTimer);
    clearTimeout(window.__sceneMenuDelay);

    var st = this.style;
    var cap = this.caption;
    var vertical = st.vertical !== false;

    // Contenitore: menu + descrizione, ancorati in alto a destra
    var wrap = document.createElement('div');
    wrap.id = SceneMenu.MENU_ID;
    wrap.style.cssText = [
        'position:fixed',
        'top:' + st.offsetTop + 'px',
        'right:' + st.offsetRight + 'px',
        'display:flex',
        'flex-direction:column',
        'align-items:flex-end',
        'z-index:1000',
        'user-select:none',
        '-webkit-user-select:none'
    ].join(';');

    var menu = document.createElement('nav');
    menu.style.cssText = [
        'display:flex',
        'flex-direction:' + (vertical ? 'column' : 'row'),
        'align-items:' + (vertical ? 'flex-end' : 'center'),   // in colonna: allineate a destra
        'gap:' + st.spacing + 'px'
    ].join(';');
    wrap.appendChild(menu);

    // Descrizione
    var fadeCss = 'opacity ' + cap.fade + 's ease, transform ' + cap.fade + 's ease';
    var captionEl = document.createElement('div');
    captionEl.style.cssText = [
        'margin-top:' + cap.gap + 'px',
        'max-width:' + cap.maxWidth + 'px',
        'font-family:' + st.font,
        'font-size:' + cap.fontSize + 'px',
        'line-height:' + cap.lineHeight,
        'font-style:' + (cap.italic ? 'italic' : 'normal'),
        'text-align:' + (cap.alignRight ? 'right' : 'left'),
        'white-space:pre-line',
        'color:' + SceneMenu.toCss(cap.color, 1),
        'opacity:0',
        'transform:translateY(-6px)',
        'transition:' + fadeCss,
        'pointer-events:none'
    ].join(';');
    wrap.appendChild(captionEl);

    function hideCaption() {
        captionEl.style.opacity = '0';
        captionEl.style.transform = 'translateY(-6px)';
    }

    function revealCaption(text) {
        captionEl.textContent = text.replace(/\\n/g, '\n');
        // Forzo il reflow per ripartire con la dissolvenza anche se era gia visibile
        captionEl.style.transition = 'none';
        captionEl.style.opacity = '0';
        captionEl.style.transform = 'translateY(-6px)';
        void captionEl.offsetWidth;
        captionEl.style.transition = fadeCss;
        captionEl.style.opacity = String(cap.opacity);
        captionEl.style.transform = 'translateY(0)';
        window.__sceneMenuTimer = setTimeout(hideCaption, cap.duration * 1000);
    }

    // immediate = true: niente ritardo (usato all'avvio)
    function showCaption(text, immediate) {
        clearTimeout(window.__sceneMenuTimer);
        clearTimeout(window.__sceneMenuDelay);
        // La descrizione precedente sfuma subito, la nuova arriva dopo il ritardo
        hideCaption();
        if (!cap.enabled || !text) return;
        if (immediate) {
            revealCaption(text);
            return;
        }
        window.__sceneMenuDelay = setTimeout(function () {
            revealCaption(text);
        }, Math.max(0, cap.delay || 0) * 1000);
    }

    var state = { current: null, loading: false, links: [] };

    function paint() {
        state.links.forEach(function (l) {
            var active = l.scene === state.current;
            var col = l.hover ? st.hoverColor : (active ? st.activeColor : st.color);
            l.el.style.color = SceneMenu.toCss(col, active || l.hover ? 1 : st.opacity);
            l.el.style.borderBottomColor = active ? SceneMenu.toCss(st.activeColor, 0.9) : 'transparent';
        });
    }

    // fromUser = true quando arriva da un click o da un tasto
    function load(item, fromUser) {
        if (fromUser) showCaption(item.description, false);
        else if (cap.showOnStart) showCaption(item.description, true);
        if (state.loading || item.scene === state.current) return;
        if (!app.scenes.find(item.scene)) {
            console.error('[sceneMenu] scena non trovata: ' + item.scene);
            return;
        }
        state.loading = true;
        app.scenes.changeScene(item.scene, function (err) {
            state.loading = false;
            if (err) {
                console.error('[sceneMenu] errore caricando ' + item.scene + ': ' + err);
                return;
            }
            state.current = item.scene;
            console.log('[sceneMenu] scena caricata: ' + item.scene);
            paint();
        });
    }

    items.forEach(function (it) {
        var el = document.createElement('a');
        el.textContent = it.label || it.scene;
        el.style.cssText = [
            'cursor:pointer',
            'font-family:' + st.font,
            'font-size:' + st.fontSize + 'px',
            'letter-spacing:' + st.letterSpacing + 'px',
            'text-transform:' + (st.uppercase ? 'uppercase' : 'none'),
            'text-decoration:none',
            'padding-bottom:4px',
            'border-bottom:1px solid transparent',
            'transition:color .2s, border-color .2s'
        ].join(';');
        var link = { el: el, scene: it.scene, hover: false };
        el.addEventListener('mouseenter', function () { link.hover = true; paint(); });
        el.addEventListener('mouseleave', function () { link.hover = false; paint(); });
        // Evita che il click arrivi al canvas (orbit, trascinamento...)
        el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            load(it, true);
        });
        state.links.push(link);
        menu.appendChild(el);
    });

    document.body.appendChild(wrap);
    paint();

    // Tasti 1, 2, 3... (il listener vive nella pagina, come il menu)
    if (this.numberKeys) {
        window.__sceneMenuKeys = function (e) {
            var n = parseInt(e.key, 10);
            if (n >= 1 && n <= items.length) load(items[n - 1], true);
        };
        window.addEventListener('keydown', window.__sceneMenuKeys);
    }

    // Scena iniziale
    var startName = this.startScene || items[0].scene;
    var startItem = items.filter(function (it) { return it.scene === startName; })[0] || { scene: startName };
    // Aspetto un frame: il launcher finisce di inizializzarsi prima di essere sostituito
    setTimeout(function () { load(startItem, false); }, 0);
};
