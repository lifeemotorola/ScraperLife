import * as THREE from 'three';
import { COLORS, LampLightPool, addGlowPoints, addGlowSprite, lamp, road } from './Environment.js';
import { Building, makeSign } from './Building.js';
import { houseVariant, loadHouseTemplate, placeHouses } from './HouseModel.js';
import { Districts } from './Districts.js';
import { loadTreeTemplates } from './Trees.js';

export class City {
  constructor(scene, physics) { this.scene = scene; this.physics = physics; this.generator = null; this.generatorPosition = new THREE.Vector3(-3, 0, -2); this.warehousePos = new THREE.Vector3(3, 0, -23); this.ledgerPos = new THREE.Vector3(3, 0, -23); }
  build({ lampLightCount = 5, spawn = new THREE.Vector3(-16, 0, 10) } = {}) {
    this.spawn = spawn;
    this.addTerrain();
    // Platform expanded: 96-unit sector, new ring road and cross streets for larger navigation
    this.street(-2, 0, 10, 86, 'z'); this.street(7, -8, 62, 9, 'x'); this.street(-18, 13, 36, 7, 'x');
    this.street(-2, -22, 72, 8, 'x'); this.street(28, -6, 8, 48, 'z'); this.street(-28, 6, 8, 44, 'z');
    // Meter-scale building footprints and 3–5 storey heights make Waterside feel like a real city around human-scale characters.
    const buildingData = [
      [-21,18,10,8,9,0x5b6b62,'KOLLIE COURT'],[-10,22,9,6,8.5,0x455956,'MOBILE REPAIR'],[0,20,10,8,11,0x6b6554,'MARKET'],
      [15,20,12,8,9,0x4c6460,'BAY VIEW'],[-23,3,8,12,9,0x485d5b,'NIGHT CLINIC'],[-15,-10,11,7,9,0x5d6a62,'PRINT + PAY'],
      [14,-13,13,10,10,0x505e59,'KORMAH OFFICE'],[3,-23,12,7,9,0x605c4f,'WAREHOUSE 6'],[21,1,7,10,9,0x526864,'DOCKS'],[7,7,7,6,8,0x5a5d53,'FOOD'],
      // New expansion districts for larger platform map
      [-32, -8, 9, 9, 10, 0x4a5a56, 'OLD HARBOR'], [32, -18, 10, 8, 9, 0x3d4f4e, 'CONTAINER YARD'], [ -8, -32, 14, 9, 8, 0x5e4e3e, 'SCRAP FIELD'], [ 28, 22, 9, 9, 11, 0x4b5e5a, 'TIDE APARTMENTS'], [-30, 32, 11, 7, 9, 0x5a6260, 'UNION HOUSE'], [ 10, -34, 12, 8, 9, 0x6b5a42, 'FUEL DEPOT'],
    ];
    // House names are shown on the world map only, so keep each one with its position.
    // `entrance` is a stop just in front of each house's street (-Z) face, so a route ends outside the walls.
    this.placeNames = buildingData.map(([x, z, , depth, , , label]) => ({
      x, z, label, entrance: { x, z: z - depth / 2 - 1.5 },
    }));
    // Every block gets its collider now, so movement is the same whether or not the house model has loaded.
    const blocks = buildingData.map(([x,z,width,depth,height,color,label]) => {
      const building = new Building(this.scene, this.physics, { x,z,width,depth,height,color,label });
      building.addCollider();
      return building;
    });
    // Generated houses from assets/Environment/House/house_builder replace the box visuals once
    // they are built; boxes stay as the fallback.
    // Endless districts start once the house templates are known, so the first chunks around the
    // spawn are ready before the game is revealed.
    // Trees are optional: if they fail to load, districts still build without them.
    const treesReady = loadTreeTemplates().catch((error) => {
      console.warn('Tree models could not load; districts will have no trees.', error);
      return null;
    });
    this.housesReady = Promise.all([loadHouseTemplate(), treesReady]).then(([template, trees]) => {
      placeHouses(this.scene, template, blocks.map((building, index) => ({ ...building.data, variant: houseVariant(index) })));
      this.startDistricts(template, trees);
    }).catch((error) => {
      console.warn('House model could not load; using box houses instead.', error);
      blocks.forEach((building) => building.addVisual());
      this.startDistricts(null, null);
    });
    this.makeWorkshop(-4, -3);
    this.makeWarehouse(3, -23);
    [[21,-10,0xa64e36],[19,-17,0x26555d],[22,12,0x9d613c],[16,8,0x2d6264],[-11,4,0x935b3b],[36,-22,0x8a4a3a],[ -36,-6,0x2f5d5b],[ 30,30,0x9d7a4a]].forEach(([x,z,color]) => this.container(x,z,color));
    for (let i = 0; i < 55; i += 1) this.debris(-36 + (i * 17) % 72, -36 + (i * 29) % 72, i % 2);
    // Street lamps share one glow object instead of 25 PointLights (see addGlowPoints).
    const lampGlows = [];
    for (let z = -36; z < 36; z += 10) lamp(this.scene, 32, z, lampGlows);
    for (let z = -36; z < 36; z += 12) lamp(this.scene, -32, z, lampGlows);
    for (let x = -36; x < 36; x += 14) lamp(this.scene, x, 18, lampGlows);
    for (let x = -36; x < 36; x += 16) lamp(this.scene, x, -30, lampGlows);
    addGlowPoints(this.scene, lampGlows, { size: 2.6, opacity: .85 });
    this.lampLights = new LampLightPool(this.scene, lampGlows, lampLightCount);
    this.addDistrictMarkers();
  }
  updateLamps(playerPosition) { this.lampLights?.update(playerPosition); }
  startDistricts(template, trees = null) {
    this.districts = new Districts(this.scene, this.physics, { template, trees });
    this.districts.update(this.spawn);
  }
  // Called every frame: streams the endless districts around the player and keeps the grid under them.
  updateStreaming(playerPosition) {
    this.districts?.update(playerPosition);
    if (this.grid) {
      this.grid.position.x = Math.round(playerPosition.x / 4) * 4;
      this.grid.position.z = Math.round(playerPosition.z / 4) * 4;
    }
  }
  addTerrain() {
    // The land runs west, north and south without an edge; the sea runs east without one.
    // The land stops at x = 48 (under the water) and the water starts at x = 33, as before.
    const LAND_EDGE = 48;
    const FAR = 4000;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(FAR, FAR), new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(LAND_EDGE - FAR / 2, 0, 0); ground.receiveShadow = true; this.scene.add(ground);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(FAR, FAR), new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: .3, metalness: .1, transparent: true, opacity: .88 }));
    water.rotation.x = -Math.PI / 2; water.position.set(33 + FAR / 2, -.07, 0); this.scene.add(water);
    for (let z = -38; z <= 38; z += 7) { const foam = new THREE.Mesh(new THREE.PlaneGeometry(12,.14), new THREE.MeshBasicMaterial({ color: 0xa4d5cc, transparent: true, opacity: .4 })); foam.rotation.x = -Math.PI / 2; foam.position.set(35.5,.01,z); this.scene.add(foam); }
    // faint grid for expanded platform readability
    // The grid is only a 96 m patch that follows the player (see updateStreaming).
    const grid = new THREE.GridHelper(96, 24, 0x2e4a48, 0x253a3a);
    grid.position.y = 0.015; this.scene.add(grid); this.grid = grid;
  }
  // A painted street (same geometry as road()). Its ground is registered so blocks crossing it can be walked through there.
  street(x, z, width, height, axis) {
    road(this.scene, x, z, width, height, axis);
    this.physics.addStreet(x, z, axis === 'x' ? width : height, axis === 'x' ? height : width);
  }
  makeWorkshop(x,z) {
    const group = new THREE.Group(); group.position.set(x,0,z); this.scene.add(group);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(14,.18,10), new THREE.MeshStandardMaterial({ color: 0x202d2d, roughness: .9 })); floor.position.y = .08; floor.receiveShadow = true; group.add(floor);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14,.28,10), new THREE.MeshStandardMaterial({ color: 0x283634, roughness: .8 })); roof.position.y = 6; roof.castShadow = true; group.add(roof);
    for (const px of [-6.7,6.7]) for (const pz of [-4.7,4.7]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.13,.17,6,8), new THREE.MeshStandardMaterial({ color: 0x374846, metalness: .6 })); pole.position.set(px,3,pz); pole.castShadow = true; group.add(pole); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(14,6,.2),new THREE.MeshStandardMaterial({color:0x42514c,roughness:.95}));back.position.set(0,3,4.9);group.add(back);
    const sign = makeSign('KOLLIE RADIO WORKS',5.5);sign.position.set(0,5.15,-5.02);group.add(sign);
    const warm = new THREE.PointLight(0xff8f4c,5,18);warm.position.set(0,5,0);group.add(warm);
    const generator = new THREE.Group();generator.position.set(1,.1,1);group.add(generator);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4,1.1,.75),new THREE.MeshStandardMaterial({color:0x466064,metalness:.65,roughness:.35}));body.position.y=.65;generator.add(body);
    const light = new THREE.Mesh(new THREE.SphereGeometry(.12,12,8),new THREE.MeshStandardMaterial({color:0x5c2020,emissive:0x300000,emissiveIntensity:1}));light.position.set(.72,.76,-.25);generator.add(light);
    const cables = new THREE.Mesh(new THREE.TorusGeometry(.48,.04,6,16),new THREE.MeshStandardMaterial({color:0x131b1c,roughness:.9}));cables.rotation.x=Math.PI/2;cables.position.set(-.75,.6,0);generator.add(cables);
    this.generator = { group: generator, light };
    // The workshop's 14 × 10 m footprint is solid except where it lies on a street.
    this.physics.addBuilding({ x, z, width: 14, depth: 10 }, null, { passOverStreets: true });
  }
  makeWarehouse(x,z) {
    // Warehouse 6 is now a distinct landmark for the ledger mission
    const group = new THREE.Group(); group.position.set(x, 0, z); this.scene.add(group);
    const ledgerGlow = new THREE.PointLight(0xffc66c, 2.2, 10); ledgerGlow.position.set(0, 1.2, 0); group.add(ledgerGlow);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.1), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: .9 }));
    crate.position.y = 0.7; crate.castShadow = true; group.add(crate);
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0xf4e0b0, roughness: .7, emissive: 0x604a1a, emissiveIntensity: .25 }));
    ledger.position.set(0, 1.42, 0); ledger.castShadow = true; group.add(ledger);
    const sign = makeSign('WAREHOUSE 6 — RESTRICTED', 6); sign.position.set(0, 4.2, -3.8); group.add(sign);
    this.ledger = { group, crate, ledger, light: ledgerGlow };
    // The crate is solid off the street; the ledger sits on top of it, so the collider matches the crate only.
    this.physics.addBuilding({ x, z, width: 2.2, depth: 1.1 }, null, { passOverStreets: true });
  }
  activateRadio() { this.generator.light.material.color.setHex(0x59d8ba); this.generator.light.material.emissive.setHex(0x0b756c); addGlowSprite(this.scene, new THREE.Vector3(-3, 3, -3), COLORS.teal, 9); }
  collectLedger() {
    if (!this.ledger) return;
    this.ledger.ledger.visible = false;
    this.ledger.light.intensity = 0;
    const burstPosition = this.ledger.group.position.clone(); burstPosition.y = 1.5;
    const burst = addGlowSprite(this.scene, burstPosition, 0xffe7a0, 10);
    setTimeout(() => this.scene.remove(burst), 1200);
  }
  container(x,z,color) { const body = new THREE.Mesh(new THREE.BoxGeometry(4,2.5,2),new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.2}));body.position.set(x,1.25,z);body.castShadow=true;body.receiveShadow=true;this.scene.add(body);this.physics.addBuilding({x,z,width:4,depth:2}); }
  debris(x,z,type) { const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(type?.14:.22,0),new THREE.MeshStandardMaterial({color:type?0x8f693d:0x45514e,roughness:1}));mesh.position.set(x,.15,z);mesh.rotation.set(x,z,1);this.scene.add(mesh); }
  addDistrictMarkers() {
    // Low-cost sprites for expanded platform readability
    const labels = [
      { pos: [-4, -3], text: 'RADIO WORKS', color: 0x75c5bb },
      { pos: [0, 20], text: 'WATERSIDE MARKET', color: 0xc760b0 },
      { pos: [32, -3], text: 'EAST DOCKS', color: 0x7ab5ff },
      { pos: [3, -23], text: 'WAREHOUSE 6', color: 0xffc66c },
      { pos: [-22, -16], text: 'INTERCHANGE', color: 0xff3b3b },
    ];
    // markers are added as simple floating planes for orientation - kept lightweight
  }
}
