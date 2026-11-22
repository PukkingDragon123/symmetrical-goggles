#version 150

// Winterworks: a curse's screen effect (client.curse.CurseScreenFx). One pass over the world image: the view pulls
// in or out, swirls, ripples (or shimmers upward like heat), splits its colours, shows a ghost of itself, loses its
// colour into the curse's tint and darkens into a tinted vignette; hidden curses flicker, Icarus glares.

uniform sampler2D DiffuseSampler;

in vec2 texCoord;
in vec2 oneTexel;

uniform vec2 InSize;

uniform float Clock;     // seconds since the effect began
uniform float Strength;  // 0..1, the effect's envelope (with its pulse)
uniform float Warp;      // the "Distortion Effects" accessibility slider: scales every geometric distortion
uniform float Wave;      // ripple amplitude (uv)
uniform float WaveFreq;  // ripples across the screen
uniform float Rise;      // 1: heat shimmer rising up the screen instead of ripples
uniform float Swirl;     // turn at the edges (radians)
uniform float Zoom;      // > 0 pulls the view in, < 0 pushes it away
uniform float Chroma;    // red/blue split along the radius (uv)
uniform float Ghost;     // how strong the ghost image is
uniform float GhostX;    // where the ghost sits (uv)
uniform float GhostY;
uniform float Desat;     // colour drained away
uniform float TintR;
uniform float TintG;
uniform float TintB;
uniform float TintAmt;   // colour graded toward the tint
uniform float Vignette;  // edges darkened into the tint
uniform float Flicker;   // hidden curses: the picture stutters to dark
uniform float Glare;     // Icarus: the sun burning in from above

out vec4 fragColor;

float hash(float n) {
    return fract(sin(n * 12.9898) * 43758.5453);
}

vec3 at(vec2 uv) {
    return texture(DiffuseSampler, clamp(uv, oneTexel, vec2(1.0) - oneTexel)).rgb;
}

void main() {
    float s = clamp(Strength, 0.0, 1.0);
    float w = s * Warp;
    vec2 aspect = vec2(InSize.x / InSize.y, 1.0);
    vec2 c = texCoord - 0.5;
    float r = length(c * aspect);

    c *= 1.0 - Zoom * w * (0.55 + 0.45 * r);
    float a = Swirl * w * r * r * 2.2;
    vec2 p = c * aspect;
    p = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
    vec2 uv = p / aspect + 0.5;

    float amp = Wave * w;
    if (amp > 0.0) {
        if (Rise > 0.5) {
            float lift = 0.35 + 0.65 * (1.0 - uv.y);
            uv.x += sin(uv.y * WaveFreq - Clock * 7.0) * amp * lift;
            uv.y += sin(uv.x * WaveFreq * 0.5 - Clock * 5.0) * amp * 0.35 * lift;
        } else {
            uv.x += sin(uv.y * WaveFreq + Clock * 2.4) * amp;
            uv.y += cos(uv.x * WaveFreq * 0.8 + Clock * 1.7) * amp * 0.6;
        }
    }

    vec2 dir = (uv - 0.5) * Chroma * w;
    vec3 col = vec3(at(uv + dir).r, at(uv).g, at(uv - dir).b);

    if (Ghost > 0.0) {
        vec2 off = vec2(GhostX, GhostY) * w * (0.75 + 0.25 * sin(Clock * 2.3));
        vec3 ghost = at(uv + off);
        col = mix(col, ghost, Ghost * s);
    }

    vec3 tint = vec3(TintR, TintG, TintB);
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(grey), Desat * s);
    vec3 graded = mix(col * tint * 1.25, vec3(grey) * tint * 1.55, 0.5);
    col = mix(col, graded, TintAmt * s);

    float v = smoothstep(0.22, 0.92, r);
    col = mix(col, tint * 0.22, clamp(Vignette * s * v, 0.0, 0.95));

    if (Glare > 0.0) {
        float g = 1.0 - smoothstep(0.0, 0.95, length((texCoord - vec2(0.5, 1.08)) * aspect));
        col += Glare * s * g * g * mix(tint, vec3(1.0, 0.97, 0.85), 0.5);
    }

    if (Flicker > 0.0) {
        float f = step(0.66, hash(floor(Clock * 13.0))) * (0.6 + 0.4 * hash(floor(Clock * 13.0) + 7.0));
        col *= 1.0 - Flicker * s * f * 0.9;
    }

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
