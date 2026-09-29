// sceneMenu.js
// Menu HTML in alto a destra per passare da una scena all'altra durante il Launch.
// Va messo in una scena "launcher": all'avvio carica la prima scena della lista
// (o quella indicata in "Scena iniziale") e il menu resta a schermo anche
// quando le scene cambiano, perche vive nella pagina e non in un'entita.
// Cliccando una voce compare sotto il menu la sua descrizione (dopo un ritardo
// regolabile), che dopo qualche secondo sfuma via. Nella descrizione "\n" va a capo.
// All'avvio (se attivo) la descrizione della prima scena compare subito, senza ritardo.
// Scorciatoie: tasti 1, 2, 3... per le voci del menu nell'ordine.
// Piu scene in una voce: nel nome scena scrivile separate da virgola
// (es. "BG_voronoi_logo, BG_datamosh"): a ogni clic sulla voce si passa alla
// successiva. Le descrizioni si separano con "||", nello stesso ordine.
// "Colore invertito": il menu usa la fusione "difference", cosi un testo bianco
// diventa nero sulle scene chiare e resta bianco su quelle scure.
// Mobile: sotto una certa larghezza dello schermo
//  - il menu diventa un pulsante hamburger (tre lineette) che apre e chiude le voci
//  - la descrizione non compare
//  - gli interruttori in alto a sinistra delle scene (Point/Line, Invert/Blob) si
//    nascondono dietro un "+": toccandolo si apre la lista e il "+" ruota in una "x"
var SceneMenu = pc.createScript('sceneMenu');

SceneMenu.attributes.add('items', {
    type: 'json', array: true, title: 'Voci del menu',
    schema: [
        { name: 'label', type: 'string', default: 'Scena', title: 'Scritta' },
        { name: 'scene', type: 'string', default: '', title: 'Nome scena (piu scene separate da virgola = si alternano)' },
        { name: 'description', type: 'string', default: '', title: 'Descrizione (\\n = a capo, || = descrizione della scena successiva)' }
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
        { name: 'uppercase', type: 'boolean', default: true, title: 'Maiuscolo' },
        { name: 'blendDifference', type: 'boolean', default: false, title: 'Colore invertito (bianco diventa nero sulle scene chiare)' }
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

SceneMenu.attributes.add('mobile', {
    type: 'json', title: 'Mobile (menu hamburger)',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'breakpoint', type: 'number', default: 820, min: 200, max: 3000, precision: 0, title: 'Larghezza dello schermo sotto cui usarlo (px)' },
        { name: 'offsetRight', type: 'number', default: 16, min: 0, max: 400, precision: 0, title: 'Distanza dal bordo destro (px)' },
        { name: 'offsetTop', type: 'number', default: 16, min: 0, max: 400, precision: 0, title: 'Distanza dal bordo in alto (px)' },
        { name: 'iconSize', type: 'number', default: 26, min: 12, max: 80, precision: 0, title: 'Larghezza dell\'icona (px)' },
        { name: 'fontSize', type: 'number', default: 18, min: 8, max: 60, precision: 0, title: 'Dimensione delle voci (px)' },
        { name: 'spacing', type: 'number', default: 16, min: 0, max: 100, precision: 0, title: 'Spazio tra le voci (px)' },
        { name: 'squareSize', type: 'number', default: 22, min: 8, max: 80, precision: 0, title: 'Misura del + degli interruttori (px)' },
        { name: 'buttonsFontSize', type: 'number', default: 14, min: 8, max: 40, precision: 0, title: 'Dimensione degli interruttori (px)' },
        { name: 'buttonsOffset', type: 'number', default: 16, min: 0, max: 200, precision: 0, title: 'Distanza del + dal bordo (px)' }
    ]
});

SceneMenu.MENU_ID = 'pc-scene-menu';
SceneMenu.STYLE_ID = 'pc-scene-menu-style';
SceneMenu.SQUARE_ID = 'pc-scene-toggles';
SceneMenu.TOGGLES = '.voronoi-ui, .dm-ui';      // interruttori delle scene

SceneMenu.toCss = function (c, a) {
    var r = Math.round((c.r !== undefined ? c.r : c[0]) * 255);
    var g = Math.round((c.g !== undefined ? c.g : c[1]) * 255);
    var b = Math.round((c.b !== undefined ? c.b : c[2]) * 255);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a === undefined ? 1 : a) + ')';
};

SceneMenu.prototype.initialize = function () {
    var app = this.app;
    // ogni voce puo avere piu scene (separate da virgola) e piu descrizioni (separate da ||)
    var items = (this.items || []).filter(function (it) { return it && it.scene; }).map(function (it) {
        var scenes = String(it.scene).split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
        var descs = String(it.description || '').split('||').map(function (s) { return s.trim(); });
        return { label: it.label, scenes: scenes, descs: descs, idx: 0 };
    }).filter(function (it) { return it.scenes.length; });
    if (!items.length) {
        console.warn('[sceneMenu] nessuna voce nel menu');
        return;
    }

    // Il menu e' unico per tutta la pagina
    ['MENU_ID', 'STYLE_ID', 'SQUARE_ID'].forEach(function (k) {
        var el = document.getElementById(SceneMenu[k]);
        if (el) el.parentNode.removeChild(el);
    });
    if (window.__sceneMenuKeys) window.removeEventListener('keydown', window.__sceneMenuKeys);
    if (window.__sceneMenuResize) window.removeEventListener('resize', window.__sceneMenuResize);
    if (window.__sceneMenuObserver) window.__sceneMenuObserver.disconnect();
    clearTimeout(window.__sceneMenuTimer);
    clearTimeout(window.__sceneMenuDelay);

    var st = this.style;
    var cap = this.caption;
    var mob = this.mobile;
    var vertical = st.vertical !== false;

    // Su mobile gli interruttori delle scene stanno sotto al "+" e si vedono solo da aperti
    var sq = mob.squareSize, sqOff = mob.buttonsOffset;
    var css = document.createElement('style');
    css.id = SceneMenu.STYLE_ID;
    css.textContent =
        'body.pc-mobile .voronoi-ui, body.pc-mobile .dm-ui{display:none !important;font-size:' + mob.buttonsFontSize + 'px !important;' +
        'left:' + sqOff + 'px !important;top:' + (sqOff + sq + 14) + 'px !important;}' +
        'body.pc-mobile.pc-toggles-open .voronoi-ui, body.pc-mobile.pc-toggles-open .dm-ui{display:flex !important;flex-direction:column;gap:10px;}';
    document.head.appendChild(css);

    // "+" (mobile) che apre e chiude gli interruttori: aperto ruota di 45 gradi e diventa una "x"
    var square = document.createElement('button');
    square.id = SceneMenu.SQUARE_ID;
    square.type = 'button';
    square.setAttribute('aria-label', 'Interruttori');
    var sqCol = SceneMenu.toCss(st.activeColor, 1);
    var thick = Math.max(2, Math.round(sq / 11));
    square.style.cssText = [
        'all:unset', 'position:fixed', 'z-index:1000', 'cursor:pointer', 'display:none', 'box-sizing:content-box',
        'left:' + (sqOff - 8) + 'px', 'top:' + (sqOff - 8) + 'px', 'width:' + sq + 'px', 'height:' + sq + 'px',
        'padding:8px', '-webkit-tap-highlight-color:transparent',
        st.blendDifference ? 'mix-blend-mode:difference' : ''
    ].join(';');
    var plus = document.createElement('span');
    plus.style.cssText = 'position:relative;display:block;width:100%;height:100%;transition:transform .25s ease;';
    var lineH = document.createElement('span');
    lineH.style.cssText = 'position:absolute;left:0;right:0;top:50%;height:' + thick + 'px;margin-top:' + (-thick / 2) + 'px;background:' + sqCol + ';';
    var lineV = document.createElement('span');
    lineV.style.cssText = 'position:absolute;top:0;bottom:0;left:50%;width:' + thick + 'px;margin-left:' + (-thick / 2) + 'px;background:' + sqCol + ';';
    plus.appendChild(lineH);
    plus.appendChild(lineV);
    square.appendChild(plus);
    document.body.appendChild(square);
    var togglesOpen = false;
    function setToggles(v) {
        togglesOpen = v;
        document.body.classList.toggle('pc-toggles-open', v);
        plus.style.transform = v ? 'rotate(45deg)' : 'none';     // aperto = "x"
    }
    square.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    square.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setToggles(!togglesOpen);
    });

    // Contenitore: menu + descrizione, ancorati in alto a destra
    var wrap = document.createElement('div');
    wrap.id = SceneMenu.MENU_ID;
    var wrapCss = [
        'position:fixed',
        'display:flex',
        'flex-direction:column',
        'align-items:flex-end',
        'z-index:1000',
        'user-select:none',
        '-webkit-user-select:none'
    ];
    if (st.blendDifference) wrapCss.push('mix-blend-mode:difference');
    wrap.style.cssText = wrapCss.join(';');

    var menu = document.createElement('nav');
    menu.style.cssText = [
        'display:flex',
        'flex-direction:' + (vertical ? 'column' : 'row'),
        'align-items:' + (vertical ? 'flex-end' : 'center'),   // in colonna: allineate a destra
        'gap:' + st.spacing + 'px'
    ].join(';');
    wrap.appendChild(menu);

    // ---- Mobile: pulsante hamburger + lista che si apre sotto ----
    var burger = document.createElement('button');
    burger.type = 'button';
    burger.setAttribute('aria-label', 'Menu');
    var ic = mob.iconSize, barH = Math.max(2, Math.round(ic / 12)), gapB = Math.round(ic * 0.28);
    burger.style.cssText = [
        'all:unset', 'cursor:pointer', 'display:none', 'flex-direction:column', 'justify-content:center',
        'gap:' + gapB + 'px', 'width:' + ic + 'px', 'height:' + (barH * 3 + gapB * 2) + 'px',
        'padding:8px', 'margin:-8px', '-webkit-tap-highlight-color:transparent'
    ].join(';');
    var bars = [];
    for (var b = 0; b < 3; b++) {
        var bar = document.createElement('span');
        bar.style.cssText = 'display:block;width:100%;height:' + barH + 'px;background:' + SceneMenu.toCss(st.activeColor, 1) +
            ';transition:transform .25s ease, opacity .2s ease;transform-origin:center;';
        burger.appendChild(bar);
        bars.push(bar);
    }
    wrap.appendChild(burger);

    var panel = document.createElement('nav');
    panel.style.cssText = [
        'display:none', 'flex-direction:column', 'align-items:flex-end',
        'gap:' + mob.spacing + 'px', 'margin-top:' + Math.round(mob.spacing * 1.2) + 'px'
    ].join(';');
    wrap.appendChild(panel);

    var open = false;
    function setOpen(v) {
        open = v;
        panel.style.display = open ? 'flex' : 'none';
        var d = gapB + barH;
        bars[0].style.transform = open ? 'translateY(' + d + 'px) rotate(45deg)' : 'none';
        bars[1].style.opacity = open ? '0' : '1';
        bars[2].style.transform = open ? 'translateY(' + (-d) + 'px) rotate(-45deg)' : 'none';
    }
    burger.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    burger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!open);
    });

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

    var isMobile = false;
    // il "+" compare solo su mobile e solo se la scena ha degli interruttori
    function updateSquare() {
        var has = !!document.querySelector(SceneMenu.TOGGLES);
        square.style.display = isMobile && has ? 'block' : 'none';
        if (!has && togglesOpen) setToggles(false);
    }
    function applyMode() {
        isMobile = !!mob.enabled && window.innerWidth <= mob.breakpoint;
        document.body.classList.toggle('pc-mobile', isMobile);
        wrap.style.top = (isMobile ? mob.offsetTop : st.offsetTop) + 'px';
        wrap.style.right = (isMobile ? mob.offsetRight : st.offsetRight) + 'px';
        menu.style.display = isMobile ? 'none' : 'flex';
        burger.style.display = isMobile ? 'flex' : 'none';
        captionEl.style.display = isMobile ? 'none' : 'block';
        if (!isMobile) { setOpen(false); setToggles(false); }
        updateSquare();
    }
    // gli interruttori nascono e spariscono con le scene: controllo quando cambia la pagina
    if (window.MutationObserver) {
        window.__sceneMenuObserver = new MutationObserver(updateSquare);
        window.__sceneMenuObserver.observe(document.body, { childList: true });
    }

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

    // immediate = true: niente ritardo (usato all'avvio). Su mobile la descrizione non compare.
    function showCaption(text, immediate) {
        clearTimeout(window.__sceneMenuTimer);
        clearTimeout(window.__sceneMenuDelay);
        // La descrizione precedente sfuma subito, la nuova arriva dopo il ritardo
        hideCaption();
        if (!cap.enabled || !text || isMobile) return;
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
            var active = l.item.scenes.indexOf(state.current) >= 0;
            var col = l.hover ? st.hoverColor : (active ? st.activeColor : st.color);
            l.el.style.color = SceneMenu.toCss(col, active || l.hover ? 1 : st.opacity);
            l.el.style.borderBottomColor = active ? SceneMenu.toCss(st.activeColor, 0.9) : 'transparent';
        });
    }

    // fromUser = true quando arriva da un click o da un tasto
    function load(item, fromUser) {
        if (state.loading) return;
        // voce con piu scene: a ogni clic si passa alla successiva
        if (fromUser && item.scenes.length > 1) item.idx = (item.idx + 1) % item.scenes.length;
        var scene = item.scenes[item.idx];
        var desc = item.descs[item.idx] !== undefined && item.descs[item.idx] !== '' ? item.descs[item.idx] : item.descs[0];
        if (fromUser) showCaption(desc, false);
        else if (cap.showOnStart) showCaption(desc, true);
        if (scene === state.current) return;
        if (!app.scenes.find(scene)) {
            console.error('[sceneMenu] scena non trovata: ' + scene);
            return;
        }
        setToggles(false);          // cambiando scena gli interruttori si richiudono
        state.loading = true;
        app.scenes.changeScene(scene, function (err) {
            state.loading = false;
            if (err) {
                console.error('[sceneMenu] errore caricando ' + scene + ': ' + err);
                return;
            }
            state.current = scene;
            console.log('[sceneMenu] scena caricata: ' + scene);
            paint();
            updateSquare();
        });
    }

    function makeLink(it, fontSize, parent, closeAfter) {
        var el = document.createElement('a');
        el.textContent = it.label || it.scenes[0];
        el.style.cssText = [
            'cursor:pointer',
            'font-family:' + st.font,
            'font-size:' + fontSize + 'px',
            'letter-spacing:' + st.letterSpacing + 'px',
            'text-transform:' + (st.uppercase ? 'uppercase' : 'none'),
            'text-decoration:none',
            'padding-bottom:4px',
            'border-bottom:1px solid transparent',
            'transition:color .2s, border-color .2s',
            '-webkit-tap-highlight-color:transparent'
        ].join(';');
        var link = { el: el, item: it, hover: false };
        el.addEventListener('mouseenter', function () { link.hover = true; paint(); });
        el.addEventListener('mouseleave', function () { link.hover = false; paint(); });
        // Evita che il click arrivi al canvas (orbit, trascinamento...)
        el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        el.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            link.hover = false;
            load(it, true);
            if (closeAfter) setOpen(false);
            paint();
        });
        state.links.push(link);
        parent.appendChild(el);
    }

    items.forEach(function (it) {
        makeLink(it, st.fontSize, menu, false);        // menu da computer
        makeLink(it, mob.fontSize, panel, true);       // menu del telefono (si chiude dopo la scelta)
    });

    document.body.appendChild(wrap);
    applyMode();
    paint();
    window.__sceneMenuResize = applyMode;
    window.addEventListener('resize', applyMode);

    // Tasti 1, 2, 3... (il listener vive nella pagina, come il menu)
    if (this.numberKeys) {
        window.__sceneMenuKeys = function (e) {
            var n = parseInt(e.key, 10);
            if (n >= 1 && n <= items.length) load(items[n - 1], true);
        };
        window.addEventListener('keydown', window.__sceneMenuKeys);
    }

    // Scena iniziale
    var startName = this.startScene || items[0].scenes[0];
    var startItem = null;
    for (var i = 0; i < items.length && !startItem; i++) {
        var si = items[i].scenes.indexOf(startName);
        if (si >= 0) { startItem = items[i]; startItem.idx = si; }
    }
    if (!startItem) startItem = { scenes: [startName], descs: [''], idx: 0 };
    // Aspetto un frame: il launcher finisce di inizializzarsi prima di essere sostituito
    setTimeout(function () { load(startItem, false); }, 0);
};
