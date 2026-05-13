/* Shim: Three.js BufferGeometryUtils exports mergeBufferGeometries but web-ifc-three expects mergeGeometries */
export {
  mergeBufferGeometries,
  mergeBufferGeometries as mergeGeometries,
  mergeBufferAttributes,
  interleaveAttributes,
  estimateBytesUsed,
  mergeVertices,
  toTrianglesDrawMode,
  computeMorphedAttributes,
  mergeGroups,
  toCreasedNormals,
  computeTangents,
  computeMikkTSpaceTangents,
  deepCloneAttribute,
  deinterleaveAttribute,
  deinterleaveGeometry
} from 'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/jsm/utils/BufferGeometryUtils.js';
