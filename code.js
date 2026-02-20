"use strict";
// Token Extractor - Figma Plugin
// Main plugin logic (runs in Figma sandbox)
figma.showUI(__html__, { width: 420, height: 600, title: "Token Extractor" });
// ─── Color Extraction ─────────────────────────────────────────────────────────
function rgbToHex(r, g, b) {
    const toHex = (n) => Math.round(n * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
function extractPaint(paint, source) {
    var _a;
    if (paint.type !== "SOLID" || paint.visible === false)
        return null;
    const { r, g, b } = paint.color;
    const a = (_a = paint.opacity) !== null && _a !== void 0 ? _a : 1;
    return {
        hex: rgbToHex(r, g, b),
        r,
        g,
        b,
        a,
        source,
        tokenName: "",
    };
}
function extractColorsFromNode(node) {
    const colors = [];
    if ("fills" in node && Array.isArray(node.fills)) {
        for (const fill of node.fills) {
            const c = extractPaint(fill, "fill");
            if (c)
                colors.push(c);
        }
    }
    if ("strokes" in node && Array.isArray(node.strokes)) {
        for (const stroke of node.strokes) {
            const c = extractPaint(stroke, "stroke");
            if (c)
                colors.push(c);
        }
    }
    if (node.type === "TEXT" && Array.isArray(node.fills)) {
        for (const fill of node.fills) {
            const c = extractPaint(fill, "text");
            if (c)
                colors.push(c);
        }
    }
    if ("children" in node) {
        for (const child of node.children) {
            colors.push(...extractColorsFromNode(child));
        }
    }
    return colors;
}
function deduplicateColors(colors) {
    const seen = new Set();
    return colors.filter((c) => {
        if (seen.has(c.hex))
            return false;
        seen.add(c.hex);
        return true;
    });
}
// ─── Intelligent Naming ───────────────────────────────────────────────────────
function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }
    return [h * 360, s, l];
}
function detectColorRole(r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.12)
        return "gray";
    if (h >= 0 && h < 20)
        return "red";
    if (h >= 20 && h < 45)
        return "orange";
    if (h >= 45 && h < 70)
        return "yellow";
    if (h >= 70 && h < 165)
        return "green";
    if (h >= 165 && h < 200)
        return "cyan";
    if (h >= 200 && h < 260)
        return "blue";
    if (h >= 260 && h < 300)
        return "purple";
    if (h >= 300 && h < 340)
        return "pink";
    return "red";
}
function lightnessToShade(l) {
    // Lightness 0..1 → shade 50..950
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    // l=1 (white) → 50, l=0 (black) → 950
    const index = Math.round((1 - l) * (shades.length - 1));
    return shades[Math.max(0, Math.min(shades.length - 1, index))];
}
function lightnessToAntLevel(l) {
    // 1..10 where 1=lightest, 10=darkest (roughly)
    return Math.max(1, Math.min(10, Math.round((1 - l) * 9) + 1));
}
function assignTokenNames(colors, pattern, customPrefix) {
    // Track role usage counts to avoid duplicates
    const roleCount = {};
    return colors.map((color) => {
        var _a, _b, _c;
        const [h, s, l] = rgbToHsl(color.r, color.g, color.b);
        const role = detectColorRole(color.r, color.g, color.b);
        const shade = lightnessToShade(l);
        const antLevel = lightnessToAntLevel(l);
        let tokenName = "";
        switch (pattern) {
            case "material": {
                const semanticMap = {
                    red: "error",
                    orange: "warning",
                    yellow: "warning",
                    green: "success",
                    cyan: "secondary",
                    blue: "primary",
                    purple: "tertiary",
                    pink: "secondary",
                    gray: "surface",
                };
                const semantic = (_a = semanticMap[role]) !== null && _a !== void 0 ? _a : "color";
                tokenName = shade === 500 ? `color-${semantic}` : `color-${semantic}-${shade}`;
                break;
            }
            case "tailwind": {
                tokenName = `${role}-${shade}`;
                break;
            }
            case "antd": {
                const semanticMapAnt = {
                    red: "error",
                    orange: "warning",
                    yellow: "warning",
                    green: "success",
                    cyan: "info",
                    blue: "primary",
                    purple: "primary",
                    pink: "error",
                    gray: "neutral",
                };
                const semantic = (_b = semanticMapAnt[role]) !== null && _b !== void 0 ? _b : "color";
                tokenName = `${semantic}-${antLevel}`;
                break;
            }
            case "wcag": {
                const semanticMapWcag = {
                    red: "error",
                    orange: "warning",
                    yellow: "warning",
                    green: "success",
                    cyan: "info",
                    blue: "info",
                    purple: "info",
                    pink: "error",
                    gray: l > 0.5 ? "neutral-light" : "neutral-dark",
                };
                tokenName = `color-${(_c = semanticMapWcag[role]) !== null && _c !== void 0 ? _c : "custom"}`;
                break;
            }
            case "custom": {
                const prefix = customPrefix.trim() || "color";
                tokenName = `${prefix}-${role}-${shade}`;
                break;
            }
        }
        // Deduplicate token names
        if (roleCount[tokenName] !== undefined) {
            roleCount[tokenName]++;
            tokenName = `${tokenName}-${roleCount[tokenName]}`;
        }
        else {
            roleCount[tokenName] = 0;
        }
        return Object.assign(Object.assign({}, color), { tokenName });
    });
}
// ─── Export Helpers ───────────────────────────────────────────────────────────
function buildJson(colors, pattern) {
    if (pattern === "tailwind") {
        // Nested: { colors: { blue: { "50": "#hex" } } }
        const nested = {};
        for (const c of colors) {
            const parts = c.tokenName.split("-");
            const colorName = parts.slice(0, parts.length - 1).join("-");
            const shade = parts[parts.length - 1];
            if (!nested[colorName])
                nested[colorName] = {};
            nested[colorName][shade] = c.hex;
        }
        return JSON.stringify({ colors: nested }, null, 2);
    }
    // Flat: { colors: { "color-primary": "#hex" } }
    const flat = {};
    for (const c of colors) {
        flat[c.tokenName] = c.hex;
    }
    return JSON.stringify({ colors: flat }, null, 2);
}
async function exportToFigmaVariables(colors, pattern) {
    const patternLabels = {
        material: "Material Design 3 Colors",
        tailwind: "Tailwind CSS Colors",
        antd: "Ant Design Colors",
        wcag: "WCAG Accessible Colors",
        custom: "Custom Design Tokens",
    };
    const collectionName = patternLabels[pattern];
    // Check if collection already exists
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    let collection = collections.find((c) => c.name === collectionName);
    if (!collection) {
        collection = figma.variables.createVariableCollection(collectionName);
    }
    const modeId = collection.modes[0].modeId;
    for (const color of colors) {
        // Check if variable already exists
        const existing = (await figma.variables.getLocalVariablesAsync("COLOR")).find((v) => v.name === color.tokenName && v.variableCollectionId === collection.id);
        const variable = existing !== null && existing !== void 0 ? existing : figma.variables.createVariable(color.tokenName, collection, "COLOR");
        variable.setValueForMode(modeId, {
            r: color.r,
            g: color.g,
            b: color.b,
            a: color.a,
        });
    }
}
// ─── Message Handler ──────────────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {
    var _a, _b, _c, _d;
    switch (msg.type) {
        case "extract-colors": {
            const selection = figma.currentPage.selection;
            if (selection.length === 0) {
                figma.ui.postMessage({ type: "no-selection" });
                return;
            }
            let raw = [];
            for (const node of selection) {
                raw.push(...extractColorsFromNode(node));
            }
            const unique = deduplicateColors(raw);
            const named = assignTokenNames(unique, (_a = msg.pattern) !== null && _a !== void 0 ? _a : "tailwind", (_b = msg.customPrefix) !== null && _b !== void 0 ? _b : "color");
            figma.ui.postMessage({ type: "colors-extracted", colors: named, source: "extract" });
            break;
        }
        case "apply-naming": {
            const renamed = assignTokenNames(msg.colors, msg.pattern, (_c = msg.customPrefix) !== null && _c !== void 0 ? _c : "color");
            figma.ui.postMessage({ type: "colors-extracted", colors: renamed, source: "rename" });
            break;
        }
        case "export-variables": {
            try {
                await exportToFigmaVariables(msg.colors, msg.pattern);
                figma.ui.postMessage({ type: "export-done", target: "variables", count: msg.colors.length });
            }
            catch (err) {
                figma.ui.postMessage({ type: "export-error", message: (_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : "Unknown error" });
            }
            break;
        }
        case "export-json": {
            const json = buildJson(msg.colors, msg.pattern);
            figma.ui.postMessage({ type: "json-ready", json });
            break;
        }
        case "close": {
            figma.closePlugin();
            break;
        }
    }
};
//# sourceMappingURL=code.js.map