// postFx.js
// Da mettere sulla Camera.
// Post-produzione con il CameraFrame di PlayCanvas (engine 2.x):
// tonemapping, bloom, color grading, vignette, aberrazione cromatica,
// profondita di campo, SSAO e antialiasing temporale.
// Tutti i parametri si possono cambiare dall'Inspector, anche mentre il Launch gira.
var PostFx = pc.createScript('postFx');

PostFx.attributes.add('rendering', {
    type: 'json', title: 'Rendering',
    schema: [
        {
            name: 'toneMapping', type: 'number', default: 3, title: 'Tonemapping',
            enum: [{ 'Linear': 0 }, { 'Filmic': 1 }, { 'Hejl': 2 }, { 'ACES': 3 }, { 'ACES 2': 4 }, { 'Neutral': 5 }, { 'Nessuno': 6 }]
        },
        { name: 'exposure', type: 'number', default: 1, min: 0, max: 5, precision: 2, title: 'Esposizione' },
        {
            name: 'samples', type: 'number', default: 4, title: 'Antialiasing MSAA',
            enum: [{ 'Off': 1 }, { '2x': 2 }, { '4x': 4 }]
        },
        { name: 'renderScale', type: 'number', default: 1, min: 0.25, max: 2, precision: 2, title: 'Scala risoluzione' },
        { name: 'sharpness', type: 'number', default: 0, min: 0, max: 1, precision: 2, title: 'Nitidezza' }
    ]
});

PostFx.attributes.add('bloom', {
    type: 'json', title: 'Bloom',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'intensity', type: 'number', default: 0.04, min: 0, max: 0.5, precision: 3, title: 'Intensita' },
        { name: 'blurLevel', type: 'number', default: 12, min: 1, max: 16, precision: 0, step: 1, title: 'Raggio (livelli blur)' }
    ]
});

PostFx.attributes.add('grading', {
    type: 'json', title: 'Color grading',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'brightness', type: 'number', default: 1, min: 0, max: 3, precision: 2, title: 'Luminosita' },
        { name: 'contrast', type: 'number', default: 1.1, min: 0, max: 3, precision: 2, title: 'Contrasto' },
        { name: 'saturation', type: 'number', default: 1.15, min: 0, max: 3, precision: 2, title: 'Saturazione' },
        { name: 'tint', type: 'rgb', default: [1, 1, 1], title: 'Tinta' }
    ]
});

PostFx.attributes.add('vignette', {
    type: 'json', title: 'Vignette',
    schema: [
        { name: 'enabled', type: 'boolean', default: true, title: 'Attivo' },
        { name: 'intensity', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Intensita' },
        { name: 'inner', type: 'number', default: 0.5, min: 0, max: 3, precision: 2, title: 'Bordo interno' },
        { name: 'outer', type: 'number', default: 1.2, min: 0, max: 3, precision: 2, title: 'Bordo esterno' },
        { name: 'curvature', type: 'number', default: 0.5, min: 0.01, max: 10, precision: 2, title: 'Curvatura' }
    ]
});

PostFx.attributes.add('fringing', {
    type: 'json', title: 'Aberrazione cromatica',
    schema: [
        { name: 'enabled', type: 'boolean', default: false, title: 'Attivo' },
        { name: 'intensity', type: 'number', default: 10, min: 0, max: 100, precision: 1, title: 'Intensita' }
    ]
});

PostFx.attributes.add('dof', {
    type: 'json', title: 'Profondita di campo',
    schema: [
        { name: 'enabled', type: 'boolean', default: false, title: 'Attivo' },
        { name: 'focusDistance', type: 'number', default: 22, min: 0, max: 200, precision: 1, title: 'Distanza fuoco' },
        { name: 'focusRange', type: 'number', default: 8, min: 0, max: 100, precision: 1, title: 'Zona a fuoco' },
        { name: 'blurRadius', type: 'number', default: 3, min: 0, max: 20, precision: 1, title: 'Raggio sfocatura' },
        { name: 'blurRings', type: 'number', default: 4, min: 1, max: 10, precision: 0, step: 1, title: 'Anelli blur' },
        { name: 'blurRingPoints', type: 'number', default: 5, min: 1, max: 10, precision: 0, step: 1, title: 'Punti per anello' },
        { name: 'nearBlur', type: 'boolean', default: false, title: 'Sfoca anche davanti' },
        { name: 'highQuality', type: 'boolean', default: true, title: 'Alta qualita' }
    ]
});

PostFx.attributes.add('ssao', {
    type: 'json', title: 'SSAO (occlusione ambientale)',
    schema: [
        {
            name: 'type', type: 'number', default: 0, title: 'Modalita',
            enum: [{ 'Off': 0 }, { 'Sulla luce': 1 }, { 'Sopra tutto': 2 }]
        },
        { name: 'intensity', type: 'number', default: 0.5, min: 0, max: 1, precision: 2, title: 'Intensita' },
        { name: 'radius', type: 'number', default: 2, min: 0, max: 50, precision: 2, title: 'Raggio' },
        { name: 'power', type: 'number', default: 6, min: 0.1, max: 10, precision: 1, title: 'Potenza' },
        { name: 'samples', type: 'number', default: 12, min: 1, max: 64, precision: 0, step: 1, title: 'Campioni' },
        { name: 'minAngle', type: 'number', default: 10, min: 0, max: 90, precision: 0, title: 'Angolo minimo' },
        { name: 'scale', type: 'number', default: 1, min: 0.25, max: 1, precision: 2, title: 'Scala risoluzione' },
        { name: 'blurEnabled', type: 'boolean', default: true, title: 'Blur' }
    ]
});

PostFx.attributes.add('taa', {
    type: 'json', title: 'TAA (antialiasing temporale)',
    schema: [
        { name: 'enabled', type: 'boolean', default: false, title: 'Attivo' },
        { name: 'jitter', type: 'number', default: 1, min: 0, max: 1, precision: 2, title: 'Jitter' }
    ]
});

PostFx.SSAO_TYPES = ['none', 'lighting', 'combine'];

PostFx.prototype.initialize = function () {
    if (!pc.CameraFrame) {
        console.error('[postFx] pc.CameraFrame non disponibile: serve engine 2.x recente');
        return;
    }
    this.frame = new pc.CameraFrame(this.app, this.entity.camera);
    this.apply();

    // Qualsiasi modifica dall'Inspector viene applicata subito
    this.on('attr', this.apply, this);
    this.on('enable', function () { this.frame.enabled = true; this.frame.update(); }, this);
    this.on('disable', function () { this.frame.enabled = false; this.frame.update(); }, this);
    this.on('destroy', function () { this.frame.destroy(); }, this);
};

PostFx.prototype.apply = function () {
    var f = this.frame;
    if (!f) return;

    // Rendering
    var r = this.rendering;
    f.rendering.toneMapping = r.toneMapping;
    f.rendering.samples = r.samples;
    f.rendering.renderTargetScale = r.renderScale;
    f.rendering.sharpness = r.sharpness;
    this.app.scene.exposure = r.exposure;

    // Bloom
    var b = this.bloom;
    f.bloom.intensity = b.enabled ? b.intensity : 0;
    f.bloom.blurLevel = Math.round(b.blurLevel);

    // Color grading
    var g = this.grading;
    f.grading.enabled = g.enabled;
    f.grading.brightness = g.brightness;
    f.grading.contrast = g.contrast;
    f.grading.saturation = g.saturation;
    f.grading.tint.copy(g.tint);

    // Vignette
    var v = this.vignette;
    f.vignette.intensity = v.enabled ? v.intensity : 0;
    f.vignette.inner = v.inner;
    f.vignette.outer = v.outer;
    f.vignette.curvature = v.curvature;

    // Aberrazione cromatica
    var fr = this.fringing;
    f.fringing.intensity = fr.enabled ? fr.intensity : 0;

    // Profondita di campo
    var d = this.dof;
    f.dof.enabled = d.enabled;
    f.dof.focusDistance = d.focusDistance;
    f.dof.focusRange = d.focusRange;
    f.dof.blurRadius = d.blurRadius;
    f.dof.blurRings = Math.round(d.blurRings);
    f.dof.blurRingPoints = Math.round(d.blurRingPoints);
    f.dof.nearBlur = d.nearBlur;
    f.dof.highQuality = d.highQuality;

    // SSAO
    var s = this.ssao;
    f.ssao.type = PostFx.SSAO_TYPES[s.type] || 'none';
    f.ssao.intensity = s.intensity;
    f.ssao.radius = s.radius;
    f.ssao.power = s.power;
    f.ssao.samples = Math.round(s.samples);
    f.ssao.minAngle = s.minAngle;
    f.ssao.scale = s.scale;
    f.ssao.blurEnabled = s.blurEnabled;

    // TAA
    var t = this.taa;
    f.taa.enabled = t.enabled;
    f.taa.jitter = t.jitter;

    f.update();
};
