"""lowpix - a code-first low-poly modeller with procedurally hand-painted
pixel-art textures, built to be driven by AI agents.

    from lowpix import build_model, render, export_all
    model = build_model("examples/salamander.json")
    render(model).save("preview.png")
"""
from .build import export_all
from .model import Model, build_model
from .palette import Palette, make_ramp
from .render import contact_sheet, render, turntable
from .spec import SpecError, load_spec, validate

__all__ = ["build_model", "Model", "render", "contact_sheet", "turntable", "export_all",
           "make_ramp", "Palette", "load_spec", "validate", "SpecError"]
__version__ = "0.1.0"
