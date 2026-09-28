export class ThreeBackground {
  constructor(containerId = "three-bg") {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.particles = null;
    this.lines = null;
    this.animationId = null;
    this.isFallback = false;
    this.hasThree = Boolean(window.THREE);
  }

  async init() {
    if (!this.container) {
      return;
    }

    if (!this.hasThree) {
      this.useFallback();
      return;
    }

    try {
      this.setupScene();
      this.attachResizeHandler();
      this.animate();
    } catch (error) {
      console.warn("Three.js failed to initialize; falling back to CSS background.", error);
      this.useFallback();
    }
  }

  setupScene() {
    const THREE = window.THREE;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 60;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    const particleCount = window.innerWidth < 768 ? 180 : 280;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 80;
      positions[index * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 55;

      const color = new THREE.Color().setHSL(0.56 + Math.random() * 0.08, 0.7, 0.6);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.17,
      transparent: true,
      opacity: 0.8,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x6fdcff,
      transparent: true,
      opacity: 0.12,
    });

    const lineSegments = [];
    for (let index = 0; index < particleCount; index += 1) {
      const start = new THREE.Vector3(
        positions[index * 3],
        positions[index * 3 + 1],
        positions[index * 3 + 2]
      );

      const targetIndex = (index + 10) % particleCount;
      const end = new THREE.Vector3(
        positions[targetIndex * 3],
        positions[targetIndex * 3 + 1],
        positions[targetIndex * 3 + 2]
      );

      const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      lineSegments.push(new THREE.Line(lineGeometry, lineMaterial));
    }

    this.lines = new THREE.Group();
    lineSegments.forEach((line) => this.lines.add(line));
    this.scene.add(this.lines);
    this.camera.lookAt(0, 0, 0);
  }

  animate() {
    if (!this.scene || !this.camera || !this.renderer) {
      return;
    }

    const render = () => {
      const time = performance.now() * 0.00018;
      this.camera.position.x = Math.sin(time) * 6;
      this.camera.position.y = Math.cos(time * 0.85) * 4;
      this.camera.lookAt(0, 0, 0);

      if (this.particles) {
        this.particles.rotation.y += 0.0008;
        this.particles.rotation.x = Math.sin(time * 0.7) * 0.18;
      }

      if (this.lines) {
        this.lines.rotation.z = time * 0.25;
      }

      this.renderer.render(this.scene, this.camera);
      this.animationId = requestAnimationFrame(render);
    };

    render();
  }

  attachResizeHandler() {
    const handleResize = () => {
      if (!this.renderer || !this.camera) {
        return;
      }

      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    };

    window.addEventListener("resize", handleResize);
    this._resizeHandler = handleResize;
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }

    if (this.container) {
      this.container.innerHTML = "";
    }
  }

  useFallback() {
    this.isFallback = true;
    if (this.container) {
      this.container.classList.add("canvas-fallback");
    }
  }
}
