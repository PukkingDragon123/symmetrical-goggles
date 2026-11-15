# lowpix

Code-first low-poly modeller with procedurally painted pixel-art textures (numpy + Pillow only).

* Package: `lowpix/` (`geometry` shapes and hierarchy, `painter` texel painting, `model` build
  pipeline, `render` software rasteriser, `export` glb/obj/bbmodel, `cli`, `mcp_server`).
* Specs: `examples/*.json`; reference `docs/SPEC.md`; art rules `docs/STYLE_GUIDE.md`;
  loop `docs/AGENT_WORKFLOW.md`; skill `.claude/skills/lowpix-modeling/SKILL.md`.
* Tests: `python -m unittest discover -s tests -v` (they require every example to build with
  zero warnings and a strictly in-palette atlas).
* After changing an example, regenerate its committed outputs:
  `python -m lowpix build examples/<name>.json -o examples/output --gif`.
* Conventions: Y up, model faces +Z, ground at y=0. A face's painted image is never flipped by
  mirroring. Pattern seeds key on layer `id`.
