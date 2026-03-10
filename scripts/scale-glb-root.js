#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

function padTo4(buffer, fillByte) {
  const padding = (4 - (buffer.length % 4)) % 4;
  if (padding === 0) return buffer;
  const pad = Buffer.alloc(padding, fillByte);
  return Buffer.concat([buffer, pad]);
}

function readGlb(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error(`Not a GLB file: ${filePath}`);
  }
  const version = bytes.readUInt32LE(4);
  if (version !== GLB_VERSION) {
    throw new Error(`Unsupported GLB version ${version}. Expected 2.`);
  }
  const totalLength = bytes.readUInt32LE(8);
  let offset = 12;
  let jsonChunk = null;
  let binChunk = null;

  while (offset < totalLength) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === JSON_CHUNK_TYPE) jsonChunk = chunkData;
    if (chunkType === BIN_CHUNK_TYPE) binChunk = chunkData;
    offset += 8 + chunkLength;
  }

  if (!jsonChunk) throw new Error('GLB JSON chunk not found.');
  return {
    gltf: JSON.parse(jsonChunk.toString('utf8').replace(/\u0000+$/u, '').trim()),
    binChunk,
  };
}

function writeGlb(filePath, gltf, binChunk) {
  const jsonBytes = Buffer.from(JSON.stringify(gltf));
  const jsonPadded = padTo4(jsonBytes, 0x20);
  const chunks = [];

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(JSON_CHUNK_TYPE, 4);
  chunks.push(jsonHeader, jsonPadded);

  if (binChunk && binChunk.length > 0) {
    const binPadded = padTo4(binChunk, 0x00);
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binPadded.length, 0);
    binHeader.writeUInt32LE(BIN_CHUNK_TYPE, 4);
    chunks.push(binHeader, binPadded);
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(GLB_VERSION, 4);
  header.writeUInt32LE(12 + body.length, 8);

  fs.writeFileSync(filePath, Buffer.concat([header, body]));
}

function scaleGlbRoot(inputPath, outputPath, factor) {
  const { gltf, binChunk } = readGlb(inputPath);
  if (!Array.isArray(gltf.nodes)) gltf.nodes = [];
  if (!Array.isArray(gltf.scenes) || gltf.scenes.length === 0) {
    throw new Error('GLB has no scenes.');
  }

  const sceneIndex = Number.isInteger(gltf.scene) ? gltf.scene : 0;
  const scene = gltf.scenes[sceneIndex];
  const currentRoots = Array.isArray(scene.nodes) ? scene.nodes.slice() : [];
  if (currentRoots.length === 0) {
    throw new Error('Scene has no root nodes to scale.');
  }

  const scaledRootIndex = gltf.nodes.length;
  gltf.nodes.push({
    name: 'ARScaleRoot',
    scale: [factor, factor, factor],
    children: currentRoots,
  });
  scene.nodes = [scaledRootIndex];

  writeGlb(outputPath, gltf, binChunk);
}

function main() {
  const inputArg = process.argv[2] || 'public/model.glb';
  const outputArg = process.argv[3] || 'public/model-ar.glb';
  const factorArg = process.argv[4] || '0.0125';

  const inputPath = path.resolve(inputArg);
  const outputPath = path.resolve(outputArg);
  const factor = Number(factorArg);

  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`Invalid scale factor: ${factorArg}`);
  }

  scaleGlbRoot(inputPath, outputPath, factor);
  console.log(`Created scaled GLB: ${outputPath}`);
  console.log(`Scale factor: ${factor}`);
}

main();
