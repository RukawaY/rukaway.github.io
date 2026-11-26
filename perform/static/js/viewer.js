// Interactive viewer: PERFORM's physics rollouts played in a loop with WebGL2, no libraries. Each clip is
// static/viewer/<clip>.bin(.gz): the hand's collision hulls, the object mesh and their per-frame poses. The hand is drawn
// as brushed metal, the object as matte peach, on a checkerboard floor with a soft shadow. Drag to orbit, scroll to zoom,
// W / A / S / D / Q / E to move the camera, click to pause or resume.
(function () {
  "use strict";

  // ---------------------------------------------------------------- small mat4 helpers (column-major)
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(eye, target, up) {
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function poseMatrix(px, py, pz, qx, qy, qz, qw) {
    var xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
    return new Float32Array([1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0, 2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
      2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0, px, py, pz, 1]);
  }

  // ---------------------------------------------------------------- shaders
  var VS_MESH = "#version 300 es\nin vec3 aPos; in vec3 aNor; uniform mat4 uMV, uP; out vec3 vPos; out vec3 vNor;\n" +
    "void main(){ vec4 p = uMV * vec4(aPos, 1.0); vPos = p.xyz; vNor = mat3(uMV) * aNor; gl_Position = uP * p; }";
  // hand hulls: a metallic studio reflection (sky / ground environment plus key and fill highlights) in view space
  var FS_METAL = "#version 300 es\nprecision highp float; in vec3 vPos; in vec3 vNor; out vec4 o;\n" +
    "const vec3 TINT = vec3(141.0, 160.0, 203.0) / 255.0;\n" +
    "const vec3 KEY = vec3(-0.45315, 0.42262, 0.78488); const vec3 FILL = vec3(0.63302, -0.17365, 0.75441);\n" +
    "void main(){\n" +
    "  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); vec3 v = normalize(-vPos);\n" +
    "  if (dot(n, v) < 0.0) n = -n;\n" +
    "  vec3 r = 2.0 * dot(n, v) * n - v; float up = r.y;\n" +
    "  float sky = 0.30 + (0.85 - 0.30) * pow(clamp(up / 0.6, 0.0, 1.0), 0.6);\n" +
    "  float gnd = 0.30 + (0.50 - 0.30) * pow(clamp(-up / 0.5, 0.0, 1.0), 0.8);\n" +
    "  float env = up >= 0.0 ? sky : gnd; if (abs(up) < 0.18 * 0.35) env = 0.30;\n" +
    "  float hl = 0.7 * exp(-(1.0 - dot(r, KEY)) / 0.10) + 0.40 * exp(-(1.0 - dot(r, FILL)) / 0.14);\n" +
    "  o = vec4(clamp(TINT * (0.18 + env) + hl * (0.6 + 0.4 * TINT), 0.0, 1.0), 1.0); }";
  // object: matte Lambert shading from three camera-fixed lights plus ambient light, gamma 2.2
  var FS_LIT = "#version 300 es\nprecision highp float; in vec3 vPos; in vec3 vNor; out vec4 o;\n" +
    "const vec3 BASE = vec3(245.0, 198.0, 173.0) / 255.0;\n" +
    "const vec3 L1 = vec3(-0.45315, 0.42262, 0.78488); const vec3 L2 = vec3(0.63302, -0.17365, 0.75441);\n" +
    "const vec3 L3 = vec3(0.0, -0.34202, -0.93969);\n" +
    "void main(){\n" +
    "  vec3 n = normalize(vNor); if (dot(n, -vPos) < 0.0) n = -n;\n" +
    "  vec3 b = pow(BASE, vec3(2.2));\n" +
    "  float d = 3.0 * max(dot(n, L1), 0.0) + 1.3 * max(dot(n, L2), 0.0) + 0.9 * max(dot(n, L3), 0.0);\n" +
    "  vec3 c = b * (0.42 + d / 3.14159265);\n" +
    "  o = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0); }";
  // floor: a large quad at z = ground with a box-filtered 4 cm checkerboard and a soft shadow ellipse
  var VS_GROUND = "#version 300 es\nin vec2 aXY; uniform mat4 uVP; uniform float uZ; out vec2 vXY;\n" +
    "void main(){ vXY = aXY; gl_Position = uVP * vec4(aXY, uZ, 1.0); }";
  var FS_GROUND = "#version 300 es\nprecision highp float; in vec2 vXY; out vec4 o;\n" +
    "uniform vec4 uShadow; uniform float uLift;\n" +
    "const vec3 A = vec3(128.0, 132.0, 141.0) / 255.0; const vec3 B = vec3(104.0, 108.0, 117.0) / 255.0;\n" +
    "float filt(float p, float w){ return 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w; }\n" +
    "void main(){\n" +
    "  vec2 p = vXY / 0.04; vec2 w = fwidth(p) + 1e-3;\n" +
    "  float m = clamp(0.5 - 0.5 * filt(p.x, w.x) * filt(p.y, w.y), 0.0, 1.0);\n" +
    "  vec3 col = mix(A, B, m);\n" +
    "  vec2 q = (vXY - uShadow.xy) / uShadow.zw; float sh = exp(-dot(q, q) * 1.6);\n" +
    "  col *= 1.0 - 0.32 * uLift * sh;\n" +
    "  o = vec4(col, 1.0); }";

  function compile(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos"); gl.bindAttribLocation(p, 1, "aNor"); gl.bindAttribLocation(p, 0, "aXY");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }

  // ---------------------------------------------------------------- data
  function parse(buf) {
    var hlen = new DataView(buf).getUint32(0, true);
    var H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
    var base = 4 + hlen;
    if (H.format === 2) {
      // compact layout: int16 vertices with a per-mesh scale and per-channel frame-to-frame pose deltas (channel-major),
      // unpacked into the .bin layout (float32 vertices, frame-major int16 poses)
      var mesh2 = function (d) {
        var q = new Int16Array(buf, base + d.v, d.nv * 3), v = new Float32Array(d.nv * 3);
        for (var i = 0; i < v.length; i++) v[i] = q[i] * d.s;
        return { v: v, f: new Uint16Array(buf, base + d.f, d.nf * 3) };
      };
      var T = H.T, nc = H.nBodies * 7, D = new Int16Array(buf, base + H.poses, T * nc), P = new Int16Array(T * nc);
      for (var c = 0; c < nc; c++) for (var t = 0, acc = 0; t < T; t++) { acc += D[c * T + t]; P[t * nc + c] = acc; }
      return { H: H, parts: H.parts.map(mesh2), obj: mesh2(H.obj), poses: P };
    }
    function mesh(d) {
      return { v: new Float32Array(buf, base + d.v, d.nv * 3), f: new Uint16Array(buf, base + d.f, d.nf * 3) };
    }
    return { H: H, parts: H.parts.map(mesh), obj: mesh(H.obj), poses: new Int16Array(buf, base + H.poses, H.T * H.nBodies * 7) };
  }
  // the gzipped .bin.gz (~40 % smaller) where the browser can unpack it, else (or if it fails) the plain .bin
  function fetchBin(url) {
    function plain() { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }); }
    if (!window.DecompressionStream || !/\.bin$/.test(url)) return plain();
    return fetch(url + ".gz").then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        var u = new Uint8Array(buf);
        if (u[0] !== 0x1f || u[1] !== 0x8b) return buf;          // already unpacked by the server (Content-Encoding)
        return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      })
      .catch(plain);
  }
  function vertexNormals(v, f) {
    var n = new Float32Array(v.length);
    for (var i = 0; i < f.length; i += 3) {
      var a = f[i] * 3, b = f[i + 1] * 3, c = f[i + 2] * 3;
      var ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      var wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (var k = 0; k < 3; k++) { var j = f[i + k] * 3; n[j] += nx; n[j + 1] += ny; n[j + 2] += nz; }
    }
    for (var j2 = 0; j2 < n.length; j2 += 3) {
      var l = Math.hypot(n[j2], n[j2 + 1], n[j2 + 2]) || 1; n[j2] /= l; n[j2 + 1] /= l; n[j2 + 2] /= l;
    }
    return n;
  }

  // ---------------------------------------------------------------- viewer
  function Viewer(shell) {
    this.shell = shell;
    this.canvas = shell.querySelector("canvas");
    this.status = shell.querySelector(".viewer-status");
    var gl = this.gl = this.canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) { this.fail("This viewer needs WebGL2."); return; }
    this.metal = compile(gl, VS_MESH, FS_METAL);
    this.lit = compile(gl, VS_MESH, FS_LIT);
    this.ground = compile(gl, VS_GROUND, FS_GROUND);
    var gvao = this.groundVao = gl.createVertexArray(); gl.bindVertexArray(gvao);
    var gb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-40, -40, 40, -40, -40, 40, 40, 40]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.cache = {};
    this.scene = null;
    this.visible = false;
    this.keys = {};
    this.cam = { target: [0, 0, 0], yaw: 0, pitch: 0.35, dist: 0.6 };
    this.offset = [0, 0, 0];          // W A S D / Q E: a shift of the orbit centre away from the hand + object
    this.playing = true;              // a click on the view pauses / resumes
    this.playhead = 0;                // seconds into the loop
    this.pauseBadge = shell.querySelector(".viewer-paused");
    // the clip's input video in the top-left corner: once it can play it drives the playback clock, so the 3D always
    // shows the video's frame
    this.rgbBox = shell.querySelector(".viewer-rgb");
    this.video = this.rgbBox ? this.rgbBox.querySelector("video") : null;
    this.rgbOk = false;
    this.bindInput();
    var self = this;
    if (this.video) this.video.addEventListener("error", function () { self.dropVideo(); });
    this.loop = function (now) { self.raf = 0; self.draw(now); if (self.visible && !document.hidden) self.raf = requestAnimationFrame(self.loop); };
  }
  Viewer.prototype.fail = function (msg) { this.status.textContent = msg; this.shell.classList.add("is-loading"); };
  Viewer.prototype.start = function () { if (!this.raf && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.loop); };

  Viewer.prototype.upload = function (data) {
    var gl = this.gl;
    function vao(m, normals) {
      var a = gl.createVertexArray(); gl.bindVertexArray(a);
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      var nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, normals || new Float32Array(m.v.length), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.f, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao: a, n: m.f.length, bufs: [vb, nb, ib] };
    }
    var H = data.H, T = H.T, nb = H.nBodies, pp = data.poses, s = H.posScale, raw = new Float32Array(T * 3);
    for (var t = 0; t < T; t++) for (var b = 0; b < nb; b++) for (var k = 0; k < 3; k++) raw[t * 3 + k] += (pp[(t * nb + b) * 7 + k] * s + H.centre[k]) / nb;
    var centres = new Float32Array(T * 3), R = 0;
    for (var t2 = 0; t2 < T; t2++) {
      var n = 0;
      for (var j = Math.max(0, t2 - 7); j <= Math.min(T - 1, t2 + 7); j++, n++) for (var k2 = 0; k2 < 3; k2++) centres[t2 * 3 + k2] += raw[j * 3 + k2];
      for (var k3 = 0; k3 < 3; k3++) centres[t2 * 3 + k3] /= n;
      for (var b2 = 0; b2 < nb; b2++) {
        var o = (t2 * nb + b2) * 7;
        R = Math.max(R, Math.hypot(pp[o] * s + H.centre[0] - centres[t2 * 3], pp[o + 1] * s + H.centre[1] - centres[t2 * 3 + 1], pp[o + 2] * s + H.centre[2] - centres[t2 * 3 + 2]));
      }
    }
    return { H: H, poses: pp, centres: centres, localRadius: R + 0.06, parts: data.parts.map(function (m) { return vao(m); }),
      obj: vao(data.obj, vertexNormals(data.obj.v, data.obj.f)) };
  };

  // without a usable video (none, a load error, autoplay refused) the playback runs on its own clock and the corner is hidden
  Viewer.prototype.dropVideo = function () {
    this.rgbOk = false;
    if (this.rgbBox) this.rgbBox.hidden = true;
  };
  Viewer.prototype.setVideo = function (src) {
    var v = this.video;
    if (!v) return;
    v.pause();
    if (!src) { this.dropVideo(); v.removeAttribute("src"); v.load(); return; }
    if (v.getAttribute("src") !== src) { v.src = src; v.load(); }
    this.rgbLocked = false;                // draw() seeks it to the 3D's frame once it can play
    this.rgbOk = true;
    this.rgbBox.hidden = false;
  };
  // run the video only while the 3D plays and is on screen
  Viewer.prototype.syncVideo = function () {
    var v = this.video, self = this;
    if (!v || !this.rgbOk) return;
    if (this.playing && this.scene && this.visible && !document.hidden) {
      if (v.paused) {
        var p = v.play();
        if (p && p.catch) p.catch(function (e) { if (e && e.name === "NotAllowedError") self.dropVideo(); });
      }
    } else if (!v.paused) v.pause();
  };

  Viewer.prototype.load = function (url, label, rgb) {
    var self = this, token = (this.token = {});
    this.status.textContent = "Loading " + label + "...";
    this.shell.classList.add("is-loading");
    this.setVideo(rgb);
    var got = this.cache[url] ? Promise.resolve(this.cache[url]) :
      fetchBin(url).then(function (buf) { return (self.cache[url] = self.upload(parse(buf))); });
    got.then(function (scene) {
      if (token !== self.token) return;
      self.scene = scene;
      self.frameCam(scene);
      self.playhead = 0;
      self.rgbLocked = false;              // the video re-joins at frame 0
      self.setPlaying(true);
      self.shell.classList.remove("is-loading");
      self.start();
    }).catch(function () { if (token === self.token) self.fail("Unable to load " + label + "."); });
  };

  // initial view: from the side of the video camera, 20 degrees above, the content filling about two thirds of the
  // height; the orbit centre follows the hand and the object (smoothed) every frame
  Viewer.prototype.frameCam = function (S) {
    var H = S.H, d = H.camDir, c = this.cam, r = S.localRadius;
    this.offset = [0, 0, 0];
    c.yaw = Math.atan2(d[1], d[0]);
    c.pitch = 0.35;
    c.dist = r / Math.tan(0.5 * 0.7) * 1.25;
    this.minDist = r * 0.3; this.maxDist = r * 25;
  };

  Viewer.prototype.setPlaying = function (on) {
    this.playing = on;
    if (this.pauseBadge) this.pauseBadge.hidden = on;
    this.syncVideo();
  };

  Viewer.prototype.bindInput = function () {
    var self = this, el = this.canvas, drag = null;
    el.tabIndex = 0;
    el.addEventListener("pointerdown", function (e) {
      el.focus({ preventScroll: true });
      drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      self.cam.yaw -= dx * 0.006;
      self.cam.pitch = Math.max(0.03, Math.min(1.45, self.cam.pitch + dy * 0.006));
    });
    el.addEventListener("pointerup", function (e) {
      if (drag && e.pointerId === drag.id && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5 &&
          performance.now() - drag.t0 < 400 && self.scene) self.setPlaying(!self.playing);
      drag = null;
    });
    el.addEventListener("pointercancel", function () { drag = null; });
    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      var k = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      self.cam.dist = Math.max(self.minDist || 0.02, Math.min(self.maxDist || 20, self.cam.dist * k));
    }, { passive: false });
    var MOVE = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, KeyQ: 1, KeyE: 1 };
    el.addEventListener("keydown", function (e) { if (MOVE[e.code]) { self.keys[e.code] = true; e.preventDefault(); } });
    el.addEventListener("keyup", function (e) { self.keys[e.code] = false; });
    el.addEventListener("blur", function () { self.keys = {}; });
  };

  Viewer.prototype.draw = function (now) {
    var gl = this.gl, S = this.scene, c = this.cam;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    // keyboard: move the orbit centre in the camera's heading (W/S), sideways (A/D), down / up (Q/E)
    var dt = Math.min(0.1, ((now - (this.lastNow || now)) / 1000)); this.lastNow = now;
    var sp = c.dist * 0.8 * Math.min(dt, 0.05), fx = -Math.cos(c.yaw), fy = -Math.sin(c.yaw), k = this.keys, f = this.offset;
    if (k.KeyW) { f[0] += fx * sp; f[1] += fy * sp; }
    if (k.KeyS) { f[0] -= fx * sp; f[1] -= fy * sp; }
    if (k.KeyA) { f[0] -= fy * sp; f[1] += fx * sp; }
    if (k.KeyD) { f[0] += fy * sp; f[1] -= fx * sp; }
    if (k.KeyE) f[2] += sp;
    if (k.KeyQ) f[2] -= sp;
    // the 3D runs on its own clock until the video can play; the video then jumps to the 3D's frame and becomes the
    // clock (it loops itself), so the two show the same frame from there on
    var v = this.video, vOn = S && this.rgbOk && v && v.readyState >= 2;
    if (vOn) {
      var end = S.H.T / S.H.fps;
      if (!this.rgbLocked) { this.rgbLocked = true; try { v.currentTime = this.playhead % end; } catch (e) { /* retry */ } }
      if (this.playing) {
        if (v.paused) this.syncVideo();
        if (v.currentTime >= end) v.currentTime = 0;
        this.playhead = Math.min(v.currentTime, end - 1e-4);
      }
    } else if (this.playing && S) this.playhead += dt;

    gl.viewport(0, 0, w, h);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!S) return;
    var H = S.H;
    var t = Math.floor(this.playhead * H.fps) % H.T;
    c.target = [S.centres[t * 3] + this.offset[0], S.centres[t * 3 + 1] + this.offset[1], S.centres[t * 3 + 2] + this.offset[2]];
    var eye = [c.target[0] + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw), c.target[1] + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw),
      c.target[2] + c.dist * Math.sin(c.pitch)];
    var V = lookAt(eye, c.target, [0, 0, 1]);
    var near = Math.max(0.002, c.dist * 0.02);
    var P = perspective(0.7, w / h, near, 200);
    var nb = H.nBodies, pp = S.poses, s = H.posScale, C = H.centre;
    var Ms = [], lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (var b = 0; b < nb; b++) {
      var o = (t * nb + b) * 7;
      var px = pp[o] * s + C[0], py = pp[o + 1] * s + C[1], pz = pp[o + 2] * s + C[2];
      Ms.push(poseMatrix(px, py, pz, pp[o + 3] / 32767, pp[o + 4] / 32767, pp[o + 5] / 32767, pp[o + 6] / 32767));
      lo[0] = Math.min(lo[0], px); lo[1] = Math.min(lo[1], py); lo[2] = Math.min(lo[2], pz);
      hi[0] = Math.max(hi[0], px); hi[1] = Math.max(hi[1], py); hi[2] = Math.max(hi[2], pz);
    }
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    // floor
    var G = this.ground; gl.useProgram(G.p);
    gl.uniformMatrix4fv(G.u.uVP, false, mul(P, V)); gl.uniform1f(G.u.uZ, H.ground);
    var rx = Math.max(0.04, (hi[0] - lo[0]) / 2 + 0.05), ry = Math.max(0.04, (hi[1] - lo[1]) / 2 + 0.05);
    gl.uniform4f(G.u.uShadow, (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, rx, ry);
    gl.uniform1f(G.u.uLift, Math.max(0.25, Math.min(1, 1 - (lo[2] - 0.05 - H.ground) / 0.35)));
    gl.bindVertexArray(this.groundVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // hand hulls (metal), then the object (lit)
    var M = this.metal; gl.useProgram(M.p); gl.uniformMatrix4fv(M.u.uP, false, P);
    for (var i = 0; i < S.parts.length; i++) {
      gl.uniformMatrix4fv(M.u.uMV, false, mul(V, Ms[i]));
      gl.bindVertexArray(S.parts[i].vao); gl.drawElements(gl.TRIANGLES, S.parts[i].n, gl.UNSIGNED_SHORT, 0);
    }
    var L = this.lit; gl.useProgram(L.p); gl.uniformMatrix4fv(L.u.uP, false, P);
    gl.uniformMatrix4fv(L.u.uMV, false, mul(V, Ms[nb - 1]));
    gl.bindVertexArray(S.obj.vao); gl.drawElements(gl.TRIANGLES, S.obj.n, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  };

  // ---------------------------------------------------------------- page wiring: lazy start, clip list, visibility
  function init() {
    var shell = document.getElementById("viewer-container");
    var list = document.querySelector('[data-viewer-target="viewer-container"]');
    if (!shell || !list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll(".clip-item"));
    var viewer = null;
    function select(item) {
      items.forEach(function (b) { b.classList.toggle("is-active", b === item); });
      if (viewer) viewer.load(item.dataset.src, item.dataset.label || item.textContent.trim(), item.dataset.rgb);
    }
    items.forEach(function (item) { item.addEventListener("click", function () { select(item); }); });
    items[0].classList.add("is-active");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !viewer) {
          try { viewer = new Viewer(shell); } catch (err) { shell.querySelector(".viewer-status").textContent = "This viewer needs WebGL2."; return; }
          select(list.querySelector(".clip-item.is-active") || items[0]);
        }
        if (viewer) { viewer.visible = e.isIntersecting; viewer.start(); viewer.syncVideo(); }
      });
    }, { rootMargin: "300px 0px" });
    io.observe(shell);
    document.addEventListener("visibilitychange", function () { if (viewer) { viewer.start(); viewer.syncVideo(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
