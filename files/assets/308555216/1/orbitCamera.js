// orbitCamera.js
// Da mettere sulla Camera.
// Mouse: sinistro = orbit, destro / centrale / Shift+sinistro = pan, rotella = zoom
// Touch: un dito = orbit, due dita = pinch zoom + pan
// Tasto F = torna alla vista iniziale
// Orbit, pan e zoom si possono attivare o disattivare singolarmente.
var OrbitCamera = pc.createScript('orbitCamera');

OrbitCamera.attributes.add('enableOrbit', { type: 'boolean', default: true, title: 'Orbit attivo' });
OrbitCamera.attributes.add('enablePan', { type: 'boolean', default: true, title: 'Pan attivo' });
OrbitCamera.attributes.add('enableZoom', { type: 'boolean', default: true, title: 'Zoom attivo' });
OrbitCamera.attributes.add('pivot', { type: 'vec3', default: [0, 0, 0], title: 'Punto di orbita' });
OrbitCamera.attributes.add('orbitSensitivity', { type: 'number', default: 0.3, title: 'Sensibilita orbit' });
OrbitCamera.attributes.add('panSensitivity', { type: 'number', default: 1, title: 'Sensibilita pan' });
OrbitCamera.attributes.add('zoomSensitivity', { type: 'number', default: 1, title: 'Sensibilita zoom' });
OrbitCamera.attributes.add('minDistance', { type: 'number', default: 4, min: 0.1, title: 'Distanza minima' });
OrbitCamera.attributes.add('maxDistance', { type: 'number', default: 80, title: 'Distanza massima' });
OrbitCamera.attributes.add('minPitch', { type: 'number', default: -89, min: -89.9, max: 0, title: 'Pitch minimo' });
OrbitCamera.attributes.add('maxPitch', { type: 'number', default: 89, min: 0, max: 89.9, title: 'Pitch massimo' });
OrbitCamera.attributes.add('damping', { type: 'number', default: 12, min: 1, max: 60, title: 'Morbidezza (alto = piu rapido)' });

OrbitCamera.prototype.initialize = function () {
    // Stato iniziale ricavato dalla posizione attuale della camera
    this.targetPivot = this.pivot.clone();
    var offset = new pc.Vec3().sub2(this.entity.getPosition(), this.targetPivot);
    var dist = Math.max(offset.length(), 0.001);
    this.targetDistance = pc.math.clamp(dist, this.minDistance, this.maxDistance);
    this.targetYaw = Math.atan2(offset.x, offset.z) * pc.math.RAD_TO_DEG;
    this.targetPitch = pc.math.clamp(-Math.asin(offset.y / dist) * pc.math.RAD_TO_DEG, this.minPitch, this.maxPitch);

    this.home = {
        pivot: this.targetPivot.clone(),
        distance: this.targetDistance,
        yaw: this.targetYaw,
        pitch: this.targetPitch
    };

    this.curPivot = this.targetPivot.clone();
    this.curDistance = this.targetDistance;
    this.curYaw = this.targetYaw;
    this.curPitch = this.targetPitch;

    this.quat = new pc.Quat();
    this.vec = new pc.Vec3();
    this.right = new pc.Vec3();
    this.up = new pc.Vec3();

    // Pointer attivi (mouse o dita)
    this.pointers = {};
    this.pointerCount = 0;
    this.pinchDist = 0;
    this.pinchMid = new pc.Vec2();

    var canvas = this.app.graphicsDevice.canvas;
    this.canvas = canvas;
    canvas.style.touchAction = 'none';

    this._down = this.onPointerDown.bind(this);
    this._move = this.onPointerMove.bind(this);
    this._up = this.onPointerUp.bind(this);
    this._wheel = this.onWheel.bind(this);
    this._menu = function (e) { e.preventDefault(); };
    this._key = this.onKey.bind(this);

    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._up);
    canvas.addEventListener('pointercancel', this._up);
    canvas.addEventListener('wheel', this._wheel, { passive: false });
    canvas.addEventListener('contextmenu', this._menu);
    window.addEventListener('keydown', this._key);

    this.on('destroy', function () {
        canvas.removeEventListener('pointerdown', this._down);
        canvas.removeEventListener('pointermove', this._move);
        canvas.removeEventListener('pointerup', this._up);
        canvas.removeEventListener('pointercancel', this._up);
        canvas.removeEventListener('wheel', this._wheel);
        canvas.removeEventListener('contextmenu', this._menu);
        window.removeEventListener('keydown', this._key);
    }, this);

    this.applyTransform();
};

// ---------- Input ----------

OrbitCamera.prototype.onPointerDown = function (e) {
    this.canvas.setPointerCapture(e.pointerId);
    var pan = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
    this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY, pan: pan };
    this.pointerCount = Object.keys(this.pointers).length;
    if (this.pointerCount === 2) this.startPinch();
};

OrbitCamera.prototype.onPointerMove = function (e) {
    var p = this.pointers[e.pointerId];
    if (!p) return;
    var dx = e.clientX - p.x;
    var dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.pointerCount === 1) {
        if (p.pan) this.pan(dx, dy);
        else this.orbit(dx, dy);
    } else if (this.pointerCount === 2) {
        this.updatePinch();
    }
};

OrbitCamera.prototype.onPointerUp = function (e) {
    if (!this.pointers[e.pointerId]) return;
    delete this.pointers[e.pointerId];
    this.pointerCount = Object.keys(this.pointers).length;
    if (this.pointerCount === 2) this.startPinch();
};

OrbitCamera.prototype.onWheel = function (e) {
    if (!this.enableZoom) return;
    e.preventDefault();
    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 33;      // righe -> pixel
    this.zoom(Math.exp(delta * 0.001 * this.zoomSensitivity));
};

OrbitCamera.prototype.onKey = function (e) {
    if (e.key === 'f' || e.key === 'F') this.resetView();
};

OrbitCamera.prototype.getTwo = function () {
    var ids = Object.keys(this.pointers);
    return [this.pointers[ids[0]], this.pointers[ids[1]]];
};

OrbitCamera.prototype.startPinch = function () {
    var t = this.getTwo();
    this.pinchDist = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
    this.pinchMid.set((t[0].x + t[1].x) / 2, (t[0].y + t[1].y) / 2);
};

OrbitCamera.prototype.updatePinch = function () {
    var t = this.getTwo();
    var dist = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
    var mx = (t[0].x + t[1].x) / 2;
    var my = (t[0].y + t[1].y) / 2;
    if (this.pinchDist > 0 && dist > 0) this.zoom(this.pinchDist / dist);
    this.pan(mx - this.pinchMid.x, my - this.pinchMid.y);
    this.pinchDist = dist;
    this.pinchMid.set(mx, my);
};

// ---------- Azioni ----------

OrbitCamera.prototype.orbit = function (dx, dy) {
    if (!this.enableOrbit) return;
    this.targetYaw -= dx * this.orbitSensitivity;
    this.targetPitch = pc.math.clamp(this.targetPitch - dy * this.orbitSensitivity, this.minPitch, this.maxPitch);
};

OrbitCamera.prototype.pan = function (dx, dy) {
    if (!this.enablePan) return;
    // Spostamento in unita mondo pari ai pixel trascinati alla distanza attuale
    var cam = this.entity.camera;
    var h = this.canvas.clientHeight || 1;
    var worldPerPixel = 2 * this.curDistance * Math.tan(cam.fov * 0.5 * pc.math.DEG_TO_RAD) / h;
    var s = worldPerPixel * this.panSensitivity;
    this.right.copy(this.entity.right).mulScalar(-dx * s);
    this.up.copy(this.entity.up).mulScalar(dy * s);
    this.targetPivot.add(this.right).add(this.up);
};

OrbitCamera.prototype.zoom = function (factor) {
    if (!this.enableZoom) return;
    this.targetDistance = pc.math.clamp(this.targetDistance * factor, this.minDistance, this.maxDistance);
};

OrbitCamera.prototype.resetView = function () {
    this.targetPivot.copy(this.home.pivot);
    this.targetDistance = this.home.distance;
    this.targetYaw = this.home.yaw;
    this.targetPitch = this.home.pitch;
};

// ---------- Update ----------

OrbitCamera.prototype.update = function (dt) {
    var k = 1 - Math.exp(-this.damping * dt);
    this.curYaw += (this.targetYaw - this.curYaw) * k;
    this.curPitch += (this.targetPitch - this.curPitch) * k;
    this.curDistance += (this.targetDistance - this.curDistance) * k;
    this.curPivot.lerp(this.curPivot, this.targetPivot, k);
    this.applyTransform();
};

OrbitCamera.prototype.applyTransform = function () {
    this.quat.setFromEulerAngles(this.curPitch, this.curYaw, 0);
    this.vec.set(0, 0, this.curDistance);
    this.quat.transformVector(this.vec, this.vec);
    this.vec.add(this.curPivot);
    this.entity.setPosition(this.vec);
    this.entity.setRotation(this.quat);
};
