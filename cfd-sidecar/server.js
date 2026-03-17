const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const config = require('./config');

const GEOMETRY_ERROR_MSG = 'Geometry is an open shell or non-manifold. CFD requires a watertight solid volume.';

function extractOpenFOAMErrorSnippet(combined) {
  const lines = String(combined).split(/\r?\n/).filter((l) => l.trim());
  const snippet = lines.slice(-4).join('\n').trim();
  return snippet || String(combined).slice(-300).trim();
}

function killProcessTree(proc) {
  try {
    if (process.platform !== 'win32' && proc.pid) {
      process.kill(-proc.pid, 'SIGKILL');
    } else {
      proc.kill('SIGKILL');
    }
  } catch (_) {}
}

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function runCommand(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const opts = { cwd, stdio: ['ignore', 'pipe', 'pipe'] };
    if (process.platform !== 'win32') opts.detached = true;
    const proc = spawn(cmd, args, opts);
    let stderr = '';
    let stdout = '';
    let resolved = false;
    const finish = (err) => {
      if (resolved) return;
      resolved = true;
      if (err) reject(err);
      else resolve();
    };
    const checkOutput = () => {
      const combined = (stdout + stderr).toLowerCase();
      if (combined.includes('fatal error') || combined.includes('fatal io error') || combined.includes("word 'infinity'") || combined.includes('not an external face') || combined.includes('external face of the mesh')) {
        killProcessTree(proc);
        finish(new Error('OpenFOAM Crash: ' + extractOpenFOAMErrorSnippet(stdout + stderr)));
      }
    };
    proc.stdout.on('data', (d) => { stdout += d.toString(); checkOutput(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); checkOutput(); });
    proc.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      if (code !== 0) {
        const combined = stdout + stderr;
        const err = combined.slice(-500);
        const errLower = combined.toLowerCase();
        if (errLower.includes('fatal error') || errLower.includes('fatal io error') || errLower.includes('not an external face') || errLower.includes('external face of the mesh') || errLower.includes('infinity') || errLower.includes("word 'infinity'") || (errLower.includes('scalar') && errLower.includes('blockmesh'))) {
          reject(new Error('OpenFOAM Crash: ' + extractOpenFOAMErrorSnippet(combined)));
        } else {
          reject(new Error(`${cmd} failed (${code}): ${err}`));
        }
      } else resolve();
    });
    proc.on('error', (e) => {
      if (resolved) return;
      resolved = true;
      if (e.code === 'ENOENT') {
        reject(new Error(`OpenFOAM not found. Install OpenFOAM and add blockMesh, snappyHexMesh, simpleFoam, foamToVTK to PATH. (${e.message})`));
      } else {
        reject(e);
      }
    });
  });
}

function runCommandDocker(cmd, args, casePath) {
  const absCase = path.resolve(casePath);
  const caseArgs = ['-case', '/case'];
  const fullCmd = [cmd, ...caseArgs, ...args].join(' ');
  const dockerArgs = [
    'run', '--rm',
    '-v', `${absCase}:/case`,
    '-w', '/case',
    '-e', 'FOAM_CASE=/case',
    config.dockerImage,
    'bash', '-c', fullCmd
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', dockerArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    let resolved = false;
    const finish = (err) => {
      if (resolved) return;
      resolved = true;
      if (err) reject(err);
      else resolve();
    };
    const checkOutput = () => {
      const combined = (stdout + stderr).toLowerCase();
      if (combined.includes('fatal error') || combined.includes('fatal io error') || combined.includes("word 'infinity'") || combined.includes('not an external face') || combined.includes('external face of the mesh')) {
        killProcessTree(proc);
        finish(new Error('OpenFOAM Crash: ' + extractOpenFOAMErrorSnippet(stdout + stderr)));
      }
    };
    proc.stdout.on('data', (d) => { stdout += d.toString(); checkOutput(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); checkOutput(); });
    proc.on('close', (code) => {
      if (resolved) return;
      resolved = true;
      if (code !== 0) {
        const combined = stdout + stderr;
        const err = combined.slice(-800);
        const errLower = combined.toLowerCase();
        if (errLower.includes('permission denied')) {
          reject(new Error('Docker permission denied. Run: npm run start:docker (or: newgrp docker, then npm start)'));
        } else if (errLower.includes('fatal error') || errLower.includes('fatal io error') || errLower.includes('not an external face') || errLower.includes('external face of the mesh') || errLower.includes('infinity') || errLower.includes("word 'infinity'") || (errLower.includes('scalar') && errLower.includes('blockmesh'))) {
          reject(new Error('OpenFOAM Crash: ' + extractOpenFOAMErrorSnippet(combined)));
        } else {
          reject(new Error(`${cmd} failed (${code}): ${err}`));
        }
      } else {
        resolve();
      }
    });
    proc.on('error', (e) => {
      if (e.code === 'ENOENT') {
        reject(new Error('Docker not found. Install Docker or install OpenFOAM natively.'));
      } else {
        reject(e);
      }
    });
  });
}

let useDocker = config.useDocker;

async function runOpenFOAM(cmd, args, casePath) {
  if (useDocker) {
    return runCommandDocker(cmd, args, casePath);
  }
  try {
    return await runCommand(cmd, args, casePath);
  } catch (e) {
    if (e.message && e.message.includes('ENOENT') && !useDocker) {
      useDocker = true;
      console.log('OpenFOAM not in PATH, using Docker...');
      return runCommandDocker(cmd, args, casePath);
    }
    throw e;
  }
}

app.get('/health', async (req, res) => {
  try {
    if (config.useDocker) {
      const proc = spawn('docker', ['run', '--rm', config.dockerImage, 'blockMesh', '-help'], { stdio: ['ignore', 'pipe', 'pipe'] });
      await new Promise((resolve, reject) => {
        proc.on('close', (code) => (code === 0 || code === 1 ? resolve() : reject(new Error('Docker OpenFOAM check failed'))));
        proc.on('error', reject);
      });
    } else {
      await runCommand('blockMesh', ['-help'], process.cwd());
    }
    res.json({ ok: true, openfoam: true });
  } catch (e) {
    if (!config.useDocker) {
      try {
        const proc = spawn('docker', ['run', '--rm', config.dockerImage, 'blockMesh', '-help'], { stdio: ['ignore', 'pipe', 'pipe'] });
        await new Promise((resolve, reject) => {
          proc.on('close', (code) => (code === 0 || code === 1 ? resolve() : reject(new Error('Docker failed'))));
          proc.on('error', reject);
        });
        res.json({ ok: true, openfoam: true });
        return;
      } catch (_) {}
    }
    res.status(503).json({ ok: false, openfoam: false, error: e.message });
  }
});

app.get('/shutdown', (req, res) => {
  const addr = req.ip || req.connection?.remoteAddress || '';
  const allowed = addr === '127.0.0.1' || addr === '::ffff:127.0.0.1' || addr === '::1' || String(addr).includes('127.0.0.1');
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 100);
});

function getStlBounds(buffer) {
  if (buffer.length < 84) throw new Error('Invalid STL file');
  const count = buffer.readUInt32LE(80);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let offset = 84;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < 3; j++) {
      const x = buffer.readFloatLE(offset + 12 + j * 12);
      const y = buffer.readFloatLE(offset + 12 + j * 12 + 4);
      const z = buffer.readFloatLE(offset + 12 + j * 12 + 8);
      if (x < min[0]) min[0] = x;
      if (x > max[0]) max[0] = x;
      if (y < min[1]) min[1] = y;
      if (y > max[1]) max[1] = y;
      if (z < min[2]) min[2] = z;
      if (z > max[2]) max[2] = z;
    }
    offset += 50;
  }
  return { min, max };
}

function generateBlockMeshDict(bounds) {
  const margin = 0.001; // 1mm margin
  const min = bounds.min.map(v => v - margin);
  const max = bounds.max.map(v => v + margin);
  
  // Calculate dimensions and adaptive cell counts
  const Lx = max[0] - min[0];
  const Ly = max[1] - min[1];
  const Lz = max[2] - min[2];
  
  // Base resolution: ~1mm cells (0.001m) or at least 5 cells in thinnest dimension
  let cellSize = Math.min(Lx, Ly, Lz) / 5;
  // Limit cell size to be reasonable (e.g., not smaller than 0.2mm)
  cellSize = Math.max(cellSize, 0.0002);
  // Also limit max cell size to avoid huge cells in large domains (e.g. 5mm)
  cellSize = Math.min(cellSize, 0.005);

  const nx = Math.min(100, Math.max(1, Math.round(Lx / cellSize)));
  const ny = Math.min(100, Math.max(1, Math.round(Ly / cellSize)));
  const nz = Math.min(100, Math.max(1, Math.round(Lz / cellSize)));
  
  // Create 8 vertices for the block
  const vertices = [
    [min[0], min[1], min[2]], // 0
    [max[0], min[1], min[2]], // 1
    [max[0], max[1], min[2]], // 2
    [min[0], max[1], min[2]], // 3
    [min[0], min[1], max[2]], // 4
    [max[0], min[1], max[2]], // 5
    [max[0], max[1], max[2]], // 6
    [min[0], max[1], max[2]]  // 7
  ];

  return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  (generated)                           |
|   \\\\  /    A nd           | Web:      www.OpenFOAM.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

convertToMeters 1;

vertices
(
    (${vertices[0].join(' ')})
    (${vertices[1].join(' ')})
    (${vertices[2].join(' ')})
    (${vertices[3].join(' ')})
    (${vertices[4].join(' ')})
    (${vertices[5].join(' ')})
    (${vertices[6].join(' ')})
    (${vertices[7].join(' ')})
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (${nx} ${ny} ${nz}) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    inlet
    {
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }
    outlet
    {
        type patch;
        faces
        (
            (1 2 6 5)
        );
    }
    walls
    {
        type wall;
        faces
        (
            (0 3 2 1)
            (0 1 5 4)
            (3 7 6 2)
            (4 5 6 7)
        );
    }
);

// ************************************************************************* //
`;
}


function generateTopoSetDict(bounds) {
  const eps = 0.002; // small epsilon
  const min = bounds.min;
  const max = bounds.max;
  
  return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  (generated)                           |
|   \\\\  /    A nd           | Web:      www.OpenFOAM.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      topoSetDict;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

actions
(
    {
        name    inletFaces;
        type    faceSet;
        action  new;
        source  boxToFace;
        sourceInfo
        {
            box (${min[0]-eps} ${min[1]-eps} ${min[2]-eps}) (${min[0]+eps} ${max[1]+eps} ${max[2]+eps});
        }
    }
    {
        name    outletFaces;
        type    faceSet;
        action  new;
        source  boxToFace;
        sourceInfo
        {
            box (${max[0]-eps} ${min[1]-eps} ${min[2]-eps}) (${max[0]+eps} ${max[1]+eps} ${max[2]+eps});
        }
    }
);

// ************************************************************************* //
`;
}

function generateCreatePatchDict() {
  return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  (generated)                           |
|   \\\\  /    A nd           | Web:      www.OpenFOAM.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      createPatchDict;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

pointSync false;

patches
(
    {
        name inlet;
        patchInfo
        {
            type patch;
        }
        constructFrom set;
        set inletFaces;
    }
    {
        name outlet;
        patchInfo
        {
            type patch;
        }
        constructFrom set;
        set outletFaces;
    }
);

// ************************************************************************* //
`;
}


function generateUDict(velocity) {
  const v = velocity || [1, 0, 0];
  return `/*--------------------------------*- C++ -*----------------------------------*\\
| =========                 |                                                 |
| \\\\      /  F ield         | OpenFOAM: The Open Source CFD Toolbox           |
|  \\\\    /   O peration     | Version:  (generated)                           |
|   \\\\  /    A nd           | Web:      www.OpenFOAM.com                      |
|    \\\\/     M anipulation  |                                                 |
\\*---------------------------------------------------------------------------*/
FoamFile
{
    version     2.0;
    format      ascii;
    class       volVectorField;
    object      U;
}
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 1 -1 0 0 0 0];

internalField   uniform (${v.join(' ')});

boundaryField
{
    inlet
    {
        type            fixedValue;
        value           uniform (${v.join(' ')});
    }
    outlet
    {
        type            inletOutlet;
        inletValue      uniform (0 0 0);
        value           uniform (${v.join(' ')});
    }
    walls
    {
        type            noSlip;
    }
    // Fallback
    ".*"
    {
        type            noSlip;
    }
}

// ************************************************************************* //
`;
}

app.post('/run-cfd', upload.single('geometry'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Missing geometry file' });
  }

  const caseId = `case_${Date.now()}`;
  const casePath = path.join(config.casesDir, caseId);

  try {
    ensureDir(config.casesDir);
    copyDir(config.templateDir, casePath);

    const triSurfaceDir = path.join(casePath, 'constant', 'triSurface');
    ensureDir(triSurfaceDir);
    const stlPath = path.join(triSurfaceDir, 'geometry.stl');
    fs.writeFileSync(stlPath, req.file.buffer);

    // Parse velocity from request or default
    const vx = parseFloat(req.body.vx) || 1;
    const vy = parseFloat(req.body.vy) || 0;
    const vz = parseFloat(req.body.vz) || 0;
    const velocity = [vx, vy, vz];

    // 1a. Reject empty STLs (e.g. failed DXF extrusion)
    const stlStats = fs.statSync(stlPath);
    if (stlStats.size < 100) {
      if (fs.existsSync(casePath)) {
        try { fs.rmSync(casePath, { recursive: true }); } catch (rmErr) { console.warn('[CFD] Cleanup failed:', rmErr.message); }
      }
      return res.status(400).json({ error: 'The generated 3D model is empty. The CAD file may be a 2D wireframe that failed to extrude.' });
    }

    // 1b. Python mesh healing (trimesh: fix normals, fill holes). Required—no fallback.
    const healedPath = path.join(triSurfaceDir, 'geometry_healed.stl');
    const healScript = path.join(config.scriptDir, 'heal_mesh.py');
    let pythonStderr = '';
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('python3', [healScript, stlPath, healedPath], { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
        proc.stderr.on('data', (d) => { pythonStderr += d.toString(); });
        proc.stdout.on('data', () => {});
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(pythonStderr));
        });
        proc.on('error', reject);
      });
      fs.renameSync(healedPath, stlPath);
    } catch (e) {
      if (fs.existsSync(casePath)) {
        try { fs.rmSync(casePath, { recursive: true }); } catch (rmErr) { console.warn('[CFD] Cleanup failed:', rmErr.message); }
      }
      const errSnippet = (e.message || pythonStderr || 'Unknown error').substring(0, 300);
      return res.status(400).json({ error: 'Mesh healing failed: ' + errSnippet });
    }

    // 1. Calculate bounds and generate blockMeshDict
    const bounds = getStlBounds(fs.readFileSync(stlPath));
    const blockMeshDictContent = generateBlockMeshDict(bounds);
    fs.writeFileSync(path.join(casePath, 'system', 'blockMeshDict'), blockMeshDictContent);

    // 2. Set locationInMesh to a point in the FLUID (wind tunnel), 5% away from walls
    const margin = 0.001;
    const clamp = (v) => (Number.isFinite(v) ? v : 0);
    const blockMin = bounds.min.map((v) => clamp(v - margin));
    const blockMax = bounds.max.map((v) => clamp(v + margin));
    const dx = blockMax[0] - blockMin[0];
    const dy = blockMax[1] - blockMin[1];
    const dz = blockMax[2] - blockMin[2];
    const locX = blockMin[0] + (dx * 0.05);
    const locY = blockMax[1] - (dy * 0.05);
    const locZ = blockMax[2] - (dz * 0.05);
    const locInFluid = [locX, locY, locZ].map(clamp);
    const snappyDictPath = path.join(casePath, 'system', 'snappyHexMeshDict');
    let snappyDict = fs.readFileSync(snappyDictPath, 'utf8');
    snappyDict = snappyDict.replace(/locationInMesh\s*\([^)]+\);/, `locationInMesh (${locInFluid.join(' ')});`);
    fs.writeFileSync(snappyDictPath, snappyDict);

    // 3. Generate TopoSet and CreatePatch Dicts
    const topoSetDictContent = generateTopoSetDict(bounds);
    fs.writeFileSync(path.join(casePath, 'system', 'topoSetDict'), topoSetDictContent);
    const createPatchDictContent = generateCreatePatchDict();
    fs.writeFileSync(path.join(casePath, 'system', 'createPatchDict'), createPatchDictContent);

    // 4. Generate U Dict
    const uDictContent = generateUDict(velocity);
    fs.writeFileSync(path.join(casePath, '0', 'U'), uDictContent);

    const geometryErrorMsg = 'Geometry is an open shell or non-manifold. CFD requires a watertight solid volume.';

    console.log(`[CFD] Case ${caseId}: blockMesh...`);
    try {
      await runOpenFOAM('blockMesh', [], casePath);
    } catch (e) {
      if ((e.message || '').startsWith('OpenFOAM Crash:')) throw e;
      const err = (e.message || '').toLowerCase();
      if (err.includes('infinity') || err.includes('fatal') || err.includes('scalar')) {
        throw new Error(geometryErrorMsg);
      }
      throw e;
    }
    console.log(`[CFD] Case ${caseId}: snappyHexMesh...`);
    try {
      await runOpenFOAM('snappyHexMesh', ['-overwrite'], casePath);
    } catch (e) {
      if ((e.message || '').startsWith('OpenFOAM Crash:')) throw e;
      const err = (e.message || '').toLowerCase();
      if (err.includes('non-manifold') || err.includes('not an external face') || err.includes('external face of the mesh')) {
        throw new Error(geometryErrorMsg);
      }
      if (err.includes('fatal') && (err.includes('surface') || err.includes('geometry') || err.includes('location'))) {
        throw new Error(geometryErrorMsg);
      }
      throw e;
    }

    const boundaryPath = path.join(casePath, 'constant', 'polyMesh', 'boundary');
    const hasInletOutlet = fs.existsSync(boundaryPath) && (() => {
      try {
        const content = fs.readFileSync(boundaryPath, 'utf8');
        return content.includes('inlet') && content.includes('outlet');
      } catch (_) { return false; }
    })();
    if (!hasInletOutlet) {
      console.log(`[CFD] Case ${caseId}: topoSet...`);
      await runOpenFOAM('topoSet', [], casePath);
      console.log(`[CFD] Case ${caseId}: createPatch...`);
      try {
        await runOpenFOAM('createPatch', ['-overwrite'], casePath);
      } catch (e) {
        if ((e.message || '').startsWith('OpenFOAM Crash:')) throw e;
        throw new Error(geometryErrorMsg);
      }
    }

    console.log(`[CFD] Case ${caseId}: simpleFoam...`);
    await runOpenFOAM('simpleFoam', [], casePath);
    console.log(`[CFD] Case ${caseId}: foamToVTK...`);
    await runOpenFOAM('foamToVTK', ['-fields', "'(U p)'"], casePath);

    console.log(`[CFD] Case ${caseId}: postprocess...`);
    const pyScript = path.join(config.scriptDir, 'postprocess_streamlines.py');
    await runCommand('python3', [pyScript, casePath], __dirname);

    const streamlinesPath = path.join(casePath, 'streamlines.json');
    if (!fs.existsSync(streamlinesPath)) {
      throw new Error('Post-processing did not produce streamlines.json');
    }

    console.log(`[CFD] Case ${caseId}: done`);
    res.json({ caseId, streamlinesUrl: `/streamlines/${caseId}` });
  } catch (e) {
    console.error(`[CFD] Case ${caseId}: failed:`, e.message);
    if (fs.existsSync(casePath)) {
      try { fs.rmSync(casePath, { recursive: true }); } catch (rmErr) { console.warn('[CFD] Cleanup failed:', rmErr.message); }
    }
    const isGeometryError = e.message && (
      e.message.includes('open shell') || e.message.includes('non-manifold') || e.message.includes('watertight')
    );
    const status = isGeometryError ? 400 : 500;
    res.status(status).json({ error: e.message || 'CFD run failed' });
  }
});

app.get('/streamlines/:caseId', (req, res) => {
  const caseId = req.params.caseId;
  if (!/^case_\d+$/.test(caseId)) {
    return res.status(400).json({ error: 'Invalid case ID' });
  }
  const filePath = path.join(config.casesDir, caseId, 'streamlines.json');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Streamlines not found' });
  }
  res.sendFile(path.resolve(filePath));
});

ensureDir(config.casesDir);
console.log(`Cases directory: ${config.casesDir}`);

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`CFD sidecar listening on http://localhost:${port}`);
    if (port !== config.port) {
      console.log(`  (Port ${config.port} was in use. Update public_html/corintis/cfd-config.js: window.CFD_SERVER = 'http://localhost:${port}')`);
    }
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      const next = port + 1;
      if (next <= 8100) {
        console.warn(`Port ${port} in use, trying ${next}...`);
        startServer(next);
      } else {
        console.error(`Ports ${config.port}-8100 in use. Set CFD_PORT to a free port.`);
        process.exit(1);
      }
    } else {
      throw e;
    }
  });
}

startServer(config.port);
