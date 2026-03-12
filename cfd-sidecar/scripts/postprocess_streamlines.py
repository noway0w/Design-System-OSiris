#!/usr/bin/env python3
"""
Post-process OpenFOAM VTK output to generate streamlines and export as JSON.
Input: Case path (e.g. cases/case_1730000000000)
Output: streamlines.json in the case directory
"""

import json
import os
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
            if mesh.cell_data and "U" in mesh.cell_data:
                return mesh
            if mesh.point_data and "U" in mesh.point_data:
                return mesh
        except Exception:
            continue
    if vtk_files:
        return pv.read(str(vtk_files[0]))
    return None


def get_velocity_array(mesh):
    """Get velocity array from mesh (cell or point data)."""
    for name in ["U", "U_0", "velocity"]:
        if name in mesh.cell_data:
            return mesh.cell_data[name], "cell"
        if name in mesh.point_data:
            return mesh.point_data[name], "point"
    for name in mesh.array_names:
        if "U" in name or "velocity" in name.lower():
            arr = mesh.get_array(name)
            if arr is not None and arr.ndim == 2 and arr.shape[1] == 3:
                loc = "point" if mesh.n_points == arr.shape[0] else "cell"
                return arr, loc
    return None, None


def main():
    if len(sys.argv) < 2:
        print("Usage: postprocess_streamlines.py <case_path>", file=sys.stderr)
        sys.exit(1)

    case_path = Path(sys.argv[1]).resolve()
    if not case_path.exists():
        print(f"Case path does not exist: {case_path}", file=sys.stderr)
        sys.exit(1)

    mesh = find_vtk_with_velocity(case_path)
    if mesh is None:
        print("No VTK file with velocity field found", file=sys.stderr)
        sys.exit(1)

    vel_arr, vel_loc = get_velocity_array(mesh)
    if vel_arr is None:
        print("Velocity field 'U' not found in VTK data", file=sys.stderr)
        sys.exit(1)

    bounds = mesh.bounds
    xmin, xmax = bounds[0], bounds[1]
    ymin, ymax = bounds[2], bounds[3]
    zmin, zmax = bounds[4], bounds[5]

    n_seeds = 20
    seed_points = []
    for i in range(n_seeds):
        for j in range(n_seeds):
            x = xmin + 0.1 * (xmax - xmin)
            y = ymin + (i / max(n_seeds - 1, 1)) * (ymax - ymin) * 0.8 + 0.1 * (ymax - ymin)
            z = zmin + (j / max(n_seeds - 1, 1)) * (zmax - zmin) * 0.8 + 0.1 * (zmax - zmin)
            seed_points.append([x, y, z])

    seeds = pv.PolyData(seed_points)

    try:
        streams = mesh.streamlines_from_source(
            seeds,
            vectors="U" if "U" in mesh.array_names else mesh.array_names[0],
            max_time=100,
            integration_direction="forward",
            max_step_length=0.01,
            initial_step_length=0.01,
            max_steps=500,
        )
    except Exception as e:
        for name in mesh.array_names:
            if mesh[name].ndim == 2 and mesh[name].shape[1] == 3:
                try:
                    streams = mesh.streamlines_from_source(
                        seeds,
                        vectors=name,
                        max_time=100,
                        integration_direction="forward",
                        max_step_length=0.01,
                        initial_step_length=0.01,
                        minimum_step_length=1e-6,
                        maximum_number_of_steps=500,
                    )
                    break
                except Exception:
                    continue
        else:
            print(f"Streamline generation failed: {e}", file=sys.stderr)
            sys.exit(1)

    result = {"streamlines": [], "bounds": {"min": list(bounds[::2]), "max": list(bounds[1::2])}}

    if streams.n_cells == 0:
        streams = streams.extract_all_edges()

    lines = streams.lines
    if lines is None or len(lines) == 0:
        out_path = case_path / "streamlines.json"
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)
        return

    pts = streams.points
    vel_data = None
    if "U" in streams.point_data:
        vel_data = streams.point_data["U"]
    elif "IntegrationTime" in streams.point_data:
        vel_data = streams.point_data["IntegrationTime"]

    i = 0
    while i < len(lines):
        n = int(lines[i])
        i += 1
        if i + n > len(lines):
            break
        indices = [int(lines[i + k]) for k in range(n)]
        i += n
        line_pts = pts[indices].tolist()

        velocities = []
        if vel_data is not None and vel_data.ndim >= 1:
            for idx in indices:
                if idx < len(vel_data):
                    v = vel_data[idx]
                    if np.ndim(v) == 0:
                        velocities.append(float(v))
                    else:
                        mag = np.sqrt(float(v[0]) ** 2 + float(v[1]) ** 2 + float(v[2]) ** 2)
                        velocities.append(mag)
                else:
                    velocities.append(0.0)
        if len(velocities) < len(line_pts):
            velocities.extend([velocities[-1] if velocities else 0.0] * (len(line_pts) - len(velocities)))

        result["streamlines"].append({"points": line_pts, "velocity": velocities[: len(line_pts)]})

    out_path = case_path / "streamlines.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote {len(result['streamlines'])} streamlines to {out_path}")


if __name__ == "__main__":
    main()
