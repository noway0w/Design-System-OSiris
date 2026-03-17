#!/usr/bin/env python3
"""
Heal STL mesh: fix normals, fill holes, remove degenerate faces.
Use before OpenFOAM snappyHexMesh to close micro-gaps and fix flipped normals.
"""
import sys
import traceback

try:
    import trimesh
except ImportError:
    print("Error: trimesh not installed. Run: pip install trimesh", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) < 3:
        print("Usage: heal_mesh.py <input.stl> <output.stl>", file=sys.stderr)
        sys.exit(1)
    inp, out = sys.argv[1], sys.argv[2]

    try:
        mesh = trimesh.load(inp, force='mesh')
        if mesh is None:
            print("Error: Could not load mesh", inp, file=sys.stderr)
            sys.exit(1)
        if not isinstance(mesh, trimesh.Trimesh):
            print("Error: Expected Trimesh, got", type(mesh), file=sys.stderr)
            sys.exit(1)
        mesh.process()
        trimesh.repair.fix_normals(mesh)
        trimesh.repair.fill_holes(mesh)
        mesh.export(out)
    except Exception as e:
        sys.stderr.write(traceback.format_exc())
        print("Error: Mesh healing failed:", str(e), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
