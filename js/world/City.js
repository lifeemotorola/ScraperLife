import * as THREE from 'three';
import { COLORS, lamp, road } from './Environment.js';
import { Building, makeSign } from './Building.js';

export class City {
  constructor(scene, physics) { this.scene = scene; this.physics = physics; this.generator = null; this.generatorPosition = new THREE.Vector3(-3, 0, -2); }
  build() {
    this.addTerrain();
    road(this.scene, -2, 0, 8, 62, 'z'); road(this.scene, 7, -8, 48, 7, 'x'); road(this.scene, -18, 13, 28, 5, 'x');
    // Meter-scale building footprints and 3–5 storey heights make Waterside feel like a real city around human-scale characters.
    const buildingData = [
      [-21,18,10,8,9,0x5b6b62,'KOLLIE COURT'],[-10,22,9,6,8.5,0x455956,'MOBILE REPAIR'],[0,20,10,8,11,0x6b6554,'MARKET'],
      [15,20,12,8,9,0x4c6460,'BAY VIEW'],[-23,3,8,12,9,0x485d5b,'NIGHT CLINIC'],[-15,-10,11,7,9,0x5d6a62,'PRINT + PAY'],
      [14,-13,13,10,10,0x505e59,'KORMAH OFFICE'],[3,-23,12,7,9,0x605c4f,'WAREHOUSE 6'],[21,1,7,10,9,0x526864,'DOCKS'],[7,7,7,6,8,0x5a5d53,'FOOD'],
    ];
    buildingData.forEach(([x,z,width,depth,height,color,label]) => new Building(this.scene, this.physics, { x,z,width,depth,height,color,label }).add());
    this.makeWorkshop(-4, -3);
    [[21,-10,0xa64e36],[19,-17,0x26555d],[22,12,0x9d613c],[16,8,0x2d6264],[-11,4,0x935b3b]].forEach(([x,z,color]) => this.container(x,z,color));
    [[-27,-13],[-27,26],[-5,27],[17,25],[-18,-22],[5,13],[23,-25]].forEach(([x,z]) => this.palm(x,z));
    for (let i = 0; i < 35; i += 1) this.debris(-27 + (i * 17) % 51, -25 + (i * 29) % 52, i % 2);
    for (let z = -25; z < 28; z += 10) lamp(this.scene, 23, z);
    for (let x = -24; x < 22; x += 12) lamp(this.scene, x, 9);
  }
  addTerrain() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(72,72), new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(15,72), new THREE.MeshStandardMaterial({ color: COLORS.water, roughness: .3, metalness: .1, transparent: true, opacity: .88 }));
    water.rotation.x = -Math.PI / 2; water.position.set(31,-.07,0); this.scene.add(water);
    for (let z = -28; z <= 28; z += 7) { const foam = new THREE.Mesh(new THREE.PlaneGeometry(10,.14), new THREE.MeshBasicMaterial({ color: 0xa4d5cc, transparent: true, opacity: .4 })); foam.rotation.x = -Math.PI / 2; foam.position.set(26.2,.01,z); this.scene.add(foam); }
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
  }
  activateRadio() { this.generator.light.material.color.setHex(0x59d8ba); this.generator.light.material.emissive.setHex(0x0b756c); const light = new THREE.PointLight(COLORS.teal,9,16);light.position.set(-3,3,-3);this.scene.add(light); }
  container(x,z,color) { const body = new THREE.Mesh(new THREE.BoxGeometry(4,2.5,2),new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.2}));body.position.set(x,1.25,z);body.castShadow=true;body.receiveShadow=true;this.scene.add(body);this.physics.addBuilding({x,z,width:4,depth:2}); }
  palm(x,z) { const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.13,.24,3.5,7),new THREE.MeshStandardMaterial({color:0x563d29,roughness:1}));trunk.position.set(x,1.75,z);trunk.rotation.z=Math.sin(x)*.12;trunk.castShadow=true;this.scene.add(trunk);const leaves=new THREE.MeshStandardMaterial({color:0x245d45,side:THREE.DoubleSide,roughness:.9});for(let i=0;i<7;i+=1){const leaf=new THREE.Mesh(new THREE.PlaneGeometry(2.1,.53),leaves);leaf.position.set(x,3.55,z);leaf.rotation.y=i*(Math.PI*2/7);leaf.rotation.x=-.35;leaf.rotation.z=.15;this.scene.add(leaf);} }
  debris(x,z,type) { const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(type?.14:.22,0),new THREE.MeshStandardMaterial({color:type?0x8f693d:0x45514e,roughness:1}));mesh.position.set(x,.15,z);mesh.rotation.set(x,z,1);this.scene.add(mesh); }
}
