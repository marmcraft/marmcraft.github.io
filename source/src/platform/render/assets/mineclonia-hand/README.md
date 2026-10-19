# Mineclonia first-person hand

`mcl_meshhand.b3d` is the actual Mineclonia mesh from
`mods/PLAYER/mcl_meshhand/models/mcl_meshhand.b3d`, based on jordan4ibanez's
3D Hand / newhand mod. The upstream mcl_meshhand README licenses the mesh CC0:
https://creativecommons.org/publicdomain/zero/1.0/

Source project: https://codeberg.org/mineclonia/mineclonia
Mesh SHA256: 90b1448fc8f3b0e66ccf94a40bd6c6c89e666fc61fb8f6c1cfea129bf0ce7360

`character.png` is copied verbatim from `mods/PLAYER/mcl_player/textures/character.png`.
Mineclonia's media notice attributes textures to Pixel Perfection by XSSheep and
Pixel Perfection Legacy by Nova Wostra, CC BY-SA 4.0, unless otherwise noted.
The complete upstream media notice is included as `Mineclonia-LEGAL.md`.
https://creativecommons.org/licenses/by-sa/4.0/

`scripts/convert-mineclonia-hand.py` converts the original 24 vertices and 12
triangles to `mesh.json`. It removes the pre-existing Luanti wield rotation and
translation, scales the entire mesh uniformly to the native arm length, and
preserves the original top-down UV convention. It preserves the authored vertices, normals, triangles
and skin mapping. Runtime support-hand reflection reverses triangle winding.
MARM's first-person pose, bob, swing and use animation system remains native.
