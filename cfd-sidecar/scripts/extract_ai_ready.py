#!/usr/bin/env python3
"""
Extract OpenFOAM VTK output into AI-ready format for ML training.
Input: Case path, vx, vy, vz (velocity components)
Output: metadata.json and node_data.csv in the case directory
"""

import csv
import json
import re
import sys
from pathlib import Path

try:
    import numpy as np
    import pyvista as pv
except ImportError as e:
    print(f"Error: {e}. Install with: pip install pyvista numpy", file=sys.stderr)
    sys.exit(1)


def find_vtk_with_velocity(case_path):
    """Find a VTK file containing the U (velocity) field."""
    vtk_dir = Path(case_path) / "VTK"
    if not vtk_dir.exists():
        return None

    vtk_files = list(vtk_dir.rglob("*.vtk")) + list(vtk_dir.rglob("*.vtu"))
    for vtk_file in sorted(vtk_files, key=lambda p: -len(str(p))):
        try:
            mesh = pv.read(str(vtk_file))
            if mesh.array_names and any("U" in n for n in mesh.array_names):
                return mesh
            if hasattr(mesh, "cell_data") and mesh.cell_data and "U" in mesh.cell_data:
                return mesh
            if hasattr(mesh, "point_data") and mesh.point_data and "U" in mesh.point_data:
                return mesh
        except Exception:
            continue
    if vtk_files:
        return pv.read(str(vtk_files[0]))
    return None


def read_nu_from_transport_properties(case_path):
    """Read kinematic viscosity from constant/transportProperties."""
    tp_path = Path(case_path) / "constant" / "transportProperties"
    if not tp_path.exists():
        return 1e-5
    try:
        content = tp_path.read_text()
        m = re.search(r"nu\s+(\d+\.?\d*e?-?\d*)", content, re.IGNORECASE)
        if m:
            return float(m.group(1))
    except Exception:
        pass
    return 1e-5


def main():
    if len(sys.argv) < 5:
        print("Usage: extract_ai_ready.py <case_path> <vx> <vy> <vz>", file=sys.stderr)
        sys.exit(1)

    case_path = Path(sys.argv[1]).resolve()
    if not case_path.exists():
        print(f"Case path does not exist: {case_path}", file=sys.stderr)
        sys.exit(1)

    vx = float(sys.argv[2])
    vy = float(sys.argv[3])
    vz = float(sys.argv[4])

    mesh = find_vtk_with_velocity(case_path)
    if mesh is None:
        print("No VTK file with velocity field found", file=sys.stderr)
        sys.exit(1)

    bounds = mesh.bounds
    bbox = {"min": list(bounds[::2]), "max": list(bounds[1::2])}

    nu = read_nu_from_transport_properties(case_path)

    run_id = case_path.name
    timestamp = int(run_id.replace("case_", "")) if run_id.startswith("case_") else 0

    metadata = {
        "run_id": run_id,
        "timestamp": timestamp,
        "velocity": {"x": vx, "y": vy, "z": vz},
        "viscosity": nu,
        "bounding_box": bbox,
    }

    metadata_path = case_path / "metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Wrote {metadata_path}")

    u_arr = None
    p_arr = None
    points = None

    if "U" in mesh.cell_data and "p" in mesh.cell_data:
        u_arr = np.asarray(mesh.cell_data["U"])
        p_arr = np.asarray(mesh.cell_data["p"])
        points = mesh.cell_centers().points
    elif "U" in mesh.point_data and "p" in mesh.point_data:
        u_arr = np.asarray(mesh.point_data["U"])
        p_arr = np.asarray(mesh.point_data["p"])
        points = mesh.points
    elif "U" in mesh.cell_data:
        u_arr = np.asarray(mesh.cell_data["U"])
        points = mesh.cell_centers().points
        p_arr = np.asarray(mesh.cell_data["p"]) if "p" in mesh.cell_data else np.zeros(len(points))
    elif "U" in mesh.point_data:
        u_arr = np.asarray(mesh.point_data["U"])
        points = mesh.points
        p_arr = np.asarray(mesh.point_data["p"]) if "p" in mesh.point_data else np.zeros(len(points))
    else:
        for name in mesh.array_names:
            if "U" in name:
                arr = mesh.get_array(name)
                if arr is not None and arr.ndim == 2 and arr.shape[1] == 3:
                    u_arr = np.asarray(arr)
                    if mesh.n_points == arr.shape[0]:
                        points = mesh.points
                        p_arr = np.asarray(mesh.point_data["p"]) if "p" in mesh.point_data else np.zeros(len(points))
                    else:
                        points = mesh.cell_centers().points
                        p_arr = np.asarray(mesh.cell_data["p"]) if "p" in mesh.cell_data else np.zeros(len(points))
                    break
        if u_arr is None:
            print("Velocity field 'U' not found in VTK data", file=sys.stderr)
            sys.exit(1)

    if u_arr.ndim == 1:
        u_arr = u_arr.reshape(-1, 3)
    if len(p_arr) != len(points):
        p_arr = np.zeros(len(points))

    csv_path = case_path / "node_data.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["x", "y", "z", "velocity_x", "velocity_y", "velocity_z", "pressure"])
        for i in range(len(points)):
            pt = points[i]
            u = u_arr[i] if i < len(u_arr) else [0, 0, 0]
            p = float(p_arr[i]) if i < len(p_arr) else 0.0
            writer.writerow([
                pt[0], pt[1], pt[2],
                u[0], u[1], u[2],
                p,
            ])

    print(f"Wrote {csv_path} ({len(points)} rows)")


if __name__ == "__main__":
    main()
