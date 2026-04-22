import argparse
import json
import math
from pathlib import Path

import numpy as np
import trimesh


DEFAULTS = {
    "max_cut_mm": 2.0,
    "max_cut_ratio": 0.04,
    "max_volume_loss_ratio": 0.03,
    "min_contact_area_ratio": 0.06,
    "planarity_tolerance_mm": 0.05,
    "base_face_tolerance_mm": 0.08,
    "candidate_count": 11,
}


def parse_args():
    parser = argparse.ArgumentParser(description="Normalize a duck mesh to a flat printable bottom.")
    parser.add_argument("--input", required=True, dest="input_path")
    parser.add_argument("--output", required=True, dest="output_path")
    parser.add_argument("--report", required=True, dest="report_path")
    parser.add_argument("--target-height", required=True, type=float, dest="target_height_mm")
    parser.add_argument("--max-cut-mm", type=float, default=DEFAULTS["max_cut_mm"])
    parser.add_argument("--max-cut-ratio", type=float, default=DEFAULTS["max_cut_ratio"])
    parser.add_argument(
        "--max-volume-loss-ratio",
        type=float,
        default=DEFAULTS["max_volume_loss_ratio"],
    )
    parser.add_argument(
        "--min-contact-area-ratio",
        type=float,
        default=DEFAULTS["min_contact_area_ratio"],
    )
    parser.add_argument(
        "--planarity-tolerance-mm",
        type=float,
        default=DEFAULTS["planarity_tolerance_mm"],
    )
    parser.add_argument(
        "--base-face-tolerance-mm",
        type=float,
        default=DEFAULTS["base_face_tolerance_mm"],
    )
    parser.add_argument("--candidate-count", type=int, default=DEFAULTS["candidate_count"])
    return parser.parse_args()


def load_mesh(path_str):
    path = Path(path_str)
    mesh = trimesh.load(path, force="mesh")

    if not isinstance(mesh, trimesh.Trimesh) or mesh.vertices.size == 0:
        scene = trimesh.load(path, force="scene")
        mesh = scene.dump(concatenate=True)

    if not isinstance(mesh, trimesh.Trimesh) or mesh.vertices.size == 0:
        raise RuntimeError("Unable to load a usable mesh from the input artifact.")

    mesh = mesh.copy()
    mesh.remove_unreferenced_vertices()
    mesh.remove_infinite_values()
    mesh.process(validate=True)
    if hasattr(mesh, "fill_holes"):
        mesh.fill_holes()
    trimesh.repair.fix_normals(mesh)
    return mesh


def dimensions(mesh):
    bounds = mesh.bounds
    extents = bounds[1] - bounds[0]
    return {
        "min_z": float(bounds[0][2]),
        "max_z": float(bounds[1][2]),
        "width": float(extents[0]),
        "depth": float(extents[1]),
        "height": float(extents[2]),
        "xy_bbox_area": float(max(extents[0], 0.0) * max(extents[1], 0.0)),
    }


def safe_volume(mesh):
    try:
        return float(abs(mesh.volume))
    except Exception:
        return 0.0


def planar_base_area(mesh, tolerance):
    vertices_z = mesh.vertices[:, 2]
    min_z = float(vertices_z.min())
    face_vertices = vertices_z[mesh.faces]
    face_z_min = face_vertices.min(axis=1)
    face_z_max = face_vertices.max(axis=1)
    on_base = np.logical_and(face_z_min <= min_z + tolerance, face_z_max <= min_z + tolerance)
    downward = mesh.face_normals[:, 2] < -0.5
    mask = np.logical_and(on_base, downward)
    if not np.any(mask):
        return 0.0
    return float(mesh.area_faces[mask].sum())


def base_planarity(mesh, tolerance):
    vertices_z = mesh.vertices[:, 2]
    min_z = float(vertices_z.min())
    near_base = vertices_z <= min_z + tolerance
    if not np.any(near_base):
        return 0.0
    return float(vertices_z[near_base].max() - min_z)


def translate_to_zero(mesh):
    translated = mesh.copy()
    translated.apply_translation([0.0, 0.0, -translated.bounds[0][2]])
    return translated


def scale_to_target_height(mesh, target_height_mm):
    scaled = mesh.copy()
    current_height = float(scaled.bounds[1][2] - scaled.bounds[0][2])
    if current_height <= 0:
        raise RuntimeError("Mesh height is zero; cannot normalize or scale.")
    scale_factor = target_height_mm / current_height
    scaled.apply_scale(scale_factor)
    scaled.apply_translation([0.0, 0.0, -scaled.bounds[0][2]])
    return scaled, scale_factor


def metrics_for(mesh, original_volume, target_height_mm, cut_depth_units, args):
    mesh_zero = translate_to_zero(mesh)
    mesh_scaled, scale_factor = scale_to_target_height(mesh_zero, target_height_mm)
    dims = dimensions(mesh_scaled)
    base_face_tolerance = args.base_face_tolerance_mm
    base_area = planar_base_area(mesh_scaled, base_face_tolerance)
    volume_scaled = safe_volume(mesh_scaled)
    removed_volume_ratio = 0.0
    if original_volume > 0:
        removed_volume_ratio = max(0.0, (original_volume - safe_volume(mesh_zero)) / original_volume)

    cut_depth_mm = cut_depth_units * scale_factor
    contact_area_ratio = 0.0
    if dims["xy_bbox_area"] > 0:
        contact_area_ratio = base_area / dims["xy_bbox_area"]

    return {
        "mesh": mesh_scaled,
        "scale_factor": float(scale_factor),
        "final_height_mm": dims["height"],
        "base_area_mm2": base_area,
        "contact_area_ratio": float(contact_area_ratio),
        "removed_volume_ratio": float(removed_volume_ratio),
        "cut_depth_mm": float(cut_depth_mm),
        "watertight": bool(mesh_scaled.is_watertight),
        "base_planarity_mm": base_planarity(mesh_scaled, args.planarity_tolerance_mm),
        "triangle_count": int(len(mesh_scaled.faces)),
        "vertices_count": int(len(mesh_scaled.vertices)),
        "width_mm": dims["width"],
        "depth_mm": dims["depth"],
    }


def slice_candidate(mesh, cut_depth_units):
    if cut_depth_units <= 1e-9:
        return translate_to_zero(mesh)

    plane_z = float(mesh.bounds[0][2] + cut_depth_units)
    candidate = mesh.slice_plane(
        plane_origin=[0.0, 0.0, plane_z],
        plane_normal=[0.0, 0.0, 1.0],
        cap=True,
    )
    if candidate is None or not isinstance(candidate, trimesh.Trimesh) or candidate.vertices.size == 0:
        raise RuntimeError("The flat-bottom slice produced an empty mesh.")
    candidate.remove_unreferenced_vertices()
    candidate.remove_infinite_values()
    candidate.process(validate=True)
    trimesh.repair.fix_normals(candidate)
    return translate_to_zero(candidate)


def candidate_cut_depths(height_units, target_height_mm, args):
    if height_units <= 0 or target_height_mm <= 0:
        return [0.0]

    mm_ratio_units = height_units / target_height_mm
    max_cut_by_mm = args.max_cut_mm * mm_ratio_units
    max_cut_by_ratio = height_units * args.max_cut_ratio
    max_cut_units = max(0.0, min(max_cut_by_mm, max_cut_by_ratio))

    if max_cut_units <= 1e-9:
        return [0.0]

    depths = np.linspace(0.0, max_cut_units, max(args.candidate_count, 2))
    rounded = sorted({round(float(value), 8) for value in depths})
    return rounded


def evaluate(mesh, args):
    original = translate_to_zero(mesh)
    original_volume = safe_volume(original)
    original_dims = dimensions(original)
    candidates = []

    for cut_depth_units in candidate_cut_depths(
        original_dims["height"],
        args.target_height_mm,
        args,
    ):
        try:
            candidate_mesh = slice_candidate(original, cut_depth_units)
            metrics = metrics_for(
                candidate_mesh,
                original_volume,
                args.target_height_mm,
                cut_depth_units,
                args,
            )
            metrics["accepted"] = bool(
                metrics["removed_volume_ratio"] <= args.max_volume_loss_ratio
                and metrics["contact_area_ratio"] >= args.min_contact_area_ratio
                and metrics["base_planarity_mm"] <= args.planarity_tolerance_mm
            )
            candidates.append(metrics)
        except Exception as error:
            candidates.append(
                {
                    "accepted": False,
                    "cut_depth_mm": None,
                    "error": str(error),
                    "contact_area_ratio": 0.0,
                    "removed_volume_ratio": 1.0,
                    "watertight": False,
                }
            )

    accepted = [candidate for candidate in candidates if candidate.get("accepted")]
    if accepted:
        chosen = min(
            accepted,
            key=lambda candidate: (
                candidate["cut_depth_mm"],
                -candidate["contact_area_ratio"],
            ),
        )
        return {
            "accepted": True,
            "mesh": chosen["mesh"],
            "qa": chosen,
            "candidates": candidates,
        }

    best = max(
        candidates,
        key=lambda candidate: (
            candidate.get("contact_area_ratio", 0.0),
            -candidate.get("removed_volume_ratio", 1.0),
        ),
    )
    return {
        "accepted": False,
        "mesh": best.get("mesh"),
        "qa": best,
        "candidates": candidates,
    }


def write_report(path_str, payload):
    path = Path(path_str)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    args = parse_args()
    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    source_mesh = load_mesh(args.input_path)
    evaluated = evaluate(source_mesh, args)

    qa = dict(evaluated["qa"])
    mesh = qa.pop("mesh", None)
    candidates = []

    for candidate in evaluated["candidates"]:
        flattened = dict(candidate)
        flattened.pop("mesh", None)
        candidates.append(flattened)

    report = {
        "accepted": bool(evaluated["accepted"]),
        "status": "passed" if evaluated["accepted"] else "failed",
        "targetHeightMm": float(args.target_height_mm),
        "thresholds": {
            "maxCutMm": float(args.max_cut_mm),
            "maxCutRatio": float(args.max_cut_ratio),
            "maxVolumeLossRatio": float(args.max_volume_loss_ratio),
            "minContactAreaRatio": float(args.min_contact_area_ratio),
            "planarityToleranceMm": float(args.planarity_tolerance_mm),
        },
        "qa": qa,
        "candidates": candidates,
    }

    if not evaluated["accepted"] or mesh is None:
        write_report(args.report_path, report)
        raise SystemExit("Flat-bottom QA failed. The model could not be normalized within the allowed thresholds.")

    mesh.export(output_path, file_type="glb")
    write_report(args.report_path, report)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:
        raise SystemExit(str(error))
