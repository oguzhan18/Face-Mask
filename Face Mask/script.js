function setupScene(vrm_parent){
  window.renderer = new THREE.WebGLRenderer();
  renderer.setSize(320, 240);
  renderer.setPixelRatio(window.devicePixelRatio);
  vrm_parent.appendChild(renderer.domElement);
  window.camera = new THREE.PerspectiveCamera(50.0, 4.0 / 3.0, 0.1, 5.0);
  window.scene = new THREE.Scene();
  scene.add(new THREE.DirectionalLight(0xffffff));
  new THREE.GLTFLoader().load(
    "https://pixiv.github.io/three-vrm/examples/models/three-vrm-girl.vrm",
    initVRM, 
    progress => console.log("Loading model...",100.0 * (progress.loaded / progress.total),"%"),
    console.error
  );
}

async function initVRM(gltf) {
  window.vrm = await THREE.VRM.from(gltf);
  scene.add(vrm.scene);
  vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.Hips).rotation.y = Math.PI;
  vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.LeftUpperArm).rotation.z = Math.PI * 2 / 5;
  vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.RightUpperArm).rotation.z = -Math.PI * 2 / 5;
  const head = vrm.humanoid.getBoneNode( THREE.VRMSchema.HumanoidBoneName.Head );
  camera.position.set( 0.0, head.getWorldPosition(new THREE.Vector3()).y + 0.05, 0.5 );
  window.clock = new THREE.Clock();
  clock.start();
  renderer.render(scene, camera);
}

async function setupCamera(videoElement) {
  const constraints = {video: {width: 320,height: 240}, audio: false};
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoElement.srcObject = stream;
  return new Promise(resolve => {
    videoElement.onloadedmetadata = () => {
      videoElement.play();
      resolve();
    };
  });
}

function estimatePose(annotations) {
  const faces = annotations.silhouette;
  const x1 = new THREE.Vector3().fromArray(faces[9]);
  const x2 = new THREE.Vector3().fromArray(faces[27]);
  const y1 = new THREE.Vector3().fromArray(faces[18]);
  const y2 = new THREE.Vector3().fromArray(faces[0]);
  const xaxis = x2.sub(x1).normalize();
  const yaxis = y2.sub(y1).normalize();
  const zaxis = new THREE.Vector3().crossVectors(xaxis, yaxis);
  const mat = new THREE.Matrix4().makeBasis(xaxis, yaxis, zaxis).premultiply(
    new THREE.Matrix4().makeRotationZ(Math.PI)
  );
  return new THREE.Quaternion().setFromRotationMatrix(mat);
}

function startRender(input, output, model) {
  const ctx = output.getContext("2d");
  async function renderFrame() {
    requestAnimationFrame(renderFrame);
    vrm.update(clock.getDelta());
    const faces = await model.estimateFaces(input, false, false);
    ctx.clearRect(0, 0, output.width, output.height);
    faces.forEach(face => {
      face.scaledMesh.forEach(xy => {
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 1, 0, 2 * Math.PI);
        ctx.fill();
      });
      const annotations = face.annotations;
      const q = estimatePose(annotations);
      const head = vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName.Head);
      head.quaternion.slerp(q, 0.1);
      const blink = Math.max( 0.0, 1.0 - 10.0 * Math.abs( ( clock.getElapsedTime() % 4.0 ) - 2.0 ) );
      vrm.blendShapeProxy.setValue(THREE.VRMSchema.BlendShapePresetName.Blink, blink);
      const lipsLowerInner = annotations.lipsLowerInner[5];
      const lipsUpperInner = annotations.lipsUpperInner[5];
      const expressionA = Math.max(0, Math.min(1, (lipsLowerInner[1] - lipsUpperInner[1])/10.0));
      vrm.blendShapeProxy.setValue(THREE.VRMSchema.BlendShapePresetName.A, expressionA);
    });
    renderer.render(scene, camera);
  }
  renderFrame();
}

function loading(onoff) {
  document.getElementById("loadingicon").style.display = onoff ? "inline" : "none";
}

async function start() {
  const input = document.getElementById("input");
  const output = document.getElementById("output");
  const vrm_parent = document.getElementById("vrm_parent");
  loading(true);
  setupScene(vrm_parent);
  await setupCamera(input);
  const model = await facemesh.load({ maxFaces: 1 });
  startRender(input, output, model);
  loading(false);
}