/* ============================================================
   FLOOD DEFENCE – Main Game Logic
   A turn-based hex-grid town-building / flood-defence game
   ============================================================ */

// ===================== CONFIGURATION ========================
const CONFIG = {
    // Grid
    GRID_COLS: 50,
    GRID_ROWS: 20,
    HEX_SIZE: 28, // outer radius of each hexagon

    // Economy
    START_MONEY: 200,
    HOUSE_INCOME: 5,
    WALL_COST: 500,
    WALL_HEIGHT: 1,

    // Flood frequency – configurable!
    // Each entry: { magnitude: metres, returnPeriod: turns }
    // A flood of that magnitude occurs on average once every returnPeriod turns.
    // We fit a Gumbel distribution through these anchor points.
    FLOOD_ANCHORS: [
        { magnitude: 1.5, returnPeriod: 10 },
        { magnitude: 2.5, returnPeriod: 30 },
        { magnitude: 5.0, returnPeriod: 50 },
    ],

    // Visual
    RIVER_COLOR: '#2e86c1',
    RIVER_COLOR_DARK: '#1a5276',
    WATER_FLOOD_COLOR: 'rgba(52, 152, 219, 0.55)',
    WALL_COLOR: '#97a7aa',
    WALL_OUTLINE: '#4f5e61',
    HOUSE_COLORS: ['#d96c4f', '#c98742', '#d4a65a', '#8ca35b', '#5d8eb0', '#b98570'],
};

// ===================== STATE ================================
let state = {};

function initState() {
    state = {
        money: CONFIG.START_MONEY,
        turn: 1,
        tool: 'house', // 'house' | 'wall'
        grid: [],       // 2D array [col][row]
        gameOver: false,
        floodAnimProgress: 0,
        floodedCells: new Set(),
        lastFloodMag: 0,
        housesDestroyed: 0,
        floodStartTime: 0,
        waterParticles: [], // animated particles for water effects
        housesBuiltThisTurn: 0,
        overtoppedWalls: 0,
    };
}

// ===================== HEX MATH =============================
// Flat-top hexagons with offset coordinates (even-q).
// col = q, row = r

function hexWidth() {
    return CONFIG.HEX_SIZE * 2;
}

function hexHeight() {
    return Math.sqrt(3) * CONFIG.HEX_SIZE;
}

function hexToPixel(col, row) {
    const w = hexWidth();
    const h = hexHeight();
    const x = col * (w * 0.75);
    const y = row * h + (col % 2 === 1 ? h * 0.5 : 0);
    return { x, y };
}

function pixelToHex(px, py, offsetX, offsetY) {
    const wx = (px - offsetX);
    const wy = (py - offsetY);

    const w = hexWidth();
    const h = hexHeight();

    // Approximate column
    const col = Math.round(wx / (w * 0.75));
    // Approximate row based on column offset
    const rowOffset = col % 2 === 1 ? h * 0.5 : 0;
    const row = Math.round((wy - rowOffset) / h);

    // Check col and nearby columns for closest hex center
    let bestCol = col, bestRow = row, bestDist = Infinity;
    for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
            const c = col + dc;
            const r = row + dr;
            if (c < 0 || c >= CONFIG.GRID_COLS || r < 0 || r >= CONFIG.GRID_ROWS) continue;
            const center = hexToPixel(c, r);
            const dist = (center.x - wx) ** 2 + (center.y - wy) ** 2;
            if (dist < bestDist) {
                bestDist = dist;
                bestCol = c;
                bestRow = r;
            }
        }
    }
    if (bestCol < 0 || bestCol >= CONFIG.GRID_COLS || bestRow < 0 || bestRow >= CONFIG.GRID_ROWS) return null;
    return { col: bestCol, row: bestRow };
}

function hexNeighbors(col, row) {
    // Even-q offset neighbors (flat-top)
    const even = [
        [+1, -1], [+1, 0], [0, +1],
        [-1, 0], [-1, -1], [0, -1],
    ];
    const odd = [
        [+1, 0], [+1, +1], [0, +1],
        [-1, +1], [-1, 0], [0, -1],
    ];
    const offsets = col % 2 === 0 ? even : odd;
    const result = [];
    for (const [dc, dr] of offsets) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc >= 0 && nc < CONFIG.GRID_COLS && nr >= 0 && nr < CONFIG.GRID_ROWS) {
            result.push({ col: nc, row: nr });
        }
    }
    return result;
}

function hexCorners(cx, cy) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 180 * (60 * i);
        corners.push({
            x: cx + CONFIG.HEX_SIZE * Math.cos(angle),
            y: cy + CONFIG.HEX_SIZE * Math.sin(angle),
        });
    }
    return corners;
}

// ===================== NOISE FUNCTIONS ========================

// Seeded random number generator for reproducible randomness
function seededRandom(seed) {
    return function() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

// Simple 2D Perlin-like noise using hash and interpolation
function perlinNoise(x, y, scale, seed) {
    const rng = seededRandom(seed);
    
    const xi = Math.floor(x / scale);
    const yi = Math.floor(y / scale);
    const xf = (x / scale) - xi;
    const yf = (y / scale) - yi;
    
    // Hash function for grid points
    function hash(gridX, gridY, s) {
        const rngLocal = seededRandom(s + gridX * 73856093 ^ gridY * 19349663);
        return rngLocal();
    }
    
    // Smooth interpolation (fade function)
    function fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    // Linear interpolation
    function lerp(t, a, b) {
        return a + t * (b - a);
    }
    
    // Get corner values
    const n00 = hash(xi, yi, seed);
    const n10 = hash(xi + 1, yi, seed);
    const n01 = hash(xi, yi + 1, seed);
    const n11 = hash(xi + 1, yi + 1, seed);
    
    // Interpolate
    const u = fade(xf);
    const v = fade(yf);
    
    const nx0 = lerp(u, n00, n10);
    const nx1 = lerp(u, n01, n11);
    const nxy = lerp(v, nx0, nx1);
    
    return nxy;
}

// Generate layered noise (Perlin-style fractal Brownian motion)
function fbmNoise(x, y, octaves, seed) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
        value += amplitude * (perlinNoise(x * frequency, y * frequency, 1, seed + i) * 2 - 1);
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    
    return value / maxValue;
}

// ===================== GRID SETUP ============================

function createGrid() {
    const cols = CONFIG.GRID_COLS;
    const rows = CONFIG.GRID_ROWS;
    const grid = [];

    // Generate a random seed for this game
    const mapSeed = Math.random() * 1000000;

    // Generate elevation map using noise
    const elevationMap = [];
    let maxElevation = 0;
    
    for (let c = 0; c < cols; c++) {
        elevationMap[c] = [];
        for (let r = 0; r < rows; r++) {
            // Use FBM noise to create smooth, natural-looking terrain
            const noiseVal = fbmNoise(c * 0.08, r * 0.12, 4, mapSeed);
            // Scale noise to reasonable elevation range
            const elevation = (noiseVal + 1) * 2.5;
            elevationMap[c][r] = elevation;
            maxElevation = Math.max(maxElevation, elevation);
        }
    }

    // Normalize elevations so max is 5 (before applying river scaling)
    const elevationScale = maxElevation > 0 ? 5 / maxElevation : 1;
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            elevationMap[c][r] *= elevationScale;
        }
    }

    // Find river path - follows lowest elevation in each column
    const riverCenter = [];
    for (let c = 0; c < cols; c++) {
        let minElev = Infinity;
        let minRow = c === 0 ? Math.floor(rows / 2) : riverCenter[c - 1];
        
        // Find row with lowest elevation in this column
        for (let r = Math.max(0, rows / 2 - 8); r < Math.min(rows, rows / 2 + 8); r++) {
            if (elevationMap[c][r] < minElev) {
                minElev = elevationMap[c][r];
                minRow = r;
            }
        }
        
        // Ensure connectivity: limit movement from previous column
        if (c > 0) {
            const prevRow = riverCenter[c - 1];
            // Constrain to at most ±1 from previous row
            minRow = Math.max(prevRow - 1, Math.min(prevRow + 1, minRow));
            minRow = Math.max(2, Math.min(rows - 3, minRow));
        }
        
        riverCenter.push(minRow);
    }

    // Create grid with river and calculated elevations
    // First pass: calculate elevations to find maximum
    const tempElevations = [];
    let maxFinalElevation = 0;
    
    for (let c = 0; c < cols; c++) {
        tempElevations[c] = [];
        for (let r = 0; r < rows; r++) {
            const distFromRiver = Math.abs(r - riverCenter[c]);
            const isRiver = distFromRiver <= 1;

            let elevation = 0;
            if (!isRiver) {
                // Apply distance-based scaling
                elevation = elevationMap[c][r] * (1 + distFromRiver * 0.1);
                elevation = Math.max(0.1, elevation);
            }
            
            tempElevations[c][r] = elevation;
            maxFinalElevation = Math.max(maxFinalElevation, elevation);
        }
    }

    // Rescale so maximum elevation is 5m
    const finalElevationScale = maxFinalElevation > 0 ? 5 / maxFinalElevation : 1;
    
    for (let c = 0; c < cols; c++) {
        grid[c] = [];
        for (let r = 0; r < rows; r++) {
            const distFromRiver = Math.abs(r - riverCenter[c]);
            const isRiver = distFromRiver <= 1;

            let elevation = 0;
            if (!isRiver) {
                elevation = tempElevations[c][r] * finalElevationScale;
            }

            grid[c][r] = {
                col: c,
                row: r,
                isRiver,
                elevation: Math.round(elevation * 100) / 100,
                building: null, // null | 'house' | 'wall'
                flooded: false,
                floodedTime: null,
                houseColor: CONFIG.HOUSE_COLORS[Math.floor(Math.random() * CONFIG.HOUSE_COLORS.length)],
            };
        }
    }

    state.grid = grid;
}

// ===================== FLOOD MODEL ===========================

// Fit Gumbel distribution from two anchor points.
// CDF: F(x) = exp(-exp(-(x - mu) / beta))
// Probability of exceedance in one turn = 1 / returnPeriod
// So F(x) = 1 - 1/returnPeriod

let gumbelMu = 0;
let gumbelBeta = 1;

function fitGumbel() {
    const a = CONFIG.FLOOD_ANCHORS[0];
    const b = CONFIG.FLOOD_ANCHORS[1];

    const F1 = 1 - 1 / a.returnPeriod;
    const F2 = 1 - 1 / b.returnPeriod;

    // -ln(-ln(F)) = (x - mu) / beta
    const y1 = -Math.log(-Math.log(F1));
    const y2 = -Math.log(-Math.log(F2));

    gumbelBeta = (b.magnitude - a.magnitude) / (y2 - y1);
    gumbelMu = a.magnitude - gumbelBeta * y1;
}

function sampleFloodMagnitude() {
    // Inverse CDF sampling: x = mu - beta * ln(-ln(u)),  u ~ Uniform(0,1)
    const u = Math.random();
    const x = gumbelMu - gumbelBeta * Math.log(-Math.log(u));
    return Math.max(0, x);
}

// ===================== FLOOD SIMULATION ======================

function simulateFlood() {
    const mag = sampleFloodMagnitude();
    state.lastFloodMag = Math.round(mag * 100) / 100;
    state.floodStartTime = Date.now(); // Track when flood starts for animation
    state.overtoppedWalls = 0;

    // Clear previous flood state
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            state.grid[c][r].flooded = false;
            state.grid[c][r].floodedTime = null;
        }
    }

    if (mag <= 0) {
        state.floodedCells = new Set();
        return;
    }

    // BFS from all river cells – flood spreads to adjacent cells
    // with elevation < mag, but cannot pass through walls.
    const visited = new Set();
    const queue = [];

    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            if (state.grid[c][r].isRiver) {
                const key = c + ',' + r;
                visited.add(key);
                queue.push({ col: c, row: r, distance: 0 });
                state.grid[c][r].flooded = true;
                state.grid[c][r].floodedTime = state.floodStartTime;
            }
        }
    }

    let head = 0;
    while (head < queue.length) {
        const { col, row, distance } = queue[head++];
        for (const nb of hexNeighbors(col, row)) {
            const key = nb.col + ',' + nb.row;
            if (visited.has(key)) continue;
            visited.add(key);

            const cell = state.grid[nb.col][nb.row];
            const wallCrest = cell.elevation + CONFIG.WALL_HEIGHT;
            const overtoppedWall = cell.building === 'wall' && wallCrest < mag;
            const floodableLand = cell.building === 'wall' ? overtoppedWall : cell.elevation < mag;

            if (cell.isRiver || floodableLand) {
                cell.flooded = true;
                // Stagger flood animation based on BFS distance
                cell.floodedTime = state.floodStartTime + distance * 50;
                queue.push({ col: nb.col, row: nb.row, distance: distance + 1 });
                if (overtoppedWall) state.overtoppedWalls++;
            }
        }
    }

    // Destroy flooded houses
    state.housesDestroyed = 0;
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            const cell = state.grid[c][r];
            if (cell.flooded && cell.building === 'house') {
                cell.building = null;
                state.housesDestroyed++;
            }
        }
    }

    state.floodedCells = visited;
}

// ===================== ECONOMY ===============================

function countHouses() {
    let count = 0;
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            if (state.grid[c][r].building === 'house') count++;
        }
    }
    return count;
}

function getIncome() {
    return countHouses() * CONFIG.HOUSE_INCOME;
}

// ===================== RENDERING =============================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let camX = 0, camY = 0;
let hoverHex = null;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function centerCamera() {
    const totalW = CONFIG.GRID_COLS * hexWidth() * 0.75 + hexWidth() * 0.25;
    const totalH = CONFIG.GRID_ROWS * hexHeight() + hexHeight() * 0.5;
    camX = (canvas.width - totalW) / 2;
    camY = (canvas.height - totalH) / 2 + 28; // offset for HUD
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function hexToRgb(color) {
    const normalized = color.replace('#', '');
    const expanded = normalized.length === 3
        ? normalized.split('').map((channel) => channel + channel).join('')
        : normalized;
    const intValue = parseInt(expanded, 16);
    return {
        r: (intValue >> 16) & 255,
        g: (intValue >> 8) & 255,
        b: intValue & 255,
    };
}

function shadeHex(color, amount) {
    const { r, g, b } = hexToRgb(color);
    const target = amount < 0 ? 0 : 255;
    const mix = Math.abs(amount);
    return `rgb(${Math.round(r + (target - r) * mix)}, ${Math.round(g + (target - g) * mix)}, ${Math.round(b + (target - b) * mix)})`;
}

function drawPolygonPath(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
}

function fillPolygon(points, fillStyle) {
    drawPolygonPath(points);
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

function strokePolygon(points, strokeStyle, lineWidth = 1) {
    drawPolygonPath(points);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function shiftPoints(points, dx, dy) {
    return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

function getHexSkewX() {
    return CONFIG.HEX_SIZE * 0.24;
}

function getHexTopLift(cell) {
    return cell.isRiver ? 7 : 10 + cell.elevation * 2.15;
}

function getHexDepth(cell) {
    return cell.isRiver ? 10 : 14 + cell.elevation * 2.8;
}

function getElevationColor(elevation) {
    const t = clamp(elevation / 5, 0, 1);
    // Low: hsl(128 64% 62%) vivid emerald  →  High: hsl(38 54% 52%) warm tawny
    const h = Math.round(128 - t * 90);
    const s = Math.round(64 - t * 10);
    const l = Math.round(62 - t * 10);
    return `hsl(${h} ${s}% ${l}%)`;
}

function getElevationColorDark(elevation) {
    const t = clamp(elevation / 5, 0, 1);
    // Low: hsl(118 34% 30%)  →  High: hsl(32 28% 24%)
    const h = Math.round(118 - t * 86);
    const s = Math.round(34 - t * 6);
    const l = Math.round(30 - t * 6);
    return `hsl(${h} ${s}% ${l}%)`;
}

function getElevationSideColor(elevation, face) {
    const t = clamp(elevation / 5, 0, 1);
    // Shift hue by 90° across range; darken right/front faces for depth
    const h = Math.round(118 - t * 90);
    const s = Math.round(36 - t * 8);
    const baseL = face === 'left' ? 48 : face === 'right' ? 34 : 40;
    const l = Math.round(baseL - t * 14);
    return `hsl(${h} ${s}% ${l}%)`;
}

function forEachCellByDepth(visitor) {
    const tiles = [];
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
        for (let r = 0; r < CONFIG.GRID_ROWS; r++) {
            const pos = hexToPixel(c, r);
            tiles.push({ cell: state.grid[c][r], pos });
        }
    }

    tiles.sort((a, b) => (a.pos.y - b.pos.y) || (a.pos.x - b.pos.x));
    for (const tile of tiles) {
        visitor(tile);
    }
}

function drawHex(cx, cy, cell) {
    const baseCorners = hexCorners(cx, cy);
    const topLift = getHexTopLift(cell);
    const depth = getHexDepth(cell);
    const skewX = getHexSkewX();
    const topCorners = shiftPoints(baseCorners, skewX, -topLift);
    const lowerCorners = shiftPoints(baseCorners, 0, depth - topLift);
    const t = Date.now();

    let topColor;
    let leftColor;
    let frontColor;
    let rightColor;
    let edgeColor;

    if (cell.isRiver) {
        const wave = Math.sin(t * 0.0028 + cell.col * 0.55 - cell.row * 0.3) * 0.5
            + Math.sin(t * 0.0043 + cell.col * 0.3 + cell.row * 0.22) * 0.5;
        topColor = `hsl(198 64% ${49 + wave * 4}%)`;
        leftColor = `hsl(200 54% ${35 + wave * 2}%)`;
        frontColor = `hsl(204 58% ${31 + wave * 2}%)`;
        rightColor = `hsl(207 55% ${28 + wave * 2}%)`;
        edgeColor = '#275469';
    } else {
        topColor = getElevationColor(cell.elevation);
        leftColor = getElevationSideColor(cell.elevation, 'left');
        frontColor = getElevationSideColor(cell.elevation, 'front');
        rightColor = getElevationSideColor(cell.elevation, 'right');
        edgeColor = getElevationColorDark(cell.elevation);
    }

    ctx.fillStyle = cell.isRiver ? 'rgba(17, 44, 58, 0.22)' : 'rgba(24, 36, 18, 0.26)';
    ctx.beginPath();
    ctx.ellipse(cx + skewX * 0.35, cy + depth + CONFIG.HEX_SIZE * 0.36, CONFIG.HEX_SIZE * 0.96, CONFIG.HEX_SIZE * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    fillPolygon([topCorners[2], topCorners[3], lowerCorners[3], lowerCorners[2]], leftColor);
    fillPolygon([topCorners[0], topCorners[1], lowerCorners[1], lowerCorners[0]], rightColor);
    fillPolygon([topCorners[1], topCorners[2], lowerCorners[2], lowerCorners[1]], frontColor);

    fillPolygon(topCorners, topColor);
    strokePolygon(topCorners, edgeColor, 1.2);
    strokePolygon([topCorners[1], topCorners[2], lowerCorners[2], lowerCorners[1]], edgeColor, 1);
    strokePolygon([topCorners[2], topCorners[3], lowerCorners[3], lowerCorners[2]], edgeColor, 1);
    strokePolygon([topCorners[0], topCorners[1], lowerCorners[1], lowerCorners[0]], edgeColor, 1);

    if (!cell.isRiver) {
        fillPolygon([
            topCorners[4],
            topCorners[5],
            { x: cx + skewX + CONFIG.HEX_SIZE * 0.12, y: cy - topLift - CONFIG.HEX_SIZE * 0.14 },
            { x: cx + skewX - CONFIG.HEX_SIZE * 0.38, y: cy - topLift - CONFIG.HEX_SIZE * 0.4 },
        ], 'rgba(255,255,255,0.12)');

        fillPolygon([
            topCorners[5],
            topCorners[0],
            { x: cx + skewX + CONFIG.HEX_SIZE * 0.42, y: cy - topLift + CONFIG.HEX_SIZE * 0.06 },
            { x: cx + skewX + CONFIG.HEX_SIZE * 0.02, y: cy - topLift - CONFIG.HEX_SIZE * 0.18 },
        ], 'rgba(249, 215, 160, 0.14)');
    }

    if (cell.isRiver) {
        ctx.save();
        drawPolygonPath(topCorners);
        ctx.clip();

        const shimmer = ctx.createLinearGradient(cx - CONFIG.HEX_SIZE, cy - topLift - CONFIG.HEX_SIZE, cx + CONFIG.HEX_SIZE, cy - topLift + CONFIG.HEX_SIZE * 0.4);
        shimmer.addColorStop(0, 'rgba(255,255,255,0.02)');
        shimmer.addColorStop(0.5, 'rgba(255,255,255,0.18)');
        shimmer.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = shimmer;
        ctx.fillRect(cx - CONFIG.HEX_SIZE, cy - topLift - CONFIG.HEX_SIZE, CONFIG.HEX_SIZE * 2, CONFIG.HEX_SIZE * 2);

        for (let i = -1; i <= 1; i++) {
            const phase = (t * 0.045 + cell.col * 11 + i * 15) % 42;
            const xWobble = Math.sin(t * 0.003 + cell.row * 0.4 + i) * 4;
            const lineY = cy - topLift - CONFIG.HEX_SIZE * 0.45 + phase;
            ctx.strokeStyle = `rgba(211, 239, 255, ${0.12 + (i + 1) * 0.03})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(cx - CONFIG.HEX_SIZE * 0.68 + xWobble, lineY);
            ctx.quadraticCurveTo(cx + xWobble * 0.2, lineY + 4, cx + CONFIG.HEX_SIZE * 0.62 + xWobble, lineY - 1);
            ctx.stroke();
        }

        ctx.restore();
    }

    // --- Flood overlay with animation ---
    if (cell.flooded && !cell.isRiver) {
        const timeElapsed = t - (cell.floodedTime || state.floodStartTime);
        const spreadAnim = Math.min(1, timeElapsed / 400);

        ctx.save();
        drawPolygonPath(topCorners);
        ctx.clip();

        const waterWave = Math.sin(t * 0.004 + cell.col * 0.5 + cell.row * 0.35) * 0.08;
        const baseAlpha = 0.5 * spreadAnim;
        const finalAlpha = Math.min(0.65, baseAlpha + waterWave);

        ctx.fillStyle = `rgba(44, 133, 190, ${finalAlpha})`;
        ctx.fillRect(cx - CONFIG.HEX_SIZE, cy - topLift - CONFIG.HEX_SIZE, CONFIG.HEX_SIZE * 2, CONFIG.HEX_SIZE * 2);

        if (spreadAnim > 0.2) {
            const ripplePhase = (t * 0.002 + cell.col * 1.3 + cell.row * 0.9) % 1;
            const rippleRadius = CONFIG.HEX_SIZE * 0.15 + ripplePhase * CONFIG.HEX_SIZE * 0.5;
            const rippleAlpha = (1 - ripplePhase) * 0.35 * spreadAnim;
            ctx.strokeStyle = `rgba(133, 193, 233, ${rippleAlpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy - topLift * 0.55, rippleRadius, 0, Math.PI * 2);
            ctx.stroke();

            const ripplePhase2 = (t * 0.002 + cell.col * 1.3 + cell.row * 0.9 + 0.5) % 1;
            const rippleRadius2 = CONFIG.HEX_SIZE * 0.15 + ripplePhase2 * CONFIG.HEX_SIZE * 0.5;
            const rippleAlpha2 = (1 - ripplePhase2) * 0.25 * spreadAnim;
            ctx.strokeStyle = `rgba(174, 214, 241, ${rippleAlpha2})`;
            ctx.beginPath();
            ctx.arc(cx, cy - topLift * 0.55, rippleRadius2, 0, Math.PI * 2);
            ctx.stroke();
        }

        const flowPhase = (t * 0.03 + cell.col * 8) % 30;
        const flowAlpha = 0.1 * spreadAnim;
        ctx.strokeStyle = `rgba(200, 230, 255, ${flowAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const fy = cy - topLift - CONFIG.HEX_SIZE * 0.3 + flowPhase;
        ctx.moveTo(cx - CONFIG.HEX_SIZE * 0.5, fy);
        ctx.quadraticCurveTo(cx, fy + 3, cx + CONFIG.HEX_SIZE * 0.5, fy);
        ctx.stroke();

        ctx.restore();
    }

    // --- Buildings ---
    const surfaceX = cx + skewX * 0.56;
    const surfaceY = cy - topLift + CONFIG.HEX_SIZE * 0.06;
    if (cell.building === 'house') {
        drawHouse(surfaceX, surfaceY, cell.houseColor, cell);
    } else if (cell.building === 'wall') {
        drawWall(surfaceX, surfaceY);
    }

    // --- Hover ---
    if (hoverHex && hoverHex.col === cell.col && hoverHex.row === cell.row && !state.gameOver) {
        drawPolygonPath(topCorners);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        ctx.strokeStyle = '#f3fff3';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawHouse(cx, cy, color, cell) {
    // Deterministic variation per tile so neighborhoods don't look cloned.
    const hash = Math.sin(cell.col * 127.1 + cell.row * 311.7) * 43758.5453;
    const frac = hash - Math.floor(hash);
    const frac2 = Math.sin((cell.col + 17) * 61.7 + (cell.row + 9) * 241.9) * 15731.743;
    const fracB = frac2 - Math.floor(frac2);

    const footprintScale = 1.85 + frac * 0.35;
    const s = CONFIG.HEX_SIZE * 0.56 * footprintScale;

    const bodyPalette = ['#f2c66c', '#f09f79', '#91c7d8', '#9ecf8d', '#d7a3cf', '#d7c97a'];
    const roofPalette = ['#d55353', '#d87a33', '#ce4f8c', '#7f6bdb', '#3d9f7a', '#be5ad5'];
    const bodyMain = bodyPalette[Math.floor(frac * bodyPalette.length) % bodyPalette.length];
    const bodyAlt = bodyPalette[Math.floor(fracB * bodyPalette.length) % bodyPalette.length];
    const roofBase = roofPalette[Math.floor(frac * roofPalette.length) % roofPalette.length];
    const roofAlt = roofPalette[Math.floor(fracB * roofPalette.length) % roofPalette.length];

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx + s * 0.08, cy + s * 0.62, s * 0.98, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    fillPolygon([
        { x: cx - s * 0.95, y: cy + s * 0.24 },
        { x: cx, y: cy - s * 0.02 },
        { x: cx + s * 0.95, y: cy + s * 0.24 },
        { x: cx, y: cy + s * 0.52 },
    ], 'rgba(110, 128, 112, 0.52)');

    function drawHome(baseX, baseY, width, height, bodyColor, roofColor) {
        const depth = width * 0.34;
        const roofLift = height * 0.46;

        const frontLeftBottom = { x: baseX - width * 0.5, y: baseY };
        const frontRightBottom = { x: baseX + width * 0.5, y: baseY };
        const frontLeftTop = { x: frontLeftBottom.x, y: baseY - height };
        const frontRightTop = { x: frontRightBottom.x, y: baseY - height };

        const backLeftBottom = { x: frontLeftBottom.x + depth, y: frontLeftBottom.y - depth * 0.42 };
        const backRightBottom = { x: frontRightBottom.x + depth, y: frontRightBottom.y - depth * 0.42 };
        const backLeftTop = { x: frontLeftTop.x + depth, y: frontLeftTop.y - depth * 0.42 };
        const backRightTop = { x: frontRightTop.x + depth, y: frontRightTop.y - depth * 0.42 };

        fillPolygon([frontLeftTop, frontRightTop, frontRightBottom, frontLeftBottom], shadeHex(bodyColor, -0.03));
        fillPolygon([frontRightTop, backRightTop, backRightBottom, frontRightBottom], shadeHex(bodyColor, -0.22));
        fillPolygon([frontLeftTop, frontRightTop, backRightTop, backLeftTop], shadeHex(bodyColor, 0.1));

        const ridgeFront = { x: baseX, y: frontLeftTop.y - roofLift };
        const ridgeBack = { x: ridgeFront.x + depth, y: ridgeFront.y - depth * 0.42 };

        fillPolygon([frontLeftTop, ridgeFront, ridgeBack, backLeftTop], shadeHex(roofColor, 0.05));
        fillPolygon([ridgeFront, frontRightTop, backRightTop, ridgeBack], shadeHex(roofColor, -0.14));
        strokePolygon([frontLeftTop, ridgeFront, ridgeBack, backLeftTop], 'rgba(60, 45, 35, 0.45)', 1);
        strokePolygon([ridgeFront, frontRightTop, backRightTop, ridgeBack], 'rgba(60, 45, 35, 0.4)', 1);

        fillPolygon([
            { x: ridgeBack.x - width * 0.06, y: ridgeBack.y - height * 0.14 },
            { x: ridgeBack.x + width * 0.06, y: ridgeBack.y - height * 0.14 },
            { x: ridgeBack.x + width * 0.08, y: ridgeBack.y + height * 0.08 },
            { x: ridgeBack.x - width * 0.04, y: ridgeBack.y + height * 0.08 },
        ], '#b88f78');

        const windowColor = 'rgba(226, 246, 255, 0.78)';
        fillPolygon([
            { x: baseX - width * 0.34, y: baseY - height * 0.6 },
            { x: baseX - width * 0.16, y: baseY - height * 0.6 },
            { x: baseX - width * 0.16, y: baseY - height * 0.36 },
            { x: baseX - width * 0.34, y: baseY - height * 0.36 },
        ], windowColor);
        fillPolygon([
            { x: baseX + width * 0.08, y: baseY - height * 0.6 },
            { x: baseX + width * 0.26, y: baseY - height * 0.6 },
            { x: baseX + width * 0.26, y: baseY - height * 0.36 },
            { x: baseX + width * 0.08, y: baseY - height * 0.36 },
        ], windowColor);

        fillPolygon([
            { x: baseX - width * 0.06, y: baseY - height * 0.28 },
            { x: baseX + width * 0.06, y: baseY - height * 0.28 },
            { x: baseX + width * 0.06, y: baseY },
            { x: baseX - width * 0.06, y: baseY },
        ], '#6f4b38');
    }

    const centerJitter = (frac - 0.5) * s * 0.12;
    const sideJitter = (fracB - 0.5) * s * 0.14;

    const drawPair = frac > 0.5;
    if (drawPair) {
        drawHome(
            cx - s * 0.22 + sideJitter * 0.7,
            cy + s * 0.42,
            s * (0.62 + frac * 0.08),
            s * (0.44 + fracB * 0.06),
            bodyMain,
            roofBase,
        );
        drawHome(
            cx + s * 0.2 + centerJitter * 0.5,
            cy + s * 0.38,
            s * (0.66 + fracB * 0.08),
            s * (0.48 + frac * 0.06),
            bodyAlt,
            roofAlt,
        );
    } else {
        drawHome(
            cx + centerJitter * 0.45,
            cy + s * 0.4,
            s * (0.78 + fracB * 0.1),
            s * (0.54 + frac * 0.08),
            bodyMain,
            roofBase,
        );
    }
}

function drawWall(cx, cy) {
    const s = CONFIG.HEX_SIZE * 0.7;
    const wallW = s * 1.8;
    const wallH = s * 0.5;
    const topDepth = s * 0.18;

    const left = cx - wallW * 0.5;
    const right = cx + wallW * 0.5;
    const top = cy - s * 0.08;
    const bottom = top + wallH;

    // Ground shadow for depth.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, bottom + s * 0.26, wallW * 0.52, s * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    const topFace = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right - s * 0.16, y: top - topDepth },
        { x: left + s * 0.16, y: top - topDepth },
    ];
    const frontFace = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];

    fillPolygon(frontFace, '#8f9da0');
    fillPolygon(topFace, '#c0cbcd');
    strokePolygon(frontFace, CONFIG.WALL_OUTLINE, 1.1);
    strokePolygon(topFace, CONFIG.WALL_OUTLINE, 1.1);

    const merlonCount = 5;
    const gap = wallW * 0.035;
    const merlonW = (wallW - gap * (merlonCount - 1)) / merlonCount;
    const merlonH = wallH * 0.28;

    for (let i = 0; i < merlonCount; i++) {
        const x = left + i * (merlonW + gap);
        const merlonFront = [
            { x, y: top },
            { x: x + merlonW, y: top },
            { x: x + merlonW, y: top - merlonH },
            { x, y: top - merlonH },
        ];
        const merlonTop = [
            { x, y: top - merlonH },
            { x: x + merlonW, y: top - merlonH },
            { x: x + merlonW - s * 0.1, y: top - merlonH - topDepth * 0.62 },
            { x: x + s * 0.1, y: top - merlonH - topDepth * 0.62 },
        ];

        fillPolygon(merlonFront, '#9eabad');
        fillPolygon(merlonTop, '#d2dbdc');
        strokePolygon(merlonFront, CONFIG.WALL_OUTLINE, 1);
    }

    ctx.strokeStyle = 'rgba(79, 94, 97, 0.35)';
    ctx.lineWidth = 1;
    for (let y = top + wallH * 0.28; y < bottom; y += wallH * 0.26) {
        ctx.beginPath();
        ctx.moveTo(left + s * 0.03, y);
        ctx.lineTo(right - s * 0.03, y);
        ctx.stroke();
    }
}

function drawGrid() {
    forEachCellByDepth(({ cell, pos }) => {
        drawHex(pos.x + camX, pos.y + camY, cell);
    });
}

// Simple decorative clouds
const clouds = [];
function initClouds() {
    clouds.length = 0;
    for (let i = 0; i < 8; i++) {
        clouds.push({
            x: Math.random() * 2000 - 200,
            y: 60 + Math.random() * 80,
            w: 80 + Math.random() * 120,
            speed: 0.1 + Math.random() * 0.2,
        });
    }
}

function drawClouds() {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (const c of clouds) {
        c.x += c.speed;
        if (c.x > canvas.width + 200) c.x = -c.w - 50;
        const cy = c.y;
        ctx.beginPath();
        ctx.ellipse(c.x, cy, c.w * 0.5, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x - c.w * 0.2, cy - 8, c.w * 0.3, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x + c.w * 0.2, cy - 5, c.w * 0.25, 10, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Decorative trees on empty land cells
function drawTree(cx, cy, cell) {
    if (cell.isRiver || cell.building || cell.flooded) return;

    const hash = Math.sin(cell.col * 127.1 + cell.row * 311.7) * 43758.5453;
    const frac = hash - Math.floor(hash);
    if (frac > 0.22) return;

    const topLift = getHexTopLift(cell);
    const surfaceX = cx + getHexSkewX() * 0.56;
    const surfaceY = cy - topLift - CONFIG.HEX_SIZE * 0.1;
    const s = CONFIG.HEX_SIZE * 0.42;

    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(surfaceX, surfaceY + s * 1.05, s * 0.56, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    const trunkTop = [
        { x: surfaceX - s * 0.12, y: surfaceY - s * 0.16 },
        { x: surfaceX, y: surfaceY - s * 0.26 },
        { x: surfaceX + s * 0.12, y: surfaceY - s * 0.16 },
        { x: surfaceX, y: surfaceY - s * 0.06 },
    ];
    const trunkDrop = s * 0.62;
    fillPolygon([trunkTop[0], trunkTop[3], { x: trunkTop[3].x, y: trunkTop[3].y + trunkDrop }, { x: trunkTop[0].x, y: trunkTop[0].y + trunkDrop }], '#6a482c');
    fillPolygon([trunkTop[3], trunkTop[2], { x: trunkTop[2].x, y: trunkTop[2].y + trunkDrop }, { x: trunkTop[3].x, y: trunkTop[3].y + trunkDrop }], '#4f341f');
    fillPolygon(trunkTop, '#836040');

    function drawCanopyLayer(centerY, width, height, colors) {
        const peak = { x: surfaceX, y: centerY - height };
        const left = { x: surfaceX - width, y: centerY };
        const right = { x: surfaceX + width, y: centerY };
        const front = { x: surfaceX, y: centerY + height * 0.3 };

        fillPolygon([left, peak, front], colors.left);
        fillPolygon([peak, right, front], colors.right);
        fillPolygon([left, peak, right], colors.top);
        strokePolygon([left, peak, right], 'rgba(23, 55, 39, 0.35)', 0.9);
    }

    drawCanopyLayer(surfaceY - s * 0.52, s * 0.78, s * 0.86, {
        left: '#3d7b4f',
        right: '#2c5d3c',
        top: '#5aa46a',
    });
    drawCanopyLayer(surfaceY - s * 1.05, s * 0.56, s * 0.72, {
        left: '#4c935d',
        right: '#357046',
        top: '#6fbd7e',
    });
}

function drawTrees() {
    forEachCellByDepth(({ cell, pos }) => {
        drawTree(pos.x + camX, pos.y + camY, cell);
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#85bfd0');
    grad.addColorStop(0.35, '#bfd8d7');
    grad.addColorStop(0.72, '#dde5ce');
    grad.addColorStop(1, '#cbd4bb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glow = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.16, 20, canvas.width * 0.5, canvas.height * 0.16, canvas.width * 0.42);
    glow.addColorStop(0, 'rgba(255, 244, 196, 0.34)');
    glow.addColorStop(1, 'rgba(255, 244, 196, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const haze = ctx.createLinearGradient(0, canvas.height * 0.2, 0, canvas.height * 0.75);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, 'rgba(202, 214, 186, 0.35)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawClouds();
    drawGrid();
    drawTrees();

    requestAnimationFrame(render);
}

// ===================== HUD UPDATE ============================

function updateHUD() {
    document.getElementById('money-display').textContent = `£${state.money}`;
    document.getElementById('income-display').textContent = `Income: £${getIncome()}/turn`;
    document.getElementById('turn-display').textContent = `Turn: ${state.turn}`;
}

// ===================== INPUT =================================

// Panning
let isPanning = false;
let panStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        camStart = { x: camX, y: camY };
        e.preventDefault();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        camX = camStart.x + (e.clientX - panStart.x);
        camY = camStart.y + (e.clientY - panStart.y);
        return;
    }

    const hex = pixelToHex(e.clientX, e.clientY, camX, camY);
    hoverHex = hex;

    // Update tooltip
    const tooltip = document.getElementById('tooltip');
    if (hex && state.grid[hex.col] && state.grid[hex.col][hex.row]) {
        const cell = state.grid[hex.col][hex.row];
        let text = '';
        if (cell.isRiver) {
            text = 'River (0.0m)';
        } else {
            text = `Elevation: ${cell.elevation.toFixed(2)}m`;
            if (cell.building === 'house') {
                text += ' | 🏠 Homes';
            } else if (cell.building === 'wall') {
                text += ` | 🧱 Wall crest ${(cell.elevation + CONFIG.WALL_HEIGHT).toFixed(2)}m`;
            }
            if (cell.flooded) text += ' | 🌊 Flooded';
        }
        tooltip.textContent = text;
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY + 14) + 'px';
        tooltip.classList.remove('hidden');
    } else {
        tooltip.classList.add('hidden');
    }
});

canvas.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
    }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Click to place building
canvas.addEventListener('click', (e) => {
    if (state.gameOver) return;

    const hex = pixelToHex(e.clientX, e.clientY, camX, camY);
    if (!hex) return;

    const cell = state.grid[hex.col][hex.row];
    if (cell.isRiver) return;
    if (cell.building) return;

    if (state.tool === 'house') {
        if (state.housesBuiltThisTurn < 3) {
            cell.building = 'house';
            cell.houseColor = CONFIG.HOUSE_COLORS[Math.floor(Math.random() * CONFIG.HOUSE_COLORS.length)];
            state.housesBuiltThisTurn++;
            updateHUD();
        }
    } else if (state.tool === 'wall') {
        if (state.money >= CONFIG.WALL_COST) {
            state.money -= CONFIG.WALL_COST;
            cell.building = 'wall';
            updateHUD();
        }
    }
});

// Scroll to zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.93 : 1.07;
    const oldSize = CONFIG.HEX_SIZE;
    CONFIG.HEX_SIZE = Math.max(12, Math.min(60, CONFIG.HEX_SIZE * zoomFactor));

    // Adjust camera to zoom toward cursor
    const ratio = CONFIG.HEX_SIZE / oldSize;
    camX = e.clientX - (e.clientX - camX) * ratio;
    camY = e.clientY - (e.clientY - camY) * ratio;
}, { passive: false });

// Tool buttons
document.getElementById('btn-house').addEventListener('click', () => {
    state.tool = 'house';
    document.getElementById('btn-house').classList.add('active');
    document.getElementById('btn-wall').classList.remove('active');
});

document.getElementById('btn-wall').addEventListener('click', () => {
    state.tool = 'wall';
    document.getElementById('btn-wall').classList.add('active');
    document.getElementById('btn-house').classList.remove('active');
});

// End turn
document.getElementById('btn-end-turn').addEventListener('click', () => {
    if (state.gameOver) return;
    endTurn();
});

document.getElementById('flood-alert-ok').addEventListener('click', () => {
    document.getElementById('flood-alert').classList.add('hidden');
    checkGameOver();
});

document.getElementById('game-over-restart').addEventListener('click', () => {
    document.getElementById('game-over').classList.add('hidden');
    startGame();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (state.gameOver) return;
    if (e.key === '1' || e.key === 'h') {
        document.getElementById('btn-house').click();
    } else if (e.key === '2' || e.key === 'w') {
        document.getElementById('btn-wall').click();
    } else if (e.key === 'Enter' || e.key === ' ') {
        if (!document.getElementById('flood-alert').classList.contains('hidden')) {
            document.getElementById('flood-alert-ok').click();
        } else {
            endTurn();
        }
    }
});

// ===================== TURN LOGIC ============================

function endTurn() {
    // 1. Collect income
    const income = getIncome();
    state.money += income;

    // 2. Reset house building limit for next turn
    state.housesBuiltThisTurn = 0;

    // 3. Simulate flood
    simulateFlood();

    // 3. Show flood alert
    const alertEl = document.getElementById('flood-alert');
    const alertTitle = document.getElementById('flood-alert-title');
    const alertText = document.getElementById('flood-alert-text');

    if (state.lastFloodMag < 0.3) {
        alertTitle.textContent = '☀️ Calm Turn';
        alertText.textContent = `No significant flooding this turn.\nCollected £${income} income.`;
    } else {
        const severity = state.lastFloodMag >= 4 ? '🌊🌊 Major Flood!' :
                         state.lastFloodMag >= 2 ? '🌊 Flood!' : '💧 Minor Flood';
        alertTitle.textContent = severity;
        let msg = `Flood magnitude: ${state.lastFloodMag.toFixed(2)}m\nIncome collected: £${income}`;
        if (state.overtoppedWalls > 0) {
            msg += `\n🧱 ${state.overtoppedWalls} wall${state.overtoppedWalls > 1 ? 's were' : ' was'} overtopped.`;
        }
        if (state.housesDestroyed > 0) {
            msg += `\n🏚️ ${state.housesDestroyed} house${state.housesDestroyed > 1 ? 's' : ''} destroyed!`;
        } else {
            msg += '\n✅ All houses survived!';
        }
        alertText.textContent = msg;
    }
    alertEl.classList.remove('hidden');

    state.turn++;
    updateHUD();
}

function checkGameOver() {
    if (state.money < 0) state.money = 0;
    if (state.money <= 0 && countHouses() === 0) {
        state.gameOver = true;
        document.getElementById('game-over-text').textContent =
            `You survived ${state.turn - 1} turns before running out of money and houses.`;
        document.getElementById('game-over').classList.remove('hidden');
    }
    updateHUD();
}

// ===================== GAME START ============================

function startGame() {
    initState();
    fitGumbel();
    createGrid();
    resizeCanvas();
    centerCamera();
    initClouds();
    updateHUD();

    document.getElementById('btn-house').classList.add('active');
    document.getElementById('btn-wall').classList.remove('active');
    state.tool = 'house';
}

window.addEventListener('resize', () => {
    resizeCanvas();
});

// Boot
startGame();
render();
